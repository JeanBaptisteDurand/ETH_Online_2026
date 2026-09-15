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

export async function snapshot(): Promise<string> {
  return await rpc<string>("evm_snapshot");
}

export async function revert(id: string): Promise<boolean> {
  return await rpc<boolean>("evm_revert", [id]);
}

export async function ethBalance(adresse: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [adresse, "latest"]));
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
