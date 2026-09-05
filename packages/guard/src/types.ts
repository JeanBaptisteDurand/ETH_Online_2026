/**
 * Les types publics de la garde.
 *
 * Regle dure n.2 : les quatre etiquettes sont les memes que celles du moteur et de l'API
 * (apps/api/src/labels.ts). La garde n'en invente pas une cinquieme et n'en promeut aucune.
 * Regle dure n.4 : toute valeur affichee porte son bloc, sa taille et son sens, et se rejoue.
 */

export const LABELS = ["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"] as const;
export type Label = (typeof LABELS)[number];

/** Les seules etiquettes qui ont le droit de porter un nombre. */
export const NUMERIC_LABELS: readonly Label[] = ["MEASURED", "INTERPOLATED"];

export type Verdict = "ok" | "warn" | "block";

export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export type SwapActionName =
  | "SWAP_EXACT_IN_SINGLE"
  | "SWAP_EXACT_IN"
  | "SWAP_EXACT_OUT_SINGLE"
  | "SWAP_EXACT_OUT";

/** Un saut de swap v4, tel qu'il sort du calldata — rien d'interprete encore. */
export interface SwapLeg {
  /** ou on l'a trouve : commande Universal Router, action v4, saut dans le chemin */
  at: { command: number; action: number; hop: number };
  actionName: SwapActionName;
  poolKey: PoolKey;
  /** keccak256(abi.encode(PoolKey)) — meme derivation que engine/tare/poolid.py */
  poolId: string;
  zeroForOne: boolean;
  direction: "0->1" | "1->0";
  /** true si l'utilisateur a fixe l'entree, false s'il a fixe la sortie */
  exactIn: boolean;
  /**
   * Le montant d'entree en plus petite unite, quand le calldata le fixe. Sur un chemin
   * multi-saut seul le premier saut d'un exact-in est connu : les suivants dependent de
   * l'execution. On ecrit null, jamais une estimation.
   */
  amountIn: string | null;
  /** Le montant de sortie quand le calldata le fixe (exact-out), sinon null. */
  amountOut: string | null;
  /**
   * v4 traite un montant a zero comme OPEN_DELTA : "prends tout le solde ouvert". Ce n'est
   * PAS un swap de taille nulle. On le signale ici et on laisse le montant a null, parce
   * qu'un zero recopie tel quel deviendrait "ce swap ne prend rien".
   */
  amountIsOpenDelta: boolean;
}

export interface DecodeIssue {
  where: string;
  reason: string;
}

export interface DecodeResult {
  /** false des qu'une partie du calldata n'a pas pu etre lue jusqu'au bout */
  complete: boolean;
  router: "universal-router" | "not-universal-router";
  selector: string;
  /** les commandes Universal Router rencontrees, en hexa */
  commands: string;
  legs: SwapLeg[];
  issues: DecodeIssue[];
}

/** Une mesure de la table, citee telle quelle. */
export interface TableHit {
  poolId: string;
  hook: string;
  direction: "0->1" | "1->0";
  amountIn: string;
  bps: number | null;
  label: Label;
  reason: string | null;
  blockNumber: number;
  chainId: number;
}

/** Ce qu'on sait dire d'un hook quand le pool exact n'est pas dans la table. */
export interface HookContext {
  hook: string;
  nMeasurements: number;
  nPools: number;
  labels: Record<string, number>;
  measured: {
    n: number;
    bpsMin: number;
    bpsMedian: number;
    bpsMax: number;
    /** la pire mesure du hook, avec sa taille et son sens : citable telle quelle */
    worst: TableHit;
  } | null;
}

export interface Finding {
  leg: SwapLeg;
  hook: string;
  /** l'etiquette de CE pool a CETTE taille — jamais promue */
  label: Label;
  /** null des que l'etiquette ne peut pas porter de nombre */
  bps: number | null;
  reason: string | null;
  /** d'ou vient le verdict : la mesure exacte, une interpolation, ou un simple faisceau */
  basis: "exact" | "interpolated" | "evidence" | "none";
  /** la mesure exacte ou les deux points encadrants */
  citations: TableHit[];
  /** ce que le hook a fait ailleurs, quand ce pool-ci n'est pas mesure */
  hookContext: HookContext | null;
  verdict: Verdict;
  /** une phrase en francais, prete a etre montree */
  sentence: string;
  /** la commande qui rejoue exactement ce point */
  replay: string | null;
}

export interface GuardTableMeta {
  schema: string;
  generatedAt: string;
  source: string;
  engineVer: string | null;
  stubHash: string | null;
  chainId: number;
  blockNumber: number;
  nMeasurements: number;
  nHooks: number;
  nPools: number;
}

export interface GuardReport {
  verdict: Verdict;
  /** true seulement si le calldata a ete lu de bout en bout */
  complete: boolean;
  decode: DecodeResult;
  findings: Finding[];
  table: GuardTableMeta;
  /** l'ecart entre le bloc de la table et le bloc courant, s'il a ete fourni */
  staleness: { tableBlock: number; atBlock: number | null; blocksBehind: number | null };
  /** la ligne unique a montrer a l'humain */
  headline: string;
  warnings: string[];
}

/** La forme minimale d'une transaction EIP-1193 que la garde sait lire. */
export interface TxRequest {
  to?: string | null;
  from?: string | null;
  data?: string | null;
  input?: string | null;
  value?: string | number | bigint | null;
  chainId?: string | number | null;
}

export interface GuardOptions {
  /** au-dela, verdict 'block' (defaut 100 bps = 1 %) */
  blockBps?: number;
  /** au-dela, verdict 'warn' (defaut 25 bps) */
  warnBps?: number;
  /** l'adresse des routeurs acceptes ; par defaut l'Universal Router de Base */
  routers?: string[];
  /** le bloc courant, pour dire de combien la table est en retard */
  atBlock?: number | null;
  /** une table de remplacement (tests, ou table servie par l'API) */
  table?: unknown;
}
