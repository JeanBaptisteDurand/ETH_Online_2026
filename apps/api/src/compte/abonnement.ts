/**
 * L'ABONNEMENT, LU SUR LA CHAINE — JAMAIS CRU SUR PAROLE.
 *
 * Un compte est abonne si le CONTRAT le dit, pas si notre base le dit. La base n'est qu'un
 * cache de ce qu'on a lu, avec la date de la lecture ; et un cache dont `verifie_le` est nul
 * n'autorise rien. C'est la meme regle que partout ici : une lecture qui n'a pas abouti est
 * un refus motive, jamais une valeur par defaut favorable.
 *
 * Le contrat expose une seule fonction, volontairement :
 *
 *     abonneJusquA(address) -> uint256      horodatage Unix, 0 si jamais abonne
 *
 * Un `uint256` a 0 veut dire « pas abonne », et c'est le seul endroit du projet ou un zero
 * signifie quelque chose — parce qu'il vient d'un `mapping` Solidity dont le zero est la
 * valeur d'absence definie par le langage, pas d'une lecture qui a echoue. La distinction est
 * exactement celle que le corpus fait entre NON_MESURABLE et 0,00 bps, et elle merite d'etre
 * dite : ici, l'echec de lecture rend `null` et `raison`, jamais 0.
 */
import { keccak_256 } from "@noble/hashes/sha3";

export interface ConfigAbonnement {
  contrat: string;
  chainId: number;
  rpc: string;
  /** injectable pour les tests */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface LectureAbonnement {
  /** l'horodatage rendu par le contrat, ou null si la lecture n'a pas abouti */
  jusquA: string | null;
  actifJusquAu: string | null;
  transaction: string | null;
  /** non nul des que quelque chose empeche de conclure a un abonnement actif */
  raison: string | null;
  /** l'appel exact, pour qu'un tiers refasse la lecture */
  rejeu: string;
}

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Les 4 premiers octets de keccak("abonneJusquA(address)"). */
export function selecteur(signature: string): string {
  return "0x" + hex(keccak_256(new TextEncoder().encode(signature))).slice(0, 8);
}

export const SIGNATURE = "abonneJusquA(address)";

/** `eth_call` de `abonneJusquA(adresse)` sur le contrat. */
export async function verifierAbonnement(
  cfg: ConfigAbonnement,
  adresse: string,
): Promise<LectureAbonnement> {
  const sel = selecteur(SIGNATURE);
  const arg = adresse.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = sel + arg;
  const rejeu =
    `cast call ${cfg.contrat} "${SIGNATURE}(uint256)" ${adresse} --rpc-url ${cfg.rpc}`;

  const doFetch = cfg.fetchImpl ?? fetch;
  let brut: unknown;
  try {
    const res = await doFetch(cfg.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: cfg.contrat, data }, "latest"],
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 12000),
    });
    if (!res.ok)
      return {
        jusquA: null, actifJusquAu: null, transaction: null, rejeu,
        raison: `le noeud a repondu HTTP ${res.status} : l'abonnement n'est pas verifie, donc pas actif`,
      };
    brut = await res.json();
  } catch (e) {
    // Un timeout n'est pas « pas abonne » : c'est « on ne sait pas ». On refuse, en le disant.
    return {
      jusquA: null, actifJusquAu: null, transaction: null, rejeu,
      raison: `lecture impossible (${(e as Error).message.slice(0, 90)}) : non verifie, donc pas actif`,
    };
  }

  const r = brut as { result?: string; error?: { message?: string } };
  if (r.error)
    return {
      jusquA: null, actifJusquAu: null, transaction: null, rejeu,
      raison: `le contrat a rejete l'appel : ${r.error.message ?? "sans message"}`,
    };
  if (typeof r.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(r.result))
    return {
      jusquA: null, actifJusquAu: null, transaction: null, rejeu,
      raison: "reponse du noeud illisible : ni un mot hexadecimal ni une erreur nommee",
    };
  // Un `0x` vide veut dire qu'il n'y a pas de code a cette adresse — donc pas de contrat.
  if (r.result === "0x" || r.result === "0x0")
    return {
      jusquA: null, actifJusquAu: null, transaction: null, rejeu,
      raison: `aucun code a ${cfg.contrat} sur la chaine ${cfg.chainId} : le contrat n'est pas deploye la`,
    };

  const secondes = BigInt(r.result);
  if (secondes === 0n)
    return {
      jusquA: "0", actifJusquAu: null, transaction: null, rejeu,
      // Ce zero-la vient du mapping Solidity : c'est une absence DECLAREE, pas une panne.
      raison: "le contrat rend 0 : cette adresse ne s'est jamais abonnee",
    };

  const jusquAu = new Date(Number(secondes) * 1000).toISOString();
  const expire = Number(secondes) * 1000 <= Date.now();
  return {
    jusquA: secondes.toString(),
    actifJusquAu: jusquAu,
    transaction: null,
    rejeu,
    raison: expire ? `abonnement expire le ${jusquAu}` : null,
  };
}

export function configDepuisEnv(env: NodeJS.ProcessEnv = process.env): ConfigAbonnement | null {
  const contrat = env["TARE_ABONNEMENT_CONTRAT"];
  const rpc = env["TARE_ABONNEMENT_RPC"];
  if (!contrat || !rpc) return null;
  return {
    contrat,
    rpc,
    // 84532 = Base Sepolia. Ecrit en repli, pas devine : une mauvaise chaine lirait un
    // contrat qui n'est pas le notre.
    chainId: Number(env["TARE_ABONNEMENT_CHAIN_ID"] ?? "84532"),
  };
}
