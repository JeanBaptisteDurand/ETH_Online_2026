// La frontiere de types du codec. Il est ecrit en JS parce qu'il sert AUSSI aux scripts de
// build (Node, sans compilation) ; ce fichier la decrit une fois pour le navigateur et les
// tests, au lieu de laisser quatre `@ts-expect-error` dire la meme chose.
export function encodeRows<T>(rows: T[], groupePar?: string): unknown
export function decodeRows<T = unknown>(enc: unknown): T[]
