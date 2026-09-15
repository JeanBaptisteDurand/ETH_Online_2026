/**
 * LE CORPUS, ET RIEN QUE LUI.
 *
 * Ce fichier est la seule source de nombres du service. Il lit `vendor/guard/data/table.json`
 * — les 125 072 mesures du bloc 50 614 000 livrees avec le paquet @tare/guard — et en tire
 * les deux actes de la demo. Aucun bps n'est ecrit a la main ici : les constantes ci-dessous
 * sont des IDENTIFIANTS (un pool, un hook, un sens, une taille), et la valeur qui les
 * accompagne est TOUJOURS relue dans la table.
 *
 * CE QU'IL FAIT QUAND LE BRIEF ET LE CORPUS NE DISENT PAS LA MEME CHOSE. Il ne tranche pas en
 * silence : il rend la valeur du corpus, et il ecrit la divergence dans `divergences`, que
 * /demo/etat publie. Le cas s'est presente : voir ACTE_STOP.
 *
 * Si une valeur manque, le champ vaut null et `motif` dit pourquoi. Jamais zero.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTable, consult, type GuardTable, type TablePool } from "../vendor/guard/src/table.js";
import { poolId as calculerPoolId } from "../vendor/guard/src/poolkey.js";
import type { PoolKey } from "../vendor/guard/src/types.js";

const ICI = dirname(fileURLToPath(import.meta.url));
export const CHEMIN_TABLE = process.env.DEMO_TABLE ?? resolve(ICI, "../vendor/guard/data/table.json");

export const TABLE: GuardTable = assertTable(JSON.parse(readFileSync(CHEMIN_TABLE, "utf8")));

/** USDC sur Base — l'adresse citee par le brief, verifiee contre le corpus a l'amorcage. */
export const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

export type Sens = "0->1" | "1->0";

/** La taille commune aux deux actes : le plus petit point du balayage, 1e12 wei. */
export const TAILLE_WEI = "1000000000000";

/**
 * LES IDENTIFIANTS DES DEUX ACTES.
 *
 * `pool_id_annonce` est ce que le brief de la demo affirme ; il est verifie, pas cru. Quand il
 * ne porte ni le hook ni le prelevement annonces, c'est le triplet (hook, prelevement, taille)
 * qui gagne, parce que trois faits sur quatre pointent le meme pool, et la divergence est
 * publiee.
 */
const REFERENCES = {
  stop: {
    /** Le pool du corpus qui porte le hook et le prelevement annonces. */
    pool_id:
      process.env.DEMO_STOP_POOL ??
      "0xdc3539d6012cafa36bb679c3b268ce1aed33d5dbce7fc170f7730686886c135d",
    hook_annonce: "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
    bps_annonce: 9999.53,
    sens: "1->0" as Sens,
    /** Ce que le brief donnait comme pool. Verifie a l'amorcage, jamais servi tel quel. */
    pool_id_annonce: "0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538",
  },
  substitution: {
    pool_id:
      process.env.DEMO_SUBST_POOL ??
      "0x2fcc6c5ff68b185fee2521a889a0a4e3c17dc7c981349b9ec68614a844ea9aff",
    meilleure_pool_id:
      process.env.DEMO_SUBST_MEILLEURE ??
      "0x0640a8b46f4a47061bb9e742de5551e1c52bcbfd8f662a5da57c6ebe664a5ff5",
    bps_annonce: 4.0933,
    meilleure_bps_annonce: 0,
    sens: "0->1" as Sens,
  },
} as const;

export type NomActe = "stop" | "substitution";

/** Une porte : un pool, un sens, une taille, et ce que le corpus en dit a ce point exact. */
export interface Porte {
  pool_id: string;
  hook: string;
  /** null des que le corpus ne mesure pas ce point ; `motif` dit alors pourquoi. */
  bps: number | null;
  taille_wei: string;
  sens: Sens;
  /** l'etiquette du corpus pour ce point : MEASURED, NOT_QUOTABLE, … */
  etiquette: string;
  /** la raison portee par le corpus (NOT_ENOUGH_LIQUIDITY, …), ou null */
  motif: string | null;
  /** la PoolKey complete, telle que le calldata la portera */
  pool_key: PoolKey;
  /** la monnaie depensee par ce swap dans ce sens */
  monnaie_entree: string;
  monnaie_sortie: string;
  /** true quand la monnaie d'entree est l'ETH natif : `value` porte alors le montant */
  native: boolean;
  fee_is_dynamic: boolean | null;
  stored_lp_fee: number | null;
  block_number: number;
  chain_id: number;
  /** la commande qui rejoue exactement ce point de mesure */
  rejeu: string;
}

export interface Acte {
  nom: NomActe;
  porte: Porte;
  /** la porte de remplacement, quand le corpus en mesure une moins chere. null sinon. */
  meilleure_porte: Porte | null;
  /** l'ecart mesure entre les deux portes, en bps. null des qu'un cote n'est pas mesure. */
  economie_bps: number | null;
  /** l'etat nomme de la substitution, du vocabulaire d'alternative.ts */
  etat: "MEILLEURE_PORTE" | "PORTE_UNIQUE";
  /** la phrase a montrer, deja ecrite, sans nombre qui ne vienne pas du corpus */
  phrase: string;
}

export const ADRESSE_NULLE = "0x0000000000000000000000000000000000000000";

function cleDuPool(p: TablePool): PoolKey {
  return {
    currency0: p.currency0.toLowerCase(),
    currency1: p.currency1.toLowerCase(),
    fee: p.fee,
    tickSpacing: p.tick_spacing,
    hooks: p.hook.toLowerCase(),
  };
}

function rejeuDe(p: TablePool, sens: Sens, taille: string, bloc: number): string {
  return [
    "python3 apps/api/scripts/measure_one.py",
    "--rpc $RPC",
    `--block ${bloc}`,
    `--hooks ${p.hook}`,
    `--currency0 ${p.currency0}`,
    `--currency1 ${p.currency1}`,
    `--fee ${p.fee}`,
    `--tick-spacing ${p.tick_spacing}`,
    `--zero-for-one ${sens === "0->1"}`,
    `--amount-in ${taille}`,
  ].join(" ");
}

/** Lit une porte dans la table. Leve si le pool est absent : mieux vaut ne pas demarrer. */
export function lirePorte(poolId: string, sens: Sens, taille: string): Porte {
  const id = poolId.toLowerCase();
  const p = TABLE.pools[id];
  if (!p) throw new Error(`pool_absent_de_la_table:${id}`);
  const cle = cleDuPool(p);
  const recalcule = calculerPoolId(cle);
  if (recalcule !== id) {
    throw new Error(`pool_id_incoherent: la table indexe ${id} mais keccak(PoolKey) rend ${recalcule}`);
  }
  const c = consult(TABLE, id, p.hook, sens, taille);
  const zeroForOne = sens === "0->1";
  const entree = zeroForOne ? cle.currency0 : cle.currency1;
  const sortie = zeroForOne ? cle.currency1 : cle.currency0;
  return {
    pool_id: id,
    hook: p.hook.toLowerCase(),
    bps: c.bps,
    taille_wei: taille,
    sens,
    etiquette: c.label,
    motif: c.reason,
    pool_key: cle,
    monnaie_entree: entree,
    monnaie_sortie: sortie,
    native: entree === ADRESSE_NULLE,
    fee_is_dynamic: p.fee_is_dynamic,
    stored_lp_fee: p.stored_lp_fee,
    block_number: TABLE.block_number,
    chain_id: TABLE.chain_id,
    rejeu: rejeuDe(p, sens, taille, TABLE.block_number),
  };
}

/** Une divergence entre ce que le brief annonce et ce que le corpus mesure. Publiee, pas tue. */
export interface Divergence {
  acte: NomActe;
  champ: string;
  annonce: string;
  corpus: string;
  consequence: string;
}

const divergences: Divergence[] = [];

function verifier(acte: NomActe, champ: string, annonce: unknown, corpus: unknown, consequence: string): void {
  const a = String(annonce);
  const c = String(corpus);
  if (a !== c) divergences.push({ acte, champ, annonce: a, corpus: c, consequence });
}

function arrondi2(x: number | null): string {
  return x === null ? "null" : x.toFixed(2);
}

function construireStop(): Acte {
  const r = REFERENCES.stop;
  const porte = lirePorte(r.pool_id, r.sens, TAILLE_WEI);
  verifier("stop", "hook", r.hook_annonce, porte.hook, "le hook servi est celui du corpus");
  verifier("stop", "bps", r.bps_annonce.toFixed(2), arrondi2(porte.bps), "le bps servi est celui du corpus");

  // Le pool annonce par le brief existe, mais il ne porte ni ce hook ni ce prelevement.
  const annonce = TABLE.pools[r.pool_id_annonce.toLowerCase()];
  if (annonce && annonce.hook.toLowerCase() !== porte.hook) {
    const c = consult(TABLE, r.pool_id_annonce.toLowerCase(), annonce.hook, "0->1", TAILLE_WEI);
    divergences.push({
      acte: "stop",
      champ: "pool_id",
      annonce: r.pool_id_annonce,
      corpus: porte.pool_id,
      consequence:
        `le pool annonce existe mais porte le hook ${annonce.hook} et ${arrondi2(c.bps)} bps a cette taille ; ` +
        `le pool servi est celui qui porte le hook ${r.hook_annonce} et ${arrondi2(porte.bps)} bps annonces`,
    });
  }

  const phrase =
    porte.bps === null
      ? `Le hook ${porte.hook.slice(0, 10)}… n'est pas mesure sur ce pool a cette taille (${porte.etiquette}) — ce n'est pas zero.`
      : `Le hook ${porte.hook.slice(0, 10)}… prend ${porte.bps.toFixed(2)} bps (${(porte.bps / 100).toFixed(2)} %) ` +
        `a ta taille de ${TAILLE_WEI} wei, mesure au bloc ${porte.block_number}. Aucun autre pool du corpus ne fait cet echange : ` +
        `il n'y a nulle part ou aller, et la seule reponse est de ne pas signer.`;

  return { nom: "stop", porte, meilleure_porte: null, economie_bps: null, etat: "PORTE_UNIQUE", phrase };
}

function construireSubstitution(): Acte {
  const r = REFERENCES.substitution;
  const porte = lirePorte(r.pool_id, r.sens, TAILLE_WEI);
  const meilleure = lirePorte(r.meilleure_pool_id, r.sens, TAILLE_WEI);
  verifier("substitution", "bps", r.bps_annonce.toFixed(4), porte.bps === null ? "null" : porte.bps.toFixed(4), "le bps servi est celui du corpus");
  verifier(
    "substitution",
    "meilleure_bps",
    r.meilleure_bps_annonce.toFixed(4),
    meilleure.bps === null ? "null" : meilleure.bps.toFixed(4),
    "le bps servi est celui du corpus",
  );
  verifier("substitution", "monnaie_sortie", USDC_BASE, porte.monnaie_sortie, "la monnaie servie est celle du corpus");
  verifier("substitution", "monnaie_entree", ADRESSE_NULLE, porte.monnaie_entree, "la monnaie servie est celle du corpus");
  // La comparaison n'a de sens qu'a monnaies, sens et taille identiques — regle 2 et 3
  // d'alternative.ts. On le VERIFIE, on ne le suppose pas.
  if (porte.monnaie_entree !== meilleure.monnaie_entree || porte.monnaie_sortie !== meilleure.monnaie_sortie) {
    throw new Error("portes_non_comparables: les deux pools ne font pas le meme echange");
  }

  const economie =
    porte.bps === null || meilleure.bps === null ? null : Math.round((porte.bps - meilleure.bps) * 1e4) / 1e4;
  const etat = economie !== null && economie > 0 ? "MEILLEURE_PORTE" : "PORTE_UNIQUE";
  const phrase =
    economie === null
      ? "L'une des deux portes n'est pas mesuree a cette taille : on ne compare pas, et on ne propose rien."
      : `Cette porte prend ${porte.bps!.toFixed(4)} bps a ta taille. Une autre porte, mesuree au meme bloc, au meme sens ` +
        `et a la meme taille, prend ${meilleure.bps!.toFixed(4)} bps : ${economie.toFixed(4)} bps d'ecart. ` +
        `C'est le calldata de remplacement qui t'est rendu — c'est toi qui signes, ou pas.`;

  return { nom: "substitution", porte, meilleure_porte: meilleure, economie_bps: economie, etat, phrase };
}

export const ACTES: Record<NomActe, Acte> = {
  stop: construireStop(),
  substitution: construireSubstitution(),
};

export const DIVERGENCES: readonly Divergence[] = divergences;

/** Ce qui a produit les nombres, cite depuis la table elle-meme. */
export const CORPUS = {
  schema: TABLE.schema,
  source: TABLE.source,
  source_sha256: TABLE.source_sha256 ?? null,
  engine_ver: TABLE.engine_ver,
  stub_hash: TABLE.stub_hash,
  chain_id: TABLE.chain_id,
  block_number: TABLE.block_number,
  n_measurements: TABLE.n_measurements,
  n_hooks: TABLE.n_hooks,
  n_pools: TABLE.n_pools,
} as const;
