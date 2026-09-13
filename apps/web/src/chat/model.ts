// LE MODELE DE LECTURE LOCAL.
//
// Le chat recoit des ACTIONS et les execute sur le tableau qui est deja dans le navigateur.
// Ce fichier reconstruit, a partir du meme jeu que le tableau (src/data/dataset.json), les
// quelques agregats dont les actions ont besoin : profils par pool, ecart a sens constant,
// bits de permission, et le JUGEMENT DE DESACCORD registre/mesure.
//
// Ce jugement est le portage EXACT de judge() dans apps/api/src/assistant/store.ts. Les deux
// constantes (NEGLIGIBLE_BPS = 1, NON_FLAT_BPS = 5) sont les memes, et engine.test.ts verifie
// que la selection locale de la demo est celle que le serveur annonce.
//
// Il n'invente rien : aucun point n'est fabrique, aucune valeur n'est completee. Un hook sans
// mesure n'est pas "a zero", il est NON_MESURABLE.

import type { Hook, Row } from '../lib/dataset.ts'
import type { FrLabel } from './types.ts'
import { NEGLIGIBLE_BPS, NON_FLAT_BPS } from './types.ts'

export type DisagreementKind =
  | 'registry-says-not-vanilla-but-nothing-measured'
  | 'registry-says-vanilla-but-measured-takes'
  | null

export interface Disagreement {
  /** `null` veut dire "on ne sait pas". Ce n'est PAS "pas de desaccord". */
  is: boolean | null
  kind: DisagreementKind
  note: string
}

export interface Point {
  rowId: number
  amountIn: string
  zeroForOne: boolean
  direction: '0->1' | '1->0'
  bps: number | null
  label: FrLabel
  blockNumber: number
}

export interface Profile {
  poolId: string
  currency0: string
  currency1: string
  storedLpFee: number | null
  feeIsDynamic: boolean
  blocks: number[]
  points: Point[]
  measured: number
  maxBps: number | null
  minBps: number | null
  /** ecart max-min a SENS CONSTANT : melanger 0->1 et 1->0 inventerait un ecart */
  spreadBps: number | null
  nonFlat: boolean
}

export interface HookNode {
  address: string
  chainId: number
  name: string | null
  chain: string | null
  inRegistry: boolean
  vanillaSwap: boolean | null
  swapAccess: string | null
  auditUrl: string | null
  verifiedSource: boolean | null
  deployer: string | null
  description: string | null
  bpsMax: number | null
  bpsMin: number | null
  measured: number
  rowCount: number
  poolCount: number
  poolCountMeasured: number
  blocks: number[]
  counts: Record<FrLabel, number>
  answerLabel: FrLabel
  worstRowId: number | null
  profiles: Profile[]
  nonFlatProfiles: number
  pools: string[]
  tokens: string[]
  mask: number
  flagBits: boolean[]
  disagreement: Disagreement
}

export interface Model {
  hooks: HookNode[]
  byHook: Map<string, HookNode>
  registryAvailable: boolean
  registryEntries: number
}

/** Ordre de Hooks.sol, du bit 13 au bit 0 — identique a src/lib/flags.ts. */
const FLAG_BITS = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

export function permissionBits(address: string): boolean[] {
  const n = BigInt(address) & 0x3fffn
  return FLAG_BITS.map((b) => ((n >> BigInt(b)) & 1n) === 1n)
}

/** Portage exact de answerLabel() cote serveur : jamais une moyenne, jamais une promotion. */
export function answerLabel(counts: Record<FrLabel, number>, measured: number): FrLabel {
  if (measured > 0) return 'MESURE'
  if (counts.NON_COTABLE > 0 && counts.NON_MESURABLE === 0) return 'NON_COTABLE'
  return 'NON_MESURABLE'
}

/** Portage exact de judge() — apps/api/src/assistant/store.ts. */
export function judge(
  registryAvailable: boolean,
  inRegistry: boolean,
  vanillaSwap: boolean | null,
  maxBps: number | null,
  measured: number,
): Disagreement {
  if (!registryAvailable) return { is: null, kind: null, note: 'no registry loaded: nothing to put it against' }
  if (!inRegistry)
    return {
      is: null,
      kind: null,
      note: 'hook missing from the official registry: there is no claim to contradict',
    }
  if (vanillaSwap === null)
    return { is: null, kind: null, note: 'the registry takes no position on vanillaSwap' }
  if (measured === 0 || maxBps === null)
    return {
      is: null,
      kind: null,
      note: 'no MESURE measurement on this hook: NON_MESURABLE, not a zero',
    }
  if (vanillaSwap === false && maxBps < NEGLIGIBLE_BPS)
    return {
      is: true,
      kind: 'registry-says-not-vanilla-but-nothing-measured',
      note: `the registry says vanillaSwap=false, and the measured maximum stays below the ${NEGLIGIBLE_BPS} bps threshold`,
    }
  if (vanillaSwap === true && maxBps >= NEGLIGIBLE_BPS)
    return {
      is: true,
      kind: 'registry-says-vanilla-but-measured-takes',
      note: `the registry says vanillaSwap=true, and the measurement sees at least ${NEGLIGIBLE_BPS} bps go through`,
    }
  return { is: false, kind: null, note: 'the registry and the measurement point the same way' }
}

function emptyCounts(): Record<FrLabel, number> {
  return { MESURE: 0, INTERPOLE: 0, NON_MESURABLE: 0, NON_COTABLE: 0 }
}

function buildProfiles(rows: Row[]): Profile[] {
  const byPool = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byPool.get(r.pool_id)
    if (arr) arr.push(r)
    else byPool.set(r.pool_id, [r])
  }
  const out: Profile[] = []
  for (const [poolId, list] of byPool) {
    const first = list[0]
    const points: Point[] = list
      .slice()
      .sort((a, b) => {
        if (a.zero_for_one !== b.zero_for_one) return a.zero_for_one ? -1 : 1
        const d = BigInt(a.amount_in) - BigInt(b.amount_in)
        return d < 0n ? -1 : d > 0n ? 1 : 0
      })
      .map((r) => ({
        rowId: r.id,
        amountIn: r.amount_in,
        zeroForOne: r.zero_for_one,
        direction: (r.zero_for_one ? '0->1' : '1->0') as '0->1' | '1->0',
        bps: r.label === 'MESURE' ? r.bps : null,
        label: r.label,
        blockNumber: r.block_number,
      }))
    const measured = points.filter((p) => p.bps !== null)
    let spread: number | null = null
    for (const zfo of [true, false]) {
      const side = measured.filter((p) => p.zeroForOne === zfo).map((p) => p.bps as number)
      if (side.length < 2) continue
      const d = Math.max(...side) - Math.min(...side)
      spread = spread === null ? d : Math.max(spread, d)
    }
    out.push({
      poolId,
      currency0: first.currency0,
      currency1: first.currency1,
      storedLpFee: first.stored_lp_fee,
      feeIsDynamic: first.fee_is_dynamic,
      blocks: [...new Set(list.map((r) => r.block_number))].sort((a, b) => a - b),
      points,
      measured: measured.length,
      maxBps: measured.length ? Math.max(...measured.map((p) => p.bps as number)) : null,
      minBps: measured.length ? Math.min(...measured.map((p) => p.bps as number)) : null,
      spreadBps: spread,
      nonFlat: spread !== null && spread > NON_FLAT_BPS,
    })
  }
  out.sort((a, b) => a.poolId.localeCompare(b.poolId))
  return out
}

export function buildModel(hooks: Hook[], rows: Row[], registryEntries: number): Model {
  const registryAvailable = registryEntries > 0
  const byHookRows = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byHookRows.get(r.hook)
    if (arr) arr.push(r)
    else byHookRows.set(r.hook, [r])
  }

  const nodes: HookNode[] = hooks.map((h) => {
    const mine = byHookRows.get(h.address) ?? []
    const counts = emptyCounts()
    for (const r of mine) counts[r.label] += 1
    const profiles = buildProfiles(mine)
    const tokens = new Set<string>()
    for (const p of profiles) {
      tokens.add(p.currency0)
      tokens.add(p.currency1)
    }
    const reg = h.registry
    return {
      address: h.address,
      chainId: h.chainId,
      name: reg ? reg.name : null,
      chain: reg ? reg.chain : null,
      inRegistry: h.inRegistry,
      vanillaSwap: reg ? reg.vanillaSwap : null,
      swapAccess: reg ? reg.swapAccess : null,
      auditUrl: reg && reg.auditUrl ? reg.auditUrl : null,
      verifiedSource: reg ? reg.verifiedSource : null,
      deployer: reg && reg.deployer ? reg.deployer : null,
      description: reg && reg.description ? reg.description : null,
      bpsMax: h.bpsMax,
      bpsMin: h.bpsMin,
      measured: h.measuredCount,
      rowCount: h.rowCount,
      poolCount: h.poolCount,
      poolCountMeasured: h.poolCountMeasured,
      blocks: h.blocks,
      counts,
      answerLabel: answerLabel(counts, h.measuredCount),
      worstRowId: h.worstRowId,
      profiles,
      nonFlatProfiles: profiles.filter((p) => p.nonFlat).length,
      pools: profiles.map((p) => p.poolId),
      tokens: [...tokens].sort(),
      mask: Number(BigInt(h.address) & 0x3fffn),
      flagBits: permissionBits(h.address),
      disagreement: judge(registryAvailable, h.inRegistry, reg ? reg.vanillaSwap : null, h.bpsMax, h.measuredCount),
    }
  })

  return {
    hooks: nodes,
    byHook: new Map(nodes.map((n) => [n.address, n])),
    registryAvailable,
    registryEntries,
  }
}
