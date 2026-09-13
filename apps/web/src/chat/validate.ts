// LA REVALIDATION COTE FRONT.
//
// Le serveur valide deja avec Zod. On revalide ici, a la main et sans dependance, pour deux
// raisons qui ne sont pas de la paranoia :
//
//   1. le front execute les actions LUI-MEME sur son jeu local ; ce qu'il execute doit etre
//      exactement ce que le schema autorise, pas ce qu'un flux a bien voulu envoyer ;
//   2. tout objet est STRICT. Si une action arrive avec une cle inconnue — typiquement un
//      { bps: 42 } glisse dans un filtre — elle est REFUSEE. C'est la seule barriere qui
//      empeche un nombre invente d'entrer dans l'interface par la porte des actions.
//
// Aucune action valide ne transporte de resultat de mesure. Les nombres acceptes sont des
// seuils, un bloc, des tailles entieres : des selecteurs, pas des affirmations.

import type { Action, ColumnName, Direction, ExportFormat, Filter, FlagName, SortDir } from './types.ts'
import { API_LABELS, COLUMN_NAMES, FLAG_NAMES } from './types.ts'

export interface ParseOk {
  ok: true
  actions: Action[]
}
export interface ParseErr {
  ok: false
  error: string
  issues: string[]
}
export type ParseResult = ParseOk | ParseErr

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const POOL_RE = /^0x[0-9a-fA-F]{64}$/
const MEASUREMENT_RE = /^m_[0-9a-f]{16}$/
const AMOUNT_RE = /^[1-9][0-9]{0,39}$/

const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json', 'jsonl', 'markdown']
const SORT_DIRS: SortDir[] = ['asc', 'desc']
const DIRECTIONS: Direction[] = ['0->1', '1->0']

class Reject extends Error {}

function fail(msg: string): never {
  throw new Reject(msg)
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${where}: object expected`)
  return v as Record<string, unknown>
}

/** Aucune cle en trop. C'est la regle qui interdit a un nombre de passer en contrebande. */
function strict(o: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) fail(`${where}: unknown key "${k}" (strict object)`)
  }
}

function str(o: Record<string, unknown>, k: string, re: RegExp, where: string): string {
  const v = o[k]
  if (typeof v !== 'string' || !re.test(v)) fail(`${where}.${k}: does not match ${re.source}`)
  return (v as string).toLowerCase()
}

function optNullStr(o: Record<string, unknown>, k: string, re: RegExp, where: string): string | null {
  const v = o[k]
  if (v === undefined || v === null) return null
  if (typeof v !== 'string' || !re.test(v)) fail(`${where}.${k}: does not match ${re.source}`)
  return (v as string).toLowerCase()
}

function bounded(o: Record<string, unknown>, k: string, lo: number, hi: number, where: string): number {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)
    fail(`${where}.${k}: number expected in [${lo} ; ${hi}]`)
  return v as number
}

const FILTER_KEYS = [
  'minBps',
  'maxBps',
  'chain',
  'flag',
  'label',
  'allowlisted',
  'registryDisagrees',
  'hook',
  'pool',
  'nonFlat',
  'measuredOnly',
  'search',
] as const

export function parseFilter(raw: unknown): Filter {
  const o = obj(raw, 'filter')
  strict(o, FILTER_KEYS, 'filter')
  const f: Filter = {}
  if (o.minBps !== undefined) f.minBps = bounded(o, 'minBps', 0, 1_000_000, 'filter')
  if (o.maxBps !== undefined) f.maxBps = bounded(o, 'maxBps', 0, 1_000_000, 'filter')
  if (f.minBps !== undefined && f.maxBps !== undefined && f.minBps > f.maxBps)
    fail('filter: minBps must be <= maxBps')
  if (o.chain !== undefined) {
    if (typeof o.chain !== 'string' || o.chain.length < 1 || o.chain.length > 32)
      fail('filter.chain: string of 1 to 32 characters')
    f.chain = o.chain
  }
  if (o.flag !== undefined) {
    if (!FLAG_NAMES.includes(o.flag as FlagName)) fail(`filter.flag: "${String(o.flag)}" unknown`)
    f.flag = o.flag as FlagName
  }
  if (o.label !== undefined) {
    if (!API_LABELS.includes(o.label as (typeof API_LABELS)[number]))
      fail(`filter.label: "${String(o.label)}" unknown`)
    f.label = o.label as Filter['label']
  }
  for (const k of ['allowlisted', 'registryDisagrees', 'nonFlat', 'measuredOnly'] as const) {
    if (o[k] !== undefined) {
      if (typeof o[k] !== 'boolean') fail(`filter.${k}: boolean expected`)
      f[k] = o[k] as boolean
    }
  }
  if (o.hook !== undefined) f.hook = str(o, 'hook', ADDRESS_RE, 'filter')
  if (o.pool !== undefined) f.pool = str(o, 'pool', POOL_RE, 'filter')
  if (o.search !== undefined) {
    if (typeof o.search !== 'string' || o.search.length < 1 || o.search.length > 64)
      fail('filter.search: string of 1 to 64 characters')
    f.search = o.search
  }
  return f
}

function parseOne(raw: unknown): Action {
  const o = obj(raw, 'action')
  const t = o.type
  if (typeof t !== 'string') fail('action.type: string expected')
  const w = `action[${t}]`
  switch (t) {
    case 'filter':
      strict(o, ['type', 'filter'], w)
      return { type: 'filter', filter: parseFilter(o.filter) }
    case 'sort': {
      strict(o, ['type', 'col', 'dir'], w)
      if (!COLUMN_NAMES.includes(o.col as ColumnName)) fail(`${w}.col: "${String(o.col)}" unknown`)
      if (!SORT_DIRS.includes(o.dir as SortDir)) fail(`${w}.dir: asc|desc expected`)
      return { type: 'sort', col: o.col as ColumnName, dir: o.dir as SortDir }
    }
    case 'highlight': {
      strict(o, ['type', 'hooks'], w)
      if (!Array.isArray(o.hooks) || o.hooks.length > 64) fail(`${w}.hooks: array of 64 max`)
      return {
        type: 'highlight',
        hooks: (o.hooks as unknown[]).map((h, i) => {
          if (typeof h !== 'string' || !ADDRESS_RE.test(h)) fail(`${w}.hooks[${i}]: EVM address expected`)
          return (h as string).toLowerCase()
        }),
      }
    }
    case 'open':
      strict(o, ['type', 'hook', 'pool'], w)
      return { type: 'open', hook: str(o, 'hook', ADDRESS_RE, w), pool: optNullStr(o, 'pool', POOL_RE, w) }
    case 'plotCurve': {
      strict(o, ['type', 'hook', 'pool', 'direction'], w)
      const d = o.direction
      if (d !== undefined && d !== null && !DIRECTIONS.includes(d as Direction))
        fail(`${w}.direction: 0->1 | 1->0 | null`)
      return {
        type: 'plotCurve',
        hook: str(o, 'hook', ADDRESS_RE, w),
        pool: str(o, 'pool', POOL_RE, w),
        direction: (d ?? null) as Direction | null,
      }
    }
    case 'compare':
      strict(o, ['type', 'a', 'b'], w)
      return { type: 'compare', a: str(o, 'a', ADDRESS_RE, w), b: str(o, 'b', ADDRESS_RE, w) }
    case 'measure': {
      strict(o, ['type', 'hook', 'pool', 'sizes', 'directions', 'block'], w)
      const sizes = o.sizes === undefined ? ['1000000000000000'] : o.sizes
      if (!Array.isArray(sizes) || sizes.length < 1 || sizes.length > 8) fail(`${w}.sizes: 1 to 8 sizes`)
      const dirs = o.directions === undefined ? ['0->1'] : o.directions
      if (!Array.isArray(dirs) || dirs.length < 1 || dirs.length > 2) fail(`${w}.directions: 1 or 2 directions`)
      const block = o.block
      if (block !== undefined && block !== null && (!Number.isInteger(block) || (block as number) <= 0))
        fail(`${w}.block: positive integer or null`)
      return {
        type: 'measure',
        hook: str(o, 'hook', ADDRESS_RE, w),
        pool: optNullStr(o, 'pool', POOL_RE, w),
        sizes: (sizes as unknown[]).map((s, i) => {
          if (typeof s !== 'string' || !AMOUNT_RE.test(s))
            fail(`${w}.sizes[${i}]: integer in base units, no leading zero`)
          return s as string
        }),
        directions: (dirs as unknown[]).map((d, i) => {
          if (!DIRECTIONS.includes(d as Direction)) fail(`${w}.directions[${i}]: 0->1 | 1->0`)
          return d as Direction
        }),
        block: (block ?? null) as number | null,
      }
    }
    case 'showTwins':
    case 'showBlastRadius':
    case 'showDeployer':
      strict(o, ['type', 'hook'], w)
      return { type: t, hook: str(o, 'hook', ADDRESS_RE, w) }
    case 'showContradictions':
    case 'showOrphans':
    case 'reset':
    case 'permalink':
      strict(o, ['type'], w)
      return { type: t }
    case 'showEvidence': {
      strict(o, ['type', 'measurementId'], w)
      const v = o.measurementId
      if (typeof v !== 'string' || !MEASUREMENT_RE.test(v)) fail(`${w}.measurementId: m_ + 16 hex`)
      return { type: 'showEvidence', measurementId: v as string }
    }
    case 'columns': {
      strict(o, ['type', 'columns'], w)
      if (!Array.isArray(o.columns) || o.columns.length < 1 || o.columns.length > 7)
        fail(`${w}.columns: 1 to 7 columns`)
      return {
        type: 'columns',
        columns: (o.columns as unknown[]).map((c, i) => {
          if (!COLUMN_NAMES.includes(c as ColumnName)) fail(`${w}.columns[${i}]: "${String(c)}" unknown`)
          return c as ColumnName
        }),
      }
    }
    case 'clarify': {
      strict(o, ['type', 'question'], w)
      const q = o.question
      if (typeof q !== 'string' || q.length < 1 || q.length > 400) fail(`${w}.question: 1 to 400 characters`)
      return { type: 'clarify', question: q as string }
    }
    case 'export': {
      strict(o, ['type', 'format'], w)
      if (!EXPORT_FORMATS.includes(o.format as ExportFormat)) fail(`${w}.format: csv|json|jsonl|markdown`)
      return { type: 'export', format: o.format as ExportFormat }
    }
    default:
      return fail(`action.type: "${t}" is not an action this front end knows how to run`)
  }
}

/** Valide une liste d'actions. Un echec n'est jamais avale : il remonte tel quel. */
export function parseActions(raw: unknown): ParseResult {
  if (!Array.isArray(raw)) return { ok: false, error: 'invalid actions', issues: ['array expected'] }
  if (raw.length > 24) return { ok: false, error: 'invalid actions', issues: ['24 actions at most'] }
  const actions: Action[] = []
  const issues: string[] = []
  for (let i = 0; i < raw.length; i += 1) {
    try {
      actions.push(parseOne(raw[i]))
    } catch (e) {
      issues.push(`[${i}] ${(e as Error).message}`)
    }
  }
  if (issues.length) return { ok: false, error: 'invalid actions', issues }
  return { ok: true, actions }
}
