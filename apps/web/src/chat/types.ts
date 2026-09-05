// LES ACTIONS, COTE FRONT.
//
// Miroir structurel de apps/api/src/assistant/actions.ts. Le serveur valide en sortie avec Zod ;
// le front revalide en entree (validate.ts) parce qu'un front qui fait confiance a ce qu'on lui
// envoie n'est pas un instrument, c'est un afficheur.
//
// REGLE D'OR, la meme des deux cotes : le modele choisit QUOI interroger et explique CE QUI REVIENT.
// IL NE PRODUIT JAMAIS UN NOMBRE. Consequence ici : aucune action ne transporte de resultat de
// mesure. Les seuls nombres acceptes sont des SELECTEURS venus de l'humain (un seuil, un bloc,
// une taille) ou des identifiants. Toute cle inconnue fait echouer la validation.

export const FLAG_NAMES = [
  'beforeInitialize',
  'afterInitialize',
  'beforeAddLiquidity',
  'afterAddLiquidity',
  'beforeRemoveLiquidity',
  'afterRemoveLiquidity',
  'beforeSwap',
  'afterSwap',
  'beforeDonate',
  'afterDonate',
  'beforeSwapReturnsDelta',
  'afterSwapReturnsDelta',
  'afterAddLiquidityReturnsDelta',
  'afterRemoveLiquidityReturnsDelta',
] as const
export type FlagName = (typeof FLAG_NAMES)[number]

export const COLUMN_NAMES = [
  'hook',
  'registre',
  'mesure',
  'pools',
  'mesures',
  'etiquette',
  'audit',
] as const
export type ColumnName = (typeof COLUMN_NAMES)[number]

export const API_LABELS = ['MEASURED', 'INTERPOLATED', 'NOT_MEASURABLE', 'NOT_QUOTABLE'] as const
export type ApiLabel = (typeof API_LABELS)[number]

/** Le jeu du front porte les etiquettes en francais. Ce sont LES MEMES, jamais promues. */
export type FrLabel = 'MESURE' | 'INTERPOLE' | 'NON_MESURABLE' | 'NON_COTABLE'

export const LABEL_FR: Record<ApiLabel, FrLabel> = {
  MEASURED: 'MESURE',
  INTERPOLATED: 'INTERPOLE',
  NOT_MEASURABLE: 'NON_MESURABLE',
  NOT_QUOTABLE: 'NON_COTABLE',
}

export const LABEL_API: Record<FrLabel, ApiLabel> = {
  MESURE: 'MEASURED',
  INTERPOLE: 'INTERPOLATED',
  NON_MESURABLE: 'NOT_MEASURABLE',
  NON_COTABLE: 'NOT_QUOTABLE',
}

export type SortDir = 'asc' | 'desc'
export type Direction = '0->1' | '1->0'
export type ExportFormat = 'csv' | 'json' | 'jsonl' | 'markdown'

/** Le seuil publie du produit. Meme constante que apps/api/src/assistant/store.ts. */
export const NEGLIGIBLE_BPS = 1
/** Un profil est "non plat" si l'ecart max-min a sens constant depasse ca. Meme constante. */
export const NON_FLAT_BPS = 5

export interface Filter {
  minBps?: number
  maxBps?: number
  chain?: string
  flag?: FlagName
  label?: ApiLabel
  allowlisted?: boolean
  registryDisagrees?: boolean
  hook?: string
  pool?: string
  nonFlat?: boolean
  measuredOnly?: boolean
  search?: string
}

export type Action =
  | { type: 'filter'; filter: Filter }
  | { type: 'sort'; col: ColumnName; dir: SortDir }
  | { type: 'highlight'; hooks: string[] }
  | { type: 'open'; hook: string; pool: string | null }
  | { type: 'plotCurve'; hook: string; pool: string; direction: Direction | null }
  | { type: 'compare'; a: string; b: string }
  | {
      type: 'measure'
      hook: string
      pool: string | null
      sizes: string[]
      directions: Direction[]
      block: number | null
    }
  | { type: 'showTwins'; hook: string }
  | { type: 'showBlastRadius'; hook: string }
  | { type: 'showDeployer'; hook: string }
  | { type: 'showContradictions' }
  | { type: 'showOrphans' }
  | { type: 'showEvidence'; measurementId: string }
  | { type: 'reset' }
  | { type: 'columns'; columns: ColumnName[] }
  | { type: 'clarify'; question: string }
  | { type: 'export'; format: ExportFormat }
  | { type: 'permalink' }

export type ActionType = Action['type']

/** L'etat que le chat impose au tableau. C'est tout ce que le chat a le droit de piloter. */
export interface ChatView {
  filter: Filter | null
  sort: { col: ColumnName; dir: SortDir } | null
  columns: ColumnName[] | null
  highlight: string[]
  open: { hook: string; pool: string | null } | null
  curve: { hook: string; pool: string; direction: Direction | null } | null
  compare: [string, string] | null
}

export const EMPTY_VIEW: ChatView = {
  filter: null,
  sort: null,
  columns: null,
  highlight: [],
  open: null,
  curve: null,
  compare: null,
}

/** Ce qui a ete ecarte faute de mesure. Jamais silencieux : une absence n'est pas un zero. */
export interface Withheld {
  hook: string
  name: string | null
  reason: string
  label: FrLabel
}

/** Le compte-rendu d'une action executee par le front, tel qu'il s'affiche dans le chat. */
export interface ActionResult {
  action: Action
  ok: boolean
  note: string
  /** paires cle/valeur, deja formatees : le rendu n'a rien a recalculer */
  lines: { k: string; v: string }[]
  /** adresses concernees, s'il y en a */
  hooks: string[]
  /** un texte a copier tel quel (commande de rejeu, permalien, export) */
  payload: string | null
}

/** La citation telle que le serveur la publie (narrate.ts). Un nombre sans ca ne s'affiche pas. */
export interface Citation {
  token: string
  kind: string
  what: string
  source: string
  measurement_id?: string | null
  hook?: string | null
  pool_id?: string | null
  block_number?: number | null
  amount_in?: string | null
  direction?: string | null
  label?: ApiLabel | null
  replay?: string | null
  derived_from?: string | null
}
