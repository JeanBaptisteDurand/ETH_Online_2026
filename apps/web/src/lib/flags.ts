// Les 14 permissions d'un hook Uniswap v4 SONT les 14 bits de poids faible de son adresse.
// Ce n'est pas une convention documentaire : Hooks.sol lit l'adresse. Aucun RPC n'est necessaire,
// aucun index, aucun backend. `BigInt(addr) & 0x3FFFn` suffit, et la latence est nulle.
//
// Verifie sur l'instantane du registre officiel Uniswap/hooklist commit f850e91 :
// 737 fiches sur 737, 10 318 comparaisons de bits, zero ecart. Voir
// public/data/hooklist.snapshot.json -> flag_bit_check.

export type FlagDef = { bit: number; key: string; short: string; fr: string }

/** Ordre de Hooks.sol, du bit 13 (poids fort du champ) au bit 0. */
export const FLAGS: FlagDef[] = [
  { bit: 13, key: 'beforeInitialize', short: 'BI', fr: 'avant initialisation' },
  { bit: 12, key: 'afterInitialize', short: 'AI', fr: 'apres initialisation' },
  { bit: 11, key: 'beforeAddLiquidity', short: 'BAL', fr: 'avant ajout de liquidite' },
  { bit: 10, key: 'afterAddLiquidity', short: 'AAL', fr: 'apres ajout de liquidite' },
  { bit: 9, key: 'beforeRemoveLiquidity', short: 'BRL', fr: 'avant retrait de liquidite' },
  { bit: 8, key: 'afterRemoveLiquidity', short: 'ARL', fr: 'apres retrait de liquidite' },
  { bit: 7, key: 'beforeSwap', short: 'BS', fr: 'avant swap' },
  { bit: 6, key: 'afterSwap', short: 'AS', fr: 'apres swap' },
  { bit: 5, key: 'beforeDonate', short: 'BD', fr: 'avant donation' },
  { bit: 4, key: 'afterDonate', short: 'AD', fr: 'apres donation' },
  { bit: 3, key: 'beforeSwapReturnsDelta', short: 'BSD', fr: 'avant swap, rend un delta' },
  { bit: 2, key: 'afterSwapReturnsDelta', short: 'ASD', fr: 'apres swap, rend un delta' },
  { bit: 1, key: 'afterAddLiquidityReturnsDelta', short: 'AALD', fr: 'apres ajout, rend un delta' },
  { bit: 0, key: 'afterRemoveLiquidityReturnsDelta', short: 'ARLD', fr: 'apres retrait, rend un delta' },
]

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim())
}

/** Les 14 bits, du bit 13 au bit 0 — meme ordre que FLAGS. Jette si l'adresse est invalide. */
export function permissionBits(address: string): boolean[] {
  const a = address.trim()
  if (!isAddress(a)) throw new Error('adresse invalide')
  const n = BigInt(a) & 0x3fffn
  return FLAGS.map((f) => ((n >> BigInt(f.bit)) & 1n) === 1n)
}

export function permissionMask(address: string): number {
  return Number(BigInt(address.trim()) & 0x3fffn)
}

/** Un hook sans aucun bit de swap ne peut rien prendre sur un swap. C'est verifiable a l'oeil. */
export function touchesSwap(bits: boolean[]): boolean {
  const i = (key: string) => FLAGS.findIndex((f) => f.key === key)
  return bits[i('beforeSwap')] || bits[i('afterSwap')] ||
    bits[i('beforeSwapReturnsDelta')] || bits[i('afterSwapReturnsDelta')]
}
