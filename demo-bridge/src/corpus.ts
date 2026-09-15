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
import { gradeBps, thresholdsFor } from "../vendor/guard/src/verdict.js";
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
  /**
   * L'ACTE D'OUVERTURE. La MEME paire que la substitution : ETH -> USDC, la porte que
   * n'importe qui emprunte.
   *
   * POURQUOI IL A CHANGE. Il visait un hook a 9 999,53 bps sur un ERC-20 obscur — UNE ligne
   * sur 125 072. Ouvrir sur elle, c'est presenter l'exception comme la norme, et c'est
   * exactement ce que ce projet reproche aux autres. L'exception reste accessible sous le nom
   * « queue », pour qui la demande ; elle n'ouvre plus la demonstration.
   *
   * CE QU'IL DEMONTRE MAINTENANT : personne ne pouvait connaitre ce prelevement avant de
   * signer, et refuser sur l'appareil n'envoie rien.
   */
  stop: {
    pool_id:
      process.env.DEMO_STOP_POOL ??
      "0x2fcc6c5ff68b185fee2521a889a0a4e3c17dc7c981349b9ec68614a844ea9aff",
    meilleure_pool_id:
      process.env.DEMO_STOP_MEILLEURE ??
      "0x0640a8b46f4a47061bb9e742de5551e1c52bcbfd8f662a5da57c6ebe664a5ff5",
    sens: "0->1" as Sens,
  },
  /** La meme porte, et le calldata de remplacement qui va avec. */
  substitution: {
    pool_id:
      process.env.DEMO_SUBST_POOL ??
      "0x2fcc6c5ff68b185fee2521a889a0a4e3c17dc7c981349b9ec68614a844ea9aff",
    meilleure_pool_id:
      process.env.DEMO_SUBST_MEILLEURE ??
      "0x0640a8b46f4a47061bb9e742de5551e1c52bcbfd8f662a5da57c6ebe664a5ff5",
    sens: "0->1" as Sens,
  },
  /**
   * LA QUEUE DE LA DISTRIBUTION, gardee accessible et rien de plus.
   *
   * 9 999,53 bps, le maximum du corpus : 54 lignes sur 63 156 depassent 5 000 bps, soit
   * 0,09 %. On la montre si un juge la demande, en disant ce qu'elle est — le bout de la
   * queue, pas le milieu. Le `pool_id` annonce par le brief pour ce cas etait faux : voir
   * `divergences`, publie par /demo/etat.
   */
  queue: {
    pool_id:
      process.env.DEMO_QUEUE_POOL ??
      "0xdc3539d6012cafa36bb679c3b268ce1aed33d5dbce7fc170f7730686886c135d",
    hook_annonce: "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
    bps_annonce: 9999.53,
    sens: "1->0" as Sens,
    /** Ce que le brief donnait comme pool. Verifie a l'amorcage, jamais servi tel quel. */
    pool_id_annonce: "0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538",
  },
} as const;

export type NomActe = "stop" | "substitution" | "queue";

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
  etat: "MEILLEURE_PORTE" | "PORTE_UNIQUE" | "DEJA_LA_MEILLEURE";
  /** le verdict du corpus pour CE prelevement, gradue par verdict.ts et ses centiles */
  verdict: "ok" | "warn" | "block";
  /** la phrase a montrer sur la PAGE, deja ecrite, sans nombre qui ne vienne pas du corpus */
  phrase: string;
  /**
   * LA MEME CHOSE POUR L'APPAREIL, EN UNE LIGNE.
   *
   * L'ecran d'un Nano tient ~43 caracteres ; au-dela il decoupe, et chaque decoupe ajoute un
   * « Press right button to continue message ». Sept ecrans de prose noyaient le chiffre que
   * le presentateur venait justement montrer. Cette ligne-ci porte les MEMES nombres que la
   * phrase — celui de la porte et celui de la meilleure — et rien d'autre.
   */
  resume: string;
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

/** Les seuils du corpus — les centiles de la table, jamais un chiffre rond ecrit a la main. */
const SEUILS = thresholdsFor(TABLE);

/**
 * Le verdict de CE prelevement, gradue par `verdict.ts` du depot avec les centiles de la
 * table : `warn` au 90e, `block` au 99e. On ne decide pas de la severite d'apres le NOM de
 * l'acte — un acte appele « stop » dont la porte prend 4,09 bps ne merite pas `BLOCK`, et
 * l'ecrire serait inventer une gravite que le corpus ne mesure pas.
 */
function verdictDeLaPorte(p: Porte): "ok" | "warn" | "block" {
  if (p.bps === null) return "warn"; // non mesure n'est pas inoffensif, et n'est pas zero
  return gradeBps(p.bps, SEUILS);
}

/** L'ecart entre deux portes, quand les deux sont mesurees. null des qu'un cote manque. */
function economieEntre(a: Porte, b: Porte): number | null {
  if (a.bps === null || b.bps === null) return null;
  return Math.round((a.bps - b.bps) * 1e4) / 1e4;
}

function verifierComparables(a: Porte, b: Porte): void {
  // Regles 2 et 3 d'alternative.ts : meme echange, meme sens, meme taille. On le VERIFIE.
  if (a.monnaie_entree !== b.monnaie_entree || a.monnaie_sortie !== b.monnaie_sortie) {
    throw new Error("portes_non_comparables: les deux pools ne font pas le meme echange");
  }
  if (a.sens !== b.sens || a.taille_wei !== b.taille_wei) {
    throw new Error("portes_non_comparables: sens ou taille differents");
  }
}

/**
 * UNE LIGNE, DEUX NOMBRES. Celui de la porte qu'on signe, et celui de la meilleure — parce
 * que c'est la comparaison qui decide, et qu'elle ne doit pas disparaitre avec la prose.
 * Quand il n'y a pas de meilleure porte mesuree, on le DIT, on ne laisse pas un blanc.
 */
function resumeDeuxPortes(porte: Porte, meilleure: Porte, economie: number | null): string {
  if (porte.bps === null) return `Not measured at this size. Not zero.`;
  if (meilleure.bps === null || economie === null) {
    return `Takes ${porte.bps.toFixed(4)} bps. No better gate measured.`;
  }
  if (economie <= 0) return `Takes ${porte.bps.toFixed(4)} bps. Best measured gate.`;
  return `Takes ${porte.bps.toFixed(4)} bps. Best gate: ${meilleure.bps.toFixed(4)}.`;
}

function bps4(p: Porte): string {
  return p.bps === null ? `not measured (${p.etiquette})` : p.bps.toFixed(4);
}

/**
 * L'acte d'ouverture : ETH -> USDC, la porte que n'importe qui emprunte.
 *
 * Il ne dit plus « il n'y a nulle part ou aller » — c'etait vrai de l'ancien pool extreme, pas
 * de celui-ci. Il dit ce que la porte prend, il dit qu'une autre existe, et il laisse le choix
 * ou il doit etre. Ce qu'il demontre tient en deux faits : ce prelevement n'etait connaissable
 * nulle part avant la signature, et un refus sur l'appareil n'envoie rien.
 */
function construireStop(): Acte {
  const r = REFERENCES.stop;
  const porte = lirePorte(r.pool_id, r.sens, TAILLE_WEI);
  const meilleure = lirePorte(r.meilleure_pool_id, r.sens, TAILLE_WEI);
  verifierComparables(porte, meilleure);
  verifier("stop", "monnaie_entree", ADRESSE_NULLE, porte.monnaie_entree, "la monnaie servie est celle du corpus");
  verifier("stop", "monnaie_sortie", USDC_BASE, porte.monnaie_sortie, "la monnaie servie est celle du corpus");

  const economie = economieEntre(porte, meilleure);
  const etat = economie !== null && economie > 0 ? "MEILLEURE_PORTE" : "DEJA_LA_MEILLEURE";
  // EN ANGLAIS, comme tout ce que l'appareil affiche. C'est l'objet que le jury va fixer
  // pendant trente secondes : un ecran en francais sur un site en anglais est une faute de
  // presentation, et elle coute plus cher que n'importe quelle ligne de code.
  const phrase =
    porte.bps === null
      ? `This gate is not measured at this size (${porte.etiquette}) — that is not zero, and nothing here decides for you.`
      : `This gate takes ${bps4(porte)} bps on your ETH to USDC swap, at your size of ${TAILLE_WEI} wei, ` +
        `measured at block ${porte.block_number}. That number was published nowhere before you signed. ` +
        (economie !== null && economie > 0
          ? `Another gate, measured at the same block, same direction and same size, takes ${bps4(meilleure)} bps: ` +
            `${economie.toFixed(4)} bps apart. `
          : "") +
        `The choice is yours: sign it, substitute it, or refuse — and a refusal on the device sends nothing.`;

  return {
    nom: "stop",
    porte,
    meilleure_porte: meilleure,
    economie_bps: economie,
    etat,
    verdict: verdictDeLaPorte(porte),
    phrase,
    resume: resumeDeuxPortes(porte, meilleure, economie),
  };
}

/** La meme porte, et le calldata de remplacement qui va avec. */
function construireSubstitution(): Acte {
  const r = REFERENCES.substitution;
  const porte = lirePorte(r.pool_id, r.sens, TAILLE_WEI);
  const meilleure = lirePorte(r.meilleure_pool_id, r.sens, TAILLE_WEI);
  verifierComparables(porte, meilleure);
  verifier("substitution", "monnaie_sortie", USDC_BASE, porte.monnaie_sortie, "la monnaie servie est celle du corpus");
  verifier("substitution", "monnaie_entree", ADRESSE_NULLE, porte.monnaie_entree, "la monnaie servie est celle du corpus");

  const economie = economieEntre(porte, meilleure);
  const etat = economie !== null && economie > 0 ? "MEILLEURE_PORTE" : "DEJA_LA_MEILLEURE";
  const phrase =
    economie === null
      ? "One of the two gates is not measured at this size: no comparison is made, and nothing is proposed."
      : `This gate takes ${bps4(porte)} bps at your size. Another gate, measured at the same block, same ` +
        `direction and same size, takes ${bps4(meilleure)} bps: ${economie.toFixed(4)} bps apart. ` +
        `The replacement calldata is handed to you — you sign it, or you do not.`;

  return {
    nom: "substitution",
    porte,
    meilleure_porte: meilleure,
    economie_bps: economie,
    etat,
    verdict: verdictDeLaPorte(porte),
    phrase,
    resume: resumeDeuxPortes(porte, meilleure, economie),
  };
}

/**
 * LA QUEUE DE LA DISTRIBUTION. Le maximum du corpus, montre pour ce qu'il est.
 *
 * Il n'ouvre plus la demonstration : 54 lignes sur 63 156 depassent 5 000 bps. La phrase le
 * dit avec son chiffre, pour qu'on ne puisse pas confondre le bout de la queue et le milieu.
 */
function construireQueue(): Acte {
  const r = REFERENCES.queue;
  const porte = lirePorte(r.pool_id, r.sens, TAILLE_WEI);
  verifier("queue", "hook", r.hook_annonce, porte.hook, "le hook servi est celui du corpus");
  verifier("queue", "bps", r.bps_annonce.toFixed(2), arrondi2(porte.bps), "le bps servi est celui du corpus");

  const annonce = TABLE.pools[r.pool_id_annonce.toLowerCase()];
  if (annonce && annonce.hook.toLowerCase() !== porte.hook) {
    const c = consult(TABLE, r.pool_id_annonce.toLowerCase(), annonce.hook, "0->1", TAILLE_WEI);
    divergences.push({
      acte: "queue",
      champ: "pool_id",
      annonce: r.pool_id_annonce,
      corpus: porte.pool_id,
      consequence:
        `le pool annonce existe mais porte le hook ${annonce.hook} et ${arrondi2(c.bps)} bps a cette taille ; ` +
        `le pool servi est celui qui porte le hook ${r.hook_annonce} et ${arrondi2(porte.bps)} bps annonces`,
    });
  }

  const d = distribution();
  const phrase =
    porte.bps === null
      ? `This pool is not measured at this size (${porte.etiquette}) — that is not zero.`
      : `Hook ${porte.hook.slice(0, 10)}... takes ${porte.bps.toFixed(2)} bps (${(porte.bps / 100).toFixed(2)} %) ` +
        `at your size of ${TAILLE_WEI} wei, measured at block ${porte.block_number}. This is the MAXIMUM of the ` +
        `corpus, and it has to be named as such: ${d.n_au_dessus_de_5000_bps} of ${d.n} measured lines exceed ` +
        `5000 bps, that is ${d.part_au_dessus_de_5000_bps.toFixed(2)} %. The median is ` +
        `${d.mediane_bps.toFixed(2)} bps. This case is the tail, not the middle.`;

  return {
    nom: "queue",
    porte,
    meilleure_porte: null,
    economie_bps: null,
    etat: "PORTE_UNIQUE",
    verdict: verdictDeLaPorte(porte),
    phrase,
    resume:
      porte.bps === null
        ? `Not measured at this size. Not zero.`
        : `Takes ${porte.bps.toFixed(4)} bps. Corpus max of ${d.n}.`,
  };
}

/* ------------------------------------------------- la forme du corpus, pas une anecdote */

export interface Distribution {
  /** le nombre de lignes MESUREES portant une valeur ; les autres n'en ont pas */
  n: number;
  n_mesures_table: number;
  mediane_bps: number;
  moyenne_bps: number;
  p75_bps: number;
  p90_bps: number;
  p95_bps: number;
  p99_bps: number;
  p99_9_bps: number;
  min_bps: number;
  max_bps: number;
  part_au_dessus_de_5_bps: number;
  part_au_dessus_de_50_bps: number;
  part_au_dessus_de_100_bps: number;
  part_au_dessus_de_1000_bps: number;
  part_au_dessus_de_5000_bps: number;
  n_au_dessus_de_1000_bps: number;
  /** le nombre qui remet le cas extreme a sa place */
  n_au_dessus_de_5000_bps: number;
  part_a_zero_bps: number;
  n_a_zero_bps: number;
  /** un hook peut RENDRE plus que le pool n'aurait rendu : ces lignes-la sont negatives */
  n_negatives: number;
  part_negatives: number;
  /** les seuils appliques par la garde, et d'ou ils viennent */
  seuils: { warn_bps: number; block_bps: number; source: string; derives_de: number | null };
  methode: string;
  block_number: number;
  chain_id: number;
}

let _distribution: Distribution | null = null;

/**
 * LA FORME DU CORPUS, CALCULEE ICI ET NON RECOPIEE.
 *
 * Elle existe pour empecher exactement l'erreur qu'on vient de corriger : ouvrir la demo sur
 * une ligne a 9 999,53 bps, c'est montrer le maximum en laissant croire au milieu. Publier la
 * mediane, les centiles et le NOMBRE de lignes extremes remet chaque cas a sa place.
 *
 * LA METHODE EST CELLE DE LA TABLE, deliberement : meme population (label MEASURED portant une
 * valeur), meme rang (`tous[floor(n*q/100)]`, tri croissant) que scripts/build-table.mjs. Un
 * autre estimateur donnerait d'autres centiles pour le MEME corpus — deux chiffres pour la
 * meme phrase, ce que ce projet refuse. Verification : les centiles calcules ici sont
 * identiques a `seuils.centiles` publie dans la table.
 */
export function distribution(): Distribution {
  if (_distribution) return _distribution;
  const tous: number[] = [];
  for (const p of Object.values(TABLE.pools))
    for (const pts of Object.values(p.dirs))
      for (const pt of pts) if (pt.label === "MEASURED" && typeof pt.bps === "number") tous.push(pt.bps);
  tous.sort((a, b) => a - b);
  const n = tous.length;
  if (n === 0) throw new Error("corpus_sans_mesure_chiffree");
  const c = (q: number) => tous[Math.min(n - 1, Math.floor((n * q) / 100))]!;
  const pct = (k: number) => Math.round((10000 * k) / n) / 100;
  const auDessus = (seuil: number) => tous.filter((x) => x > seuil).length;
  const n1000 = auDessus(1000);
  const n5000 = auDessus(5000);
  const nzero = tous.filter((x) => x === 0).length;
  const nneg = tous.filter((x) => x < 0).length;

  _distribution = {
    n,
    n_mesures_table: TABLE.n_measurements,
    mediane_bps: c(50),
    moyenne_bps: Math.round((tous.reduce((s, x) => s + x, 0) / n) * 1e4) / 1e4,
    p75_bps: c(75),
    p90_bps: c(90),
    p95_bps: c(95),
    p99_bps: c(99),
    p99_9_bps: c(99.9),
    min_bps: tous[0]!,
    max_bps: tous[n - 1]!,
    part_au_dessus_de_5_bps: pct(auDessus(5)),
    part_au_dessus_de_50_bps: pct(auDessus(50)),
    part_au_dessus_de_100_bps: pct(auDessus(100)),
    part_au_dessus_de_1000_bps: pct(n1000),
    part_au_dessus_de_5000_bps: pct(n5000),
    n_au_dessus_de_1000_bps: n1000,
    n_au_dessus_de_5000_bps: n5000,
    part_a_zero_bps: pct(nzero),
    n_a_zero_bps: nzero,
    n_negatives: nneg,
    part_negatives: pct(nneg),
    seuils: {
      warn_bps: SEUILS.warnBps,
      block_bps: SEUILS.blockBps,
      source: SEUILS.source,
      derives_de: SEUILS.derivesDe,
    },
    methode:
      "lignes d'etiquette MEASURED portant une valeur ; centiles par rang tous[floor(n*q/100)] " +
      "sur le tri croissant — la meme methode que packages/guard/scripts/build-table.mjs, pour " +
      "que les centiles publies ici et ceux de la table soient les memes nombres",
    block_number: TABLE.block_number,
    chain_id: TABLE.chain_id,
  };
  return _distribution;
}

/** Le seul endroit ou l'on decide si un nom d'acte existe. */
export function EST_ACTE(x: string): x is NomActe {
  return x === "stop" || x === "substitution" || x === "queue";
}

export const ACTES: Record<NomActe, Acte> = {
  stop: construireStop(),
  substitution: construireSubstitution(),
  queue: construireQueue(),
};

/** Les actes que la demo joue, dans l'ordre. `queue` n'y est pas : elle se demande. */
export const ACTES_DE_LA_DEMO: readonly NomActe[] = ["stop", "substitution"];

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
