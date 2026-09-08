/**
 * Le trousseau : sceller un secret sous la graine Ledger, l'ouvrir ensuite sans appareil.
 *
 * Le SDK officiel de Ledger (@ledgerhq/ledger-key-ring-protocol) fait tout le travail
 * cryptographique. Ce module ne fait que trois choses qu'il ne fait pas :
 *
 *   1. lui donner un transport CHOISI (Speculos ou un appareil), la ou le CLI package en
 *      impose un seul, USB, en dur — c'est la seule raison pour laquelle `wallet-cli ring
 *      init` exige un Nano et ceci non ;
 *   2. ne jamais ecrire la cle de chiffrement sur le disque (voir store.ts) ;
 *   3. dire ce qui a ete approuve, ecran par ecran, au lieu de rendre un secret sans
 *      histoire.
 *
 * Le SDK est charge par injection : ce fichier ne l'importe pas. Il est publie en
 * CommonJS avec une resolution ESM cassee en amont, et surtout, l'injecter le rend
 * testable sans reseau ni conteneur.
 */
import type { SealedRing, MemberCredentials } from "./store.js";
import { SCHEMA } from "./store.js";

export const LKRP_PROD = "https://trustchain.api.live.ledger.com";
/**
 * Le backend de recette. Il accepte les attestations d'applications compilees localement ;
 * la production ne les accepte pas — elle repond « Attestation is for an unknown
 * application », et c'est normal : notre .elf n'est pas signe par Ledger. Un Nano de
 * production, lui, va en prod.
 */
export const LKRP_STAGING = "https://trustchain-backend.api.aws.stg.ldg-tech.com";

/** L'identifiant d'application du Ledger Key Ring CLI. On construit sur SA trustchain. */
export const APPLICATION_ID = 17;

export interface Trustchain {
  rootId: string;
  walletSyncEncryptionKey: string;
  applicationPath: string;
}

/** La part du SDK de Ledger qu'on utilise. Reduite a ce qui sert, pour pouvoir la doubler. */
export interface TrustchainSdk {
  initMemberCredentials(): Promise<MemberCredentials>;
  getOrCreateTrustchain(
    deviceId: string,
    creds: MemberCredentials,
  ): Promise<{ trustchain: Trustchain }>;
  restoreTrustchain(t: Trustchain, creds: MemberCredentials): Promise<Trustchain>;
  encryptUserData(t: Trustchain, data: Uint8Array): Promise<Uint8Array>;
  decryptUserData(t: Trustchain, data: Uint8Array): Promise<Uint8Array>;
}

export interface SealOptions {
  sdk: TrustchainSdk;
  /** ce qui satisfait les approbations de l'appareil, et rend la trace des ecrans */
  approve: () => Promise<{ screens: string[]; confirmed: boolean }>;
  nom: string;
  secret: string;
  appareil: string;
  physique: boolean;
  backend: string;
  deviceId?: string;
}

export interface SealResult {
  ring: SealedRing;
  /** ce que l'appareil a AFFICHE — la seule chose qui atteste du consentement */
  screens: string[];
}

/**
 * Scelle un secret. Exige l'appareil : c'est l'unique moment ou il sert.
 *
 * L'approbation tourne EN PARALLELE des appels au SDK, parce que l'appareil n'affiche sa
 * demande qu'apres avoir recu l'APDU. Si elle n'aboutit pas, le SDK echoue — et c'est le
 * bon comportement : on ne scelle rien qu'un humain n'a pas approuve.
 */
export async function seal(opts: SealOptions): Promise<SealResult> {
  if (!opts.secret) throw new Error("rien a sceller : le secret est vide");

  const creds = await opts.sdk.initMemberCredentials();

  let screens: string[] = [];
  let confirmed = false;
  const approving = opts
    .approve()
    .then((r) => {
      screens = r.screens;
      confirmed = r.confirmed;
    })
    .catch(() => {
      /* l'echec se voit dans `confirmed`, et le SDK echouera de lui-meme */
    });

  const { trustchain } = await opts.sdk.getOrCreateTrustchain(opts.deviceId ?? "speculos", creds);
  await approving;

  if (!confirmed)
    throw new Error(
      "aucune approbation n'a ete confirmee sur l'appareil — rien n'est scelle. " +
        `ecrans vus : ${JSON.stringify(screens)}`,
    );

  const chiffre = await opts.sdk.encryptUserData(
    trustchain,
    Uint8Array.from(Buffer.from(opts.secret, "utf8")),
  );

  return {
    // Note ce qui n'est PAS ici : trustchain.walletSyncEncryptionKey.
    ring: {
      v: SCHEMA,
      scelle_le: new Date().toISOString(),
      appareil: opts.appareil,
      physique: opts.physique,
      backend: opts.backend,
      rootId: trustchain.rootId,
      membre: creds,
      nom: opts.nom,
      scelle: Buffer.from(chiffre).toString("hex"),
    },
    screens,
  };
}

/**
 * Ouvre un secret scelle. AUCUN appareil.
 *
 * Le membre s'authentifie aupres du backend LKRP, qui lui rend le flux resolu de la
 * trustchain ; la cle de chiffrement s'en deduit. C'est ce qui rend l'agent sans tete
 * possible — « une validation a l'installation, plus aucune ensuite ».
 */
export async function open(sdk: TrustchainSdk, ring: SealedRing): Promise<string> {
  const trustchain = await sdk.restoreTrustchain(
    { rootId: ring.rootId, walletSyncEncryptionKey: "", applicationPath: "" },
    ring.membre,
  );
  if (!trustchain.walletSyncEncryptionKey)
    throw new Error("le backend n'a rendu aucune cle : le membre a-t-il ete revoque ?");

  const clair = await sdk.decryptUserData(
    trustchain,
    Uint8Array.from(Buffer.from(ring.scelle, "hex")),
  );
  const secret = Buffer.from(clair).toString("utf8");
  if (!secret) throw new Error("dechiffrement vide — le scelle ne correspond pas a cette chaine");
  return secret;
}
