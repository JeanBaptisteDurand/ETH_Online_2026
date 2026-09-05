/**
 * Les 14 permissions d'un hook v4.
 *
 * Elles ne sont stockees nulle part : elles SONT les 14 bits bas de l'adresse du hook,
 * ce qui est la raison d'etre du minage CREATE2 (Uniswap/v4-core/src/libraries/Hooks.sol).
 *
 * Ce fichier reprend la table de packages/hookflags/src/index.ts. Il la recopie au lieu
 * de l'importer parce que ce paquet n'est pas construit et que la chaine de build de
 * apps/api n'est pas de ce lot. La parite avec le registre officiel n'est pas supposee :
 * __tests__/flags.test.ts la verifie sur les 613 fiches, bit a bit.
 */
import type { FlagName } from "./actions.js";

export const HOOK_FLAG_BITS: Record<FlagName, number> = {
  beforeInitialize: 1 << 13,
  afterInitialize: 1 << 12,
  beforeAddLiquidity: 1 << 11,
  afterAddLiquidity: 1 << 10,
  beforeRemoveLiquidity: 1 << 9,
  afterRemoveLiquidity: 1 << 8,
  beforeSwap: 1 << 7,
  afterSwap: 1 << 6,
  beforeDonate: 1 << 5,
  afterDonate: 1 << 4,
  beforeSwapReturnsDelta: 1 << 3,
  afterSwapReturnsDelta: 1 << 2,
  afterAddLiquidityReturnsDelta: 1 << 1,
  afterRemoveLiquidityReturnsDelta: 1 << 0,
};

export const FLAG_ORDER = Object.keys(HOOK_FLAG_BITS) as FlagName[];

const MASK = (1 << 14) - 1;

export interface DecodedFlags {
  bitmap: number;
  active: FlagName[];
}

export function decodeFlags(hookAddress: string): DecodedFlags {
  const lo = Number(BigInt(hookAddress) & BigInt(MASK));
  return { bitmap: lo, active: FLAG_ORDER.filter((k) => (lo & HOOK_FLAG_BITS[k]) !== 0) };
}

export function hasFlag(hookAddress: string, flag: FlagName): boolean {
  return (decodeFlags(hookAddress).bitmap & HOOK_FLAG_BITS[flag]) !== 0;
}

/**
 * Un hook qui peut deplacer la sortie du swap est un hook qui peut y prendre.
 * C'est une CAPACITE declaree, pas une mesure : elle ne remplace jamais un bps.
 */
export function canAlterSwapOutput(hookAddress: string): boolean {
  const { bitmap } = decodeFlags(hookAddress);
  return (
    (bitmap &
      (HOOK_FLAG_BITS.beforeSwapReturnsDelta | HOOK_FLAG_BITS.afterSwapReturnsDelta)) !==
    0
  );
}
