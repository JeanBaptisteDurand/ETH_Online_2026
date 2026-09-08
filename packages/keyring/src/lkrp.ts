/**
 * Le Ledger Key Ring Protocol, avec un transport qu'on choisit.
 *
 * Le CLI de Ledger (`wallet-cli ring`) construit son Device Management Kit avec UN seul
 * transport USB, en dur : sans appareil physique, `ring init` s'arrete sur
 * « No Ledger device found ». Le protocole, lui, ne l'exige pas : le paquet officiel
 * @ledgerhq/hw-ledger-key-ring-protocol expose `device.apdu(transport)` et prend
 * n'importe quel @ledgerhq/hw-transport. On lui donne donc celui qu'on veut — Speculos en
 * developpement, node-hid le jour ou un Nano est branche — et le meme code sert les deux.
 *
 * ATTENTION, le piege qui coute une heure : LKRP ne parle PAS a l'application Ethereum.
 * Il parle a « Ledger Sync » (TRUSTCHAIN_APP_NAME dans le SDK). Un Speculos servant
 * l'app Ethereum repond 0xB00D / 0xB00E — SW_PARSER_INVALID_FORMAT et
 * SW_PARSER_INVALID_VALUE dans src/sw.h de LedgerHQ/app-ledger-sync — parce que ce n'est
 * simplement pas la bonne application.
 */
import type Transport from "@ledgerhq/hw-transport";

export const LKRP_APP_NAME = "Ledger Sync";
export const TRUSTCHAIN_API = "https://trustchain.api.live.ledger.com";

/** Le defi emis par le backend de Ledger, avec le TLV pret a envoyer a l'appareil. */
export interface LkrpChallenge {
  /** l'octet-a-octet que l'appareil attend ; c'est le backend qui le signe */
  tlv: string;
  data: string;
  expiry: string;
  host: string;
}

export async function fetchChallenge(
  api: string = TRUSTCHAIN_API,
  fetchImpl: typeof fetch = fetch,
): Promise<LkrpChallenge> {
  const res = await fetchImpl(`${api}/v1/challenge`);
  if (!res.ok) throw new Error(`defi LKRP refuse: HTTP ${res.status}`);
  const body = (await res.json()) as {
    tlv?: string;
    json?: { challenge?: { data?: string; expiry?: string }; host?: string };
  };
  if (!body.tlv) throw new Error("defi LKRP sans champ tlv — rien a envoyer a l'appareil");
  return {
    tlv: body.tlv,
    data: body.json?.challenge?.data ?? "",
    expiry: body.json?.challenge?.expiry ?? "",
    host: body.json?.host ?? "",
  };
}

/** Ce que l'appareil rend : sa credential derivee de la graine, sa signature, son attestation. */
export interface SeedIdProof {
  publicKey: string;
  signature: string;
  /** 0 = APPLICATION, 1 = DEVICE, 2 = TRUSTCHAIN (challenge_parser.h de l'app) */
  attestationType: number;
  attestationPublicKey: string | null;
  attestation: string | null;
  /** le defi exact qui a ete signe — sans lui, la signature ne prouve rien de datable */
  challenge: string;
}

const hex = (u: unknown): string =>
  u instanceof Uint8Array
    ? Buffer.from(u).toString("hex")
    : Buffer.isBuffer(u)
      ? u.toString("hex")
      : typeof u === "string"
        ? u
        : "";

/**
 * Fait signer le defi par l'appareil. `approve` est appele APRES l'envoi de l'APDU :
 * l'appareil affiche alors sa demande, et c'est a l'appelant de la satisfaire — un humain
 * qui appuie, ou, contre Speculos, une marche dans les ecrans.
 *
 * On ne suppose jamais l'approbation : si `approve` ne fait rien, l'appel echoue, et c'est
 * le bon comportement. Une garde qui s'auto-approuve ne garde rien.
 */
export async function proveSeedId(
  transport: Transport,
  challenge: LkrpChallenge,
  approve: () => Promise<void>,
  // injecte pour les tests : la fabrique du SDK de Ledger
  deviceFactory: (t: Transport) => { getSeedId(data: Uint8Array): Promise<unknown> },
): Promise<SeedIdProof> {
  const dev = deviceFactory(transport);
  const pending = dev.getSeedId(Uint8Array.from(Buffer.from(challenge.tlv, "hex")));
  await approve();
  const raw = (await pending) as {
    pubkeyCredential?: { publicKey?: unknown };
    signature?: unknown;
    attestationType?: number;
    attestationPubkeyCredential?: { publicKey?: unknown };
    attestation?: unknown;
  };

  const publicKey = hex(raw.pubkeyCredential?.publicKey);
  const signature = hex(raw.signature);
  // Une preuve sans cle ou sans signature n'est pas une preuve incomplete : c'est une
  // absence de preuve. On refuse plutot que de rendre des chaines vides.
  if (!publicKey) throw new Error("l'appareil n'a rendu aucune cle publique");
  if (!signature) throw new Error("l'appareil n'a rendu aucune signature");

  return {
    publicKey,
    signature,
    attestationType: raw.attestationType ?? -1,
    attestationPublicKey: hex(raw.attestationPubkeyCredential?.publicKey) || null,
    attestation: hex(raw.attestation) || null,
    challenge: challenge.data,
  };
}
