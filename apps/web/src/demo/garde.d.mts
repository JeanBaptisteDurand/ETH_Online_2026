/**
 * LA FRONTIERE DE TYPES DE garde.mjs — meme role que src/data/codec.d.mts.
 *
 * Elle redit des SIGNATURES, jamais un comportement : tout ce qui decide quelque chose vit
 * dans packages/guard et n'est pas recopie ici. Les unions d'etats sont reprises de
 * ../compte/substitution.ts, ou le site les nomme deja, et src/lib/demo.test.ts verifie
 * qu'elles sont exactement celles des sources du paquet — sans quoi cette frontiere
 * deviendrait une seconde version qui divergerait en silence.
 */
import type { Alternative, Envoi, Porte } from '../compte/substitution.ts'

export type Label = 'MEASURED' | 'INTERPOLATED' | 'NOT_MEASURABLE' | 'NOT_QUOTABLE'
export type Verdict = 'ok' | 'warn' | 'block'
export type Direction = '0->1' | '1->0'

export interface PoolKey {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

export interface SwapLeg {
  at: { command: number; action: number; hop: number }
  actionName: 'SWAP_EXACT_IN_SINGLE' | 'SWAP_EXACT_IN' | 'SWAP_EXACT_OUT_SINGLE' | 'SWAP_EXACT_OUT'
  poolKey: PoolKey
  poolId: string
  zeroForOne: boolean
  direction: Direction
  exactIn: boolean
  amountIn: string | null
  amountOut: string | null
  amountIsOpenDelta: boolean
}

export interface DecodeResult {
  complete: boolean
  router: 'universal-router' | 'not-universal-router'
  selector: string
  commands: string
  legs: SwapLeg[]
  issues: { where: string; reason: string }[]
}

export interface TableHit {
  poolId: string
  hook: string
  direction: Direction
  amountIn: string
  bps: number | null
  label: Label
  reason: string | null
  blockNumber: number
  chainId: number
}

export interface HookContext {
  hook: string
  nMeasurements: number
  nPools: number
  labels: Record<string, number>
  measured: { n: number; bpsMin: number; bpsMedian: number; bpsMax: number; worst: TableHit } | null
}

export interface Consultation {
  label: Label
  bps: number | null
  reason: string | null
  basis: 'exact' | 'interpolated' | 'evidence' | 'none'
  citations: TableHit[]
  hookContext: HookContext | null
}

export interface TablePoint {
  amount_in: string
  bps: number | null
  label: Label
  reason: string | null
  block_number: number
  chain_id: number
}

export interface TablePool {
  hook: string
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  fee_is_dynamic: boolean | null
  stored_lp_fee: number | null
  dirs: Record<string, TablePoint[]>
}

export interface TableHook {
  n: number
  labels: Record<string, number>
  n_pools: number
  pools: string[]
  measured: {
    n: number
    bps_min: number
    bps_median: number
    bps_max: number
    worst: {
      bps: number
      pool_id: string
      amount_in: string
      direction: string
      label: Label
      block_number: number
      chain_id: number
    }
  } | null
}

export interface Seuils {
  warn_bps: number | null
  block_bps: number | null
  derives_de: number
  centiles: Record<string, number | null>
  note: string
}

export interface GuardTable {
  schema: string
  generated_at: string
  source: string
  engine_ver: string | null
  stub_hash: string | null
  chain_id: number
  block_number: number
  blocks: number[]
  n_measurements: number
  n_hooks: number
  n_pools: number
  seuils?: Seuils
  hooks: Record<string, TableHook>
  pools: Record<string, TablePool>
}

export interface Thresholds {
  warnBps: number
  blockBps: number
}

export interface ExactInSingle {
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: bigint
  amountOutMinimum?: bigint
}

export interface OptionsEnvoi {
  cotation: bigint | null
  maintenant: bigint
  toleranceBps?: number
  echeanceSecondes?: bigint
  routeur?: string
  permit2?: string
  proprietaire?: string
}

export type { Alternative, Envoi, Porte }

/* ---------------------------------------------------- calldata.ts + poolkey.ts */

export declare function decodeUniversalRouterCalldata(
  calldata: string,
  opts?: { depth?: number },
): DecodeResult
export declare const ACTIONS: Record<number, SwapLeg['actionName']>
export declare const SELECTOR_EXECUTE_DEADLINE: string
export declare const COMMAND_V4_SWAP: number
export declare function poolId(k: PoolKey): string
export declare function encodePoolKey(k: PoolKey): Uint8Array
export declare const ZERO_ADDRESS: string

/* --------------------------------------------------------- table.ts + verdict.ts */

export declare function assertTable(t: unknown): GuardTable
export declare function consult(
  table: GuardTable,
  poolId: string,
  hook: string,
  direction: Direction,
  amountIn: string | null,
): Consultation
export declare function hookContext(table: GuardTable, hook: string): HookContext | null
export declare function thresholdsFor(table: {
  seuils?: Seuils | undefined
}): Thresholds & { source: 'table' | 'repli'; derivesDe: number | null }
export declare function gradeConsultation(
  c: Consultation,
  t: Thresholds,
  hasHook: boolean,
): { verdict: Verdict; decidedBy: { bps: number; from: 'stated' | 'evidence' } | null }
export declare function gradeBps(bps: number, t: Thresholds): Verdict

/* ---------------------------------------------- alternative.ts + envoi.ts + encode.ts */

export declare function chercherAlternative(
  table: GuardTable,
  poolId: string,
  direction: Direction,
  amountIn: string | null,
): Alternative | null
export declare const ECONOMIE_MIN_BPS: number
export declare function transactionDeRemplacement(alt: Alternative, opts: OptionsEnvoi): Envoi
export declare function plancher(cotation: bigint, toleranceBps: number): bigint
export declare const TOLERANCE_BPS: number
export declare const ECHEANCE_SECONDES: bigint
export declare function encodeUniversalRouterExactInSingle(
  swaps: ExactInSingle[],
  opts?: { deadline?: bigint; settleTake?: boolean },
): string
export declare const PERMIT2: string
export declare const COMMAND_PERMIT2_PERMIT: number
export declare const UNIVERSAL_ROUTER_BASE: string

/* ------------------------------------ injection.ts : l'interception, la vraie */

/** La forme minimale d'une transaction qu'un fournisseur EIP-1193 recoit. */
export interface TxRequest {
  to?: string | null
  from?: string | null
  data?: string | null
  input?: string | null
  value?: string | number | bigint | null
  chainId?: string | number | null
}

/** Ce que la garde a lu d'une transaction. Seuls les champs que l'ecran rend sont declares. */
export interface GuardReport {
  verdict: Verdict
  complete: boolean
  decode: DecodeResult
  findings: {
    leg: SwapLeg
    hook: string
    label: Label
    bps: number | null
    reason: string | null
    basis: 'exact' | 'interpolated' | 'evidence' | 'none'
    citations: TableHit[]
    verdict: Verdict
    sentence: string
    replay: string | null
  }[]
  table: { nMeasurements: number; nHooks: number; nPools: number; blockNumber: number; chainId: number }
  headline: string
  warnings: string[]
  alternative: Alternative | null
}

export interface ApprovalDecision {
  approved: boolean
  by: string
  reason: string
  attestation?: string | null
}

export interface Approver {
  readonly name: string
  approve(report: GuardReport): Promise<ApprovalDecision>
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?: (event: string, cb: (...a: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...a: unknown[]) => void) => void
  [k: string]: unknown
}

/** Le refus rendu a l'appelant : `code` vaut 4001, celui que les dapps savent deja traiter. */
export declare class UserRejectedByGuard extends Error {
  readonly code: 4001
  readonly report: GuardReport
  readonly decision: ApprovalDecision
}

export declare function envelopperProvider(
  provider: Eip1193Provider,
  opts: {
    consulter: (tx: TxRequest) => Promise<GuardReport>
    approver?: Approver
    askOn?: ('ok' | 'warn' | 'block')[]
    onReport?: (report: GuardReport, tx: TxRequest) => void
  },
): Eip1193Provider

export declare function tareGuard(
  tx: TxRequest,
  options: { table: unknown; routers?: string[]; atBlock?: number | null },
): GuardReport
