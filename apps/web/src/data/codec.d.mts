// La frontiere de types du codec. Il est ecrit en JS parce qu'il sert AUSSI aux scripts de
// build (Node, sans compilation) ; ce fichier la decrit une fois pour le navigateur et les
// tests, au lieu de laisser des `@ts-expect-error` dire la meme chose partout.

/** L'encodage d'une colonne, tel que `encodeRows` le choisit en MESURANT la colonne. */
export type Colonne =
  | { k: 'const'; v: unknown }
  | { k: 'pool'; v: unknown[] }
  | { k: 'dict'; d: unknown[]; i: number[] }
  | { k: 'raw'; v: unknown[] }
  | { k: 'seq' }
  | { k: 'groupe' }

export interface Encode {
  n: number
  fields: string[]
  groupePar: string
  groupes: { ids: unknown[]; of: number[] }
  enc: Record<string, Colonne>
}

export function encodeRows<T extends object>(rows: T[], groupePar?: string): Encode
export function decodeRows<T = unknown>(enc: unknown): T[]
