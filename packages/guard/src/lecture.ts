/**
 * LES LECTURES ON-CHAIN DONT LA SUBSTITUTION DEPEND.
 *
 * `besoin()` (permit2.ts) exige deux nombres et un plancher de sortie, et ne les invente
 * jamais. Jusqu'ici PERSONNE ne les lisait : le module etait complet et inatteignable. Ce
 * fichier est la piece manquante, et il est volontairement separe du reste de la garde.
 *
 * POURQUOI SEPARE. `tareGuard()` ne fait AUCUN appel reseau — c'est ce qui lui permet de
 * tourner dans une extension hors ligne et de repondre en moins d'une milliseconde. Ce
 * module-la, lui, parle a un noeud. Il n'est importe par personne d'autre que l'appelant qui
 * a decide de payer une latence reseau, et il n'est pas re-exporte dans le chemin
 * navigateur.
 *
 * TROIS ETATS, PARTOUT. Chaque lecture rend `{valeur, raison}` ou `valeur` est null des que
 * la lecture n'a pas abouti, avec la raison ecrite. Un noeud injoignable ne vaut pas zero :
 * un zero d'allowance conduirait a demander une approbation inutile, et un zero de nonce
 * conduirait a faire signer un permit que la chaine rejette.
 */
import { keccak256, toHex } from "./keccak.js";
import type { PoolKey } from "./types.js";

const enc = new TextEncoder();

/** Les 4 premiers octets de keccak(signature) — calcules, jamais recopies a la main. */
export function selecteur(signature: string): string {
  return toHex(keccak256(enc.encode(signature))).slice(0, 10);
}

/** `allowance(address,address)` d'un ERC-20. */
export const SIG_ALLOWANCE_ERC20 = "allowance(address,address)";
/** `allowance(address,address,address)` de Permit2 : (proprietaire, jeton, depensier). */
export const SIG_ALLOWANCE_PERMIT2 = "allowance(address,address,address)";

/** Le V4Quoter sur Base — la meme adresse que celle qu'utilise le moteur de mesure. */
export const V4_QUOTER_BASE = "0x0d5e0f971ed27fbff6c2837bf31316121532048d";
/** `quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))`. */
export const SELECTEUR_QUOTE = "0xaa9d21cb";
/** BaseV4Quoter.sol — le revert que rend un pool qui ne peut pas servir ce swap. */
export const NOT_ENOUGH_LIQUIDITY = "7a5ed734";

function mot(v: bigint | number): string {
  let x = BigInt(v);
  if (x < 0n) x += 1n << 256n;
  return x.toString(16).padStart(64, "0");
}

function motAdresse(a: string): string {
  const s = a.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(s)) throw new Error(`adresse malformee : ${a}`);
  return s.padStart(64, "0");
}

export interface Noeud {
  /** l'URL JSON-RPC. Elle n'est jamais recopiee dans une erreur : elle porte une cle. */
  rpc: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** le bloc a interroger ; "latest" par defaut */
  bloc?: string;
}

/** Ce qu'un `eth_call` rend : un mot hexadecimal, ou une raison. */
export interface Retour {
  data: string | null;
  raison: string | null;
}

/**
 * Un `eth_call`, sans rien supposer.
 *
 * L'URL n'apparait dans AUCUN message d'erreur : sur ce projet elle porte une cle Alchemy, et
 * une cle recopiee dans une reponse HTTP finit dans les journaux de quelqu'un d'autre. C'est
 * la meme redaction que celle posee dans engine/tare/rpc.py.
 */
export async function ethCall(n: Noeud, to: string, data: string): Promise<Retour> {
  const doFetch = n.fetchImpl ?? fetch;
  let brut: unknown;
  try {
    const res = await doFetch(n.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, n.bloc ?? "latest"],
      }),
      signal: AbortSignal.timeout(n.timeoutMs ?? 8000),
    });
    if (!res.ok) return { data: null, raison: `le noeud a repondu HTTP ${res.status}` };
    brut = await res.json();
  } catch (e) {
    const m = (e as Error).message ?? String(e);
    // Le message d'un fetch echoue peut contenir l'URL : on ne le recopie pas tel quel.
    const propre = m.includes("://") ? (e as Error).name || "erreur reseau" : m.slice(0, 120);
    return { data: null, raison: `lecture impossible (${propre})` };
  }
  const r = brut as { result?: string; error?: { message?: string; data?: string } };
  if (r.error) {
    const d = typeof r.error.data === "string" ? r.error.data : "";
    if (d.includes(NOT_ENOUGH_LIQUIDITY))
      return { data: null, raison: "NOT_ENOUGH_LIQUIDITY : ce pool ne peut pas servir ce swap" };
    return { data: null, raison: `appel rejete : ${(r.error.message ?? "sans message").slice(0, 120)}` };
  }
  if (typeof r.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(r.result))
    return { data: null, raison: "reponse illisible : ni un mot hexadecimal ni une erreur nommee" };
  if (r.result === "0x")
    return { data: null, raison: `aucun code a ${to} : le contrat n'est pas deploye sur cette chaine` };
  return { data: r.result, raison: null };
}

function mots(hex: string): string[] {
  const s = hex.replace(/^0x/, "");
  const out: string[] = [];
  for (let i = 0; i + 64 <= s.length; i += 64) out.push(s.slice(i, i + 64));
  return out;
}

/* ------------------------------------------------ 1. allowance ERC-20 -> Permit2 */

export interface LectureAllowance {
  /** le montant lu, en unites du jeton. null = non lu. */
  montant: bigint | null;
  raison: string | null;
  rejeu: string;
}

/**
 * `jeton.allowance(proprietaire, Permit2)`.
 *
 * C'est l'approbation qu'aucune signature ne remplace : sans elle, Permit2 ne peut rien
 * deplacer, et le permit signe est accepte par le routeur puis revert au transfert.
 */
export async function lireAllowanceVersPermit2(
  n: Noeud,
  args: { token: string; proprietaire: string; permit2: string },
): Promise<LectureAllowance> {
  const data = selecteur(SIG_ALLOWANCE_ERC20) + motAdresse(args.proprietaire) + motAdresse(args.permit2);
  const rejeu = `cast call ${args.token} "${SIG_ALLOWANCE_ERC20}(uint256)" ${args.proprietaire} ${args.permit2}`;
  const r = await ethCall(n, args.token, data);
  if (r.data === null) return { montant: null, raison: r.raison, rejeu };
  const w = mots(r.data);
  if (w.length < 1) return { montant: null, raison: "retour trop court pour un uint256", rejeu };
  return { montant: BigInt("0x" + w[0]!), raison: null, rejeu };
}

/* --------------------------------------- 2. allowance Permit2 -> Universal Router */

export interface LectureAutorisation {
  /** null = non lu. Un triplet a zero est une lecture VALIDE qui dit « rien encore ». */
  autorisation: { montant: bigint; expiration: bigint; nonce: bigint } | null;
  raison: string | null;
  rejeu: string;
}

/**
 * `Permit2.allowance(proprietaire, jeton, depensier)` -> (uint160, uint48, uint48).
 *
 * Le `nonce` est la seule raison pour laquelle cet appel est obligatoire : Permit2 rejette un
 * permit dont le nonce n'est pas exactement celui-ci, et il le rejette a l'envoi. Le triplet
 * revient en trois mots de 32 octets, chacun rembourre a gauche.
 */
export async function lireAutorisationDuRouteur(
  n: Noeud,
  args: { permit2: string; proprietaire: string; token: string; spender: string },
): Promise<LectureAutorisation> {
  const data =
    selecteur(SIG_ALLOWANCE_PERMIT2) +
    motAdresse(args.proprietaire) +
    motAdresse(args.token) +
    motAdresse(args.spender);
  const rejeu =
    `cast call ${args.permit2} "${SIG_ALLOWANCE_PERMIT2}(uint160,uint48,uint48)" ` +
    `${args.proprietaire} ${args.token} ${args.spender}`;
  const r = await ethCall(n, args.permit2, data);
  if (r.data === null) return { autorisation: null, raison: r.raison, rejeu };
  const w = mots(r.data);
  if (w.length < 3)
    return {
      autorisation: null,
      raison: `retour de ${w.length} mot(s) au lieu de 3 : le triplet (montant, expiration, nonce) n'est pas lisible`,
      rejeu,
    };
  return {
    autorisation: {
      montant: BigInt("0x" + w[0]!),
      expiration: BigInt("0x" + w[1]!),
      nonce: BigInt("0x" + w[2]!),
    },
    raison: null,
    rejeu,
  };
}

/* ------------------------------------------------------ 3. la cotation vivante */

export interface LectureCotation {
  /** la sortie cotee, en unites du jeton recu. null = non cote. */
  amountOut: bigint | null;
  raison: string | null;
  bloc: string;
  rejeu: string;
}

/** `abi.encode` de l'unique argument de quoteExactInputSingle. */
export function encoderCotation(key: PoolKey, zeroForOne: boolean, amountIn: bigint): string {
  return (
    SELECTEUR_QUOTE +
    mot(0x20) +
    motAdresse(key.currency0) +
    motAdresse(key.currency1) +
    mot(key.fee) +
    mot(key.tickSpacing) +
    motAdresse(key.hooks) +
    mot(zeroForOne ? 1 : 0) +
    mot(amountIn) +
    mot(0x100) + // offset de hookData DANS la struct
    mot(0) // hookData de longueur nulle
  );
}

/**
 * La sortie que ce pool rend MAINTENANT pour cette entree.
 *
 * C'est la seule source acceptable d'un plancher de sortie. Le corpus, lui, est epingle au
 * bloc 50 614 000 : sa colonne `out_with` etait juste ce jour-la et ne l'est plus. Un plancher
 * tire d'une cotation vieille de plusieurs jours est dangereux dans les deux sens — trop haut,
 * la transaction revert toujours ; trop bas, il ne protege de rien. On cote en direct, ou on ne
 * propose pas de transaction envoyable.
 */
export async function coter(
  n: Noeud,
  args: { poolKey: PoolKey; zeroForOne: boolean; amountIn: bigint; quoter?: string },
): Promise<LectureCotation> {
  const quoter = args.quoter ?? V4_QUOTER_BASE;
  const data = encoderCotation(args.poolKey, args.zeroForOne, args.amountIn);
  const bloc = n.bloc ?? "latest";
  const rejeu = `cast call ${quoter} ${data} --block ${bloc}`;
  const r = await ethCall({ ...n, bloc }, quoter, data);
  if (r.data === null) return { amountOut: null, raison: r.raison, bloc, rejeu };
  const w = mots(r.data);
  if (w.length < 1) return { amountOut: null, raison: "retour trop court pour un uint256", bloc, rejeu };
  const out = BigInt("0x" + w[0]!);
  // Un zero de cotation n'est pas une sortie nulle : c'est un pool qui n'a pas su coter.
  if (out === 0n) return { amountOut: null, raison: "le quoteur rend 0 : ce pool ne cote pas cette taille", bloc, rejeu };
  return { amountOut: out, raison: null, bloc, rejeu };
}
