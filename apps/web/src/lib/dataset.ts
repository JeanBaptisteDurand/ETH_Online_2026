import raw from '../data/dataset.json'
// codec.mjs est du JS, partage avec les scripts de build qui tournent sous Node sans
// compilation ; sa frontiere de types est dans codec.d.mts.
import { decodeRows } from '../data/codec.mjs'

export type Label = 'MESURE' | 'INTERPOLE' | 'NON_MESURABLE' | 'NON_COTABLE'

export type Row = {
  id: number
  hook: string
  pool_id: string
  chain_id: number
  block_number: number
  currency0: string
  currency1: string
  key_fee: number
  tick_spacing: number
  fee_is_dynamic: boolean
  stored_lp_fee: number | null
  stored_protocol_fee: number | null
  zero_for_one: boolean
  amount_in: string
  out_with: string | null
  out_without: string | null
  bps: number | null
  label: Label
  reason: string | null
  stub_hash: string
  engine_ver: string
  observed_at: string
}

export type RegistryEntry = {
  address: string
  chain: string
  chainId: number
  name: string
  description: string
  deployer: string
  verifiedSource: boolean
  auditUrl: string
  dynamicFee: boolean
  upgradeable: boolean
  requiresCustomSwapData: boolean
  vanillaSwap: boolean
  swapAccess: string
}

export type Hook = {
  address: string
  chainId: number
  blocks: number[]
  registry: RegistryEntry | null
  inRegistry: boolean
  label: Label
  counts: Record<Label, number>
  rowCount: number
  measuredCount: number
  poolCount: number
  poolCountMeasured: number
  bpsMax: number | null
  bpsMin: number | null
  worstRowId: number | null
  sizes: string[]
  storedLpFees: (number | null)[]
  keyFees: number[]
  dynamicFeeOnChain: boolean
}

export type Dataset = {
  provenance: {
    measurements: {
      path: string
      engine_ver: string
      stub_hash: string
      observed_at: string
      chain_ids: number[]
      blocks: number[]
    }
    registry: {
      source: string
      file: string
      commit: string
      fetched_at: string
      entries: number
      flag_bit_check: { comparisons: number; entries_matching_low14bits: number; entries: number }
      field_census: {
        leaf_fields: number
        numeric_fields: string[]
        boolean_fields: number
        quantitative_fields: string[]
      }
    }
    built_at: string
  }
  totals: {
    rows: number
    measured: number
    hooks: number
    pools: number
    poolsMeasured: number
    over1bps: number
    over1bpsWithZeroStoredFee: number
    hooksAbsentFromRegistry: number
    sizes: number
    labelCounts: Partial<Record<Label, number>>
  }
  hooks: Hook[]
  rows: Row[]
}

// Les lignes arrivent encodees par colonne. Le decodage rend des objets identiques a ceux
// qu'ecrivait la version naive — memes cles, meme ordre, memes valeurs — mais leurs chaines
// repetees sont PARTAGEES au lieu d'etre recopiees 125 072 fois : c'est la que le tas fond.
// `rows_enc` est retire de l'objet rendu, et pas seulement ignore : le laisser dans le spread
// republierait les colonnes encodees sur `dataset`, ou plus personne ne les lit mais ou elles
// resteraient retenues.
const { rows_enc, ...brut } = raw as unknown as Omit<Dataset, 'rows'> & { rows_enc: unknown }

export const dataset: Dataset = { ...brut, rows: decodeRows<Row>(rows_enc) }

export const rowsById = new Map(dataset.rows.map((r) => [r.id, r]))

export function rowsOfHook(address: string): Row[] {
  return dataset.rows.filter((r) => r.hook === address)
}

/**
 * Le profil taille -> bps d'un hook, une serie par (pool, sens).
 * On ne fabrique aucun point : une serie contient exactement les tailles reellement cotees.
 */
export type Series = {
  key: string
  poolId: string
  zeroForOne: boolean
  points: { amountIn: string; x: number; bps: number; rowId: number }[]
  unquotable: number
}

export function profileOf(address: string): Series[] {
  const byKey = new Map<string, Series>()
  for (const r of rowsOfHook(address)) {
    const key = `${r.pool_id}:${r.zero_for_one ? '01' : '10'}`
    let s = byKey.get(key)
    if (!s) {
      s = { key, poolId: r.pool_id, zeroForOne: r.zero_for_one, points: [], unquotable: 0 }
      byKey.set(key, s)
    }
    if (r.label === 'MESURE' && typeof r.bps === 'number') {
      s.points.push({ amountIn: r.amount_in, x: Number(r.amount_in), bps: r.bps, rowId: r.id })
    } else {
      s.unquotable += 1
    }
  }
  for (const s of byKey.values()) s.points.sort((a, b) => a.x - b.x)
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}
