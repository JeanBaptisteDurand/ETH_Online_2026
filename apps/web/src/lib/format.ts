// Aucun nombre ne s'affiche nu. Chaque valeur porte son bloc, sa taille, son sens (§ regle 4).

export function shortAddr(a: string, head = 6, tail = 4): string {
  return a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`
}

/** 1000000000000000 -> "1 000 000 000 000 000". Espaces insecables fines, jamais de virgule. */
export function groupDigits(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Notation courte exacte quand la valeur est une puissance de dix : 1e15. Sinon null. */
export function powerOfTen(s: string): string | null {
  if (!/^10*$/.test(s)) return null
  return `1e${s.length - 1}`
}

export function fmtBps(bps: number | null | undefined, digits = 2): string {
  if (bps === null || bps === undefined) return '—'
  return bps.toFixed(digits)
}

/** bps -> pourcentage, sans jamais reinventer la valeur : 100 bps = 1,00 %. */
export function bpsToPct(bps: number): string {
  return (bps / 100).toFixed(2).replace('.', ',')
}

export function fmtBlock(b: number): string {
  return groupDigits(String(b))
}

export const CHAINS: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bnb',
  130: 'unichain',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avalanche',
}

export function chainName(id: number): string {
  return CHAINS[id] ?? `chainid ${id}`
}

/** Le sens du swap, dit en toutes lettres et pas en booleen. */
export function direction(zeroForOne: boolean): string {
  return zeroForOne ? 'currency0 → currency1' : 'currency1 → currency0'
}

export function inputCurrency(row: { zero_for_one: boolean; currency0: string; currency1: string }) {
  return row.zero_for_one ? row.currency0 : row.currency1
}

/**
 * La commande de rejeu d'une mesure. Elle est reelle : elle importe le moteur du depot et
 * refait le meme calcul contre un fork anvil epingle au meme bloc. Verifiee a la main sur la
 * ligne 0 du jeu de donnees (99,9557 bps, meme pool_id).
 */
export function replayCommand(row: {
  currency0: string
  currency1: string
  key_fee: number
  tick_spacing: number
  hook: string
  zero_for_one: boolean
  amount_in: string
  block_number: number
}): string {
  return (
    `cd engine && python3 -c "from tare.poolid import PoolKey; from tare.measure import measure; ` +
    `print(measure('http://127.0.0.1:8545', ` +
    `PoolKey('${row.currency0}','${row.currency1}',${row.key_fee},${row.tick_spacing},'${row.hook}'), ` +
    `${row.zero_for_one ? 'True' : 'False'}, ${row.amount_in}, ${row.block_number}))"`
  )
}

/**
 * Selecteurs d'erreur connus, repris de engine/tare/quote.py. On decode ce que le moteur decode,
 * rien de plus : un selecteur inconnu reste un selecteur, jamais une explication inventee.
 */
const REVERT_SELECTORS: Record<string, string> = {
  '7a5ed734': 'NotEnoughLiquidity — le pool ne peut pas absorber cette taille',
}

export function explainReason(reason: string | null): string | null {
  if (!reason) return null
  const key = reason.replace(/^0x/, '').slice(0, 8).toLowerCase()
  return REVERT_SELECTORS[key] ?? null
}

export const FORK_COMMAND =
  'docker compose up -d anvil   # fork Base epingle au bloc 50614000'
