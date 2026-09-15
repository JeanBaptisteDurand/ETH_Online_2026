/**
 * LE FORK DE LA DEMO, ET LUI SEUL.
 *
 * 127.0.0.1:8546 — le SECOND anvil, celui qui est expose en https://rpc.tare-hooks.tech.
 * Le moteur de mesure en production vit sur 8545 et ce fichier ne le connait pas : l'URL est
 * lue dans DEMO_RPC et n'a pas d'autre defaut.
 *
 * Aucune boucle, aucun balayage : chaque route fait un nombre BORNE d'appels, et tous vont a
 * un fork local — aucune requete de ce service n'atteint le fournisseur payant.
 */
import { keccak256, toHex } from "../vendor/guard/src/keccak.js";
import { hexToBytes } from "../vendor/guard/src/abi.js";

const RPC = process.env.DEMO_RPC ?? "http://127.0.0.1:8546";
/**
 * L'URL publique du meme fork, celle que le portefeuille de l'utilisateur ajoute.
 *
 * LE DEFAUT EST LE CHEMIN MEME-ORIGINE, PAS LE SOUS-DOMAINE, et c'est un choix mesure :
 * `fork.rpc` est la valeur que la page donne a MetaMask, donc elle doit designer une URL
 * REELLEMENT JOIGNABLE. Au moment ou la demo a ete montee, demo./rpc./speculos.tare-hooks.tech
 * n'avaient aucun enregistrement DNS — donc aucun certificat emissible, donc rien au bout.
 * https://tare-hooks.tech/rpc sert le meme anvil (127.0.0.1:8546) sur un nom qui resout deja
 * et un certificat deja emis. Le sous-domaine reste publie a cote, et prendra le relais des
 * que son A record existera : DEMO_RPC_PUBLIC=https://rpc.tare-hooks.tech suffit.
 */
export const RPC_PUBLIC = process.env.DEMO_RPC_PUBLIC ?? "https://tare-hooks.tech/rpc";
/** Le meme fork par son sous-domaine dedie — joignable seulement une fois le DNS pose. */
export const RPC_SOUS_DOMAINE = process.env.DEMO_RPC_SOUS_DOMAINE ?? "https://rpc.tare-hooks.tech";

/**
 * LE BLOC EPINGLE. C'est celui du corpus, et c'est l'etat auquel tout rembobinage doit
 * ramener : un bandeau qui annonce 50 614 001 dit que les chiffres montres ne sont plus ceux
 * qui ont ete mesures.
 */
export const BLOC_EPINGLE = Number(process.env.DEMO_BLOC ?? 50614000);

export class ErreurFork extends Error {}

let compteur = 1;

export async function rpc<T = unknown>(method: string, params: unknown[] = [], timeoutMs = 10000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: compteur++, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ErreurFork(`fork_injoignable: ${(e as Error).name || "erreur reseau"} sur ${method}`);
  }
  if (!res.ok) throw new ErreurFork(`fork_http_${res.status}: ${method}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new ErreurFork(`fork_rejette ${method}: ${(j.error.message ?? "sans message").slice(0, 160)}`);
  if (j.result === undefined) throw new ErreurFork(`fork_sans_resultat: ${method}`);
  return j.result;
}

export function hex(v: bigint): string {
  return "0x" + v.toString(16);
}

export async function chainId(): Promise<number> {
  return Number(BigInt(await rpc<string>("eth_chainId")));
}

export async function blockNumber(): Promise<number> {
  return Number(BigInt(await rpc<string>("eth_blockNumber")));
}

export async function setBalance(adresse: string, wei: bigint): Promise<void> {
  await rpc("anvil_setBalance", [adresse, hex(wei)]);
}

/**
 * FIGER L'HORLOGE DU FORK, ET POURQUOI C'EST LA VRAIE CORRECTION.
 *
 * Le fork est epingle au bloc 50 614 000. Son HORLOGE, elle, ne l'etait pas : anvil donne a
 * chaque nouveau bloc l'horodatage du precedent PLUS LE TEMPS REEL ECOULE depuis le dernier
 * bloc mine. Trente secondes de discours, et le bloc qui execute le swap n'est plus dans le
 * meme contexte temporel que la mesure.
 *
 * CE QUE CA CASSAIT, mesure en forcant l'horodatage du bloc et en envoyant le MEME calldata :
 *
 *     +   0 s  status 0x1  2444 USDC        +  60 s  status 0x0  0
 *     +   1 s  status 0x1  2444 USDC        + 120 s  status 0x0  0
 *     +  10 s  status 0x0  0                + 300 s  status 0x1  2444 USDC
 *     +  30 s  status 0x1  2444 USDC
 *
 * Ni monotone, ni progressif : le hook de la porte de remplacement (frais dynamiques) rend
 * 2444 ou rien selon l'horodatage du bloc. C'est ce qui produisait « 4 reussites, 6 echecs »
 * sur dix envois du calldata STRICTEMENT identique, et ce qu'une tolerance plus large ne
 * pouvait pas reparer : ce n'est pas une derive de prix, c'est un interrupteur.
 *
 * `anvil_setBlockTimestampInterval(0)` donne a chaque nouveau bloc l'horodatage du precedent.
 * Le temps de la chaine cesse d'avancer, le swap s'execute dans le contexte EXACT ou le
 * corpus a mesure, et le chiffre montre redevient le chiffre execute. Verifie : dix envois
 * espaces de vingt secondes, 10 reussites, 2444 USDC a chaque fois.
 *
 * Ce n'est pas un maquillage : c'est ce que « fork epingle au bloc 50 614 000 » voulait dire
 * depuis le debut. Sur un reseau reel, l'horloge avance et ce hook ferait autre chose — et
 * c'est precisement le genre de fait que TARE existe pour mesurer.
 */
export async function figerHorloge(): Promise<{ fige: boolean; motif: string | null }> {
  try {
    await rpc("anvil_setBlockTimestampInterval", [0]);
    return { fige: true, motif: null };
  } catch (e) {
    return { fige: false, motif: `horloge_non_figee: ${(e as Error).message.slice(0, 140)}` };
  }
}

export async function snapshot(): Promise<string> {
  return await rpc<string>("evm_snapshot");
}

export async function revert(id: string): Promise<boolean> {
  return await rpc<boolean>("evm_revert", [id]);
}

export async function ethBalance(adresse: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [adresse, "latest"]));
}

/* ------------------------------------------------- crediter un portefeuille de demo */

/**
 * L'EMPLACEMENT DU MAPPING DES SOLDES DANS USDC, ET POURQUOI IL EST ECRIT ICI.
 *
 * Crediter de l'ETH est trivial (`anvil_setBalance`). Crediter un ERC-20 ne l'est pas : il
 * faut ECRIRE dans le stockage du contrat, a l'emplacement exact ou il range le solde. Pour
 * un mapping Solidity, Solidity le calcule ainsi :
 *
 *     emplacement = keccak256(pad32(adresse) ++ pad32(numero_du_mapping))
 *
 * Le numero du mapping `balances` d'USDC sur Base vaut **9**. Il n'est PAS devine : il a ete
 * verifie a la main — ecriture a cet emplacement, puis `balanceOf` relu, qui a rendu la valeur
 * ecrite. Et ce fichier le REVERIFIE a chaque credit : si la relecture ne rend pas le montant
 * ecrit, on ne dit pas « credite », on dit ce qu'on a lu. Un solde annonce et absent ferait
 * echouer la demo en direct sans prevenir, ce qui est pire que de ne pas crediter du tout.
 */
export const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const USDC_EMPLACEMENT_SOLDES = Number(process.env.DEMO_USDC_SLOT ?? 9);
/** USDC a 6 decimales : 10 000 USDC = 10 000 000 000 unites. */
export const USDC_DECIMALES = 6;

function mot32(x: bigint | string): string {
  if (typeof x === "string") return x.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return x.toString(16).padStart(64, "0");
}

/** keccak256(pad32(cle) ++ pad32(emplacement)) — la derivation Solidity, pas une supposition. */
export function emplacementDuSolde(adresse: string, emplacement = USDC_EMPLACEMENT_SOLDES): string {
  const brut = mot32(adresse) + mot32(BigInt(emplacement));
  return toHex(keccak256(hexToBytes("0x" + brut)));
}

export async function setStorageAt(contrat: string, emplacement: string, valeur: string): Promise<void> {
  await rpc("anvil_setStorageAt", [contrat, emplacement, "0x" + mot32(valeur.replace(/^0x/, ""))]);
}

/**
 * Credite un ERC-20 en ecrivant son stockage, PUIS relit le solde pour verifier.
 * Rend ce qui a ete LU, jamais ce qu'on a voulu ecrire.
 */
export async function crediterErc20(
  jeton: string,
  adresse: string,
  montant: bigint,
  emplacement = USDC_EMPLACEMENT_SOLDES,
): Promise<{ ok: boolean; lu: bigint | null; motif: string | null }> {
  const cle = emplacementDuSolde(adresse, emplacement);
  try {
    await setStorageAt(jeton, cle, montant.toString(16));
  } catch (e) {
    return { ok: false, lu: null, motif: `ecriture_refusee: ${(e as Error).message.slice(0, 120)}` };
  }
  const lu = await erc20Balance(jeton, adresse).catch(() => null);
  if (lu === null) return { ok: false, lu: null, motif: "relecture_impossible: balanceOf n'a rien rendu de lisible" };
  // Un solde a zero relu apres avoir ecrit zero est une REUSSITE, pas une absence de lecture.
  if (lu !== montant) {
    return {
      ok: false,
      lu,
      motif:
        `relecture_divergente: ecrit ${montant} a l'emplacement ${emplacement}, relu ${lu}. ` +
        `Le numero du mapping des soldes n'est peut-etre pas ${emplacement} sur ce jeton.`,
    };
  }
  return { ok: true, lu, motif: null };
}

/** balanceOf(address) — le selecteur est ecrit ici parce qu'il est universel et verifiable. */
const SEL_BALANCE_OF = "0x70a08231";

export async function erc20Balance(jeton: string, adresse: string): Promise<bigint | null> {
  const a = adresse.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = await rpc<string>("eth_call", [{ to: jeton, data: SEL_BALANCE_OF + a }, "latest"]);
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(data) || data === "0x") return null;
  return BigInt(data);
}

/** L'etat du fork, lu en deux appels. Aucune valeur n'est mise en cache : elle bougerait. */
export async function etatFork(): Promise<{ chain_id: number; block_number: number; rpc: string }> {
  const [c, b] = await Promise.all([chainId(), blockNumber()]);
  return { chain_id: c, block_number: b, rpc: RPC_PUBLIC };
}
