// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SqrtPriceMath } from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";

import { WAD } from "../Constants.sol";
import { SqrtMath } from "./SqrtMath.sol";

/// @notice Pure helpers for maintaining the L-unit ledger.
library LUnitMath {
  /// @notice Convert minted full-range liquidity into L-unit principal (floor).
  function principalFromLiquidity(uint256 liquidityMinted, uint256 borrowIndexWad)
    internal
    pure
    returns (uint128 rLEffective)
  {
    uint256 value = FullMath.mulDiv(liquidityMinted, WAD, borrowIndexWad);
    return SafeCast.toUint128(value);
  }

  /// @notice Compute the real full-range liquidity needed to cover a target principal (ceil).
  function liquidityForPrincipal(uint128 rLTarget, uint256 borrowIndexWad)
    internal
    pure
    returns (uint128 liquidityNeeded)
  {
    uint256 value = FullMath.mulDivRoundingUp(uint256(rLTarget), borrowIndexWad, WAD);
    return SafeCast.toUint128(value);
  }

  /// @notice Calculate geometric mean for full-range position at current price
  /// @dev Used by conservative bridge to determine actual √K value provided for a given liquidity amount.
  ///      This is the core calculation that determines the conservative bridge cap in Vault.applyDebt().
  /// @param tickSpacing Pool tick spacing to determine actual full-range tick bounds
  /// @param liquidityDelta Target liquidity for full-range position (MIN_TICK to MAX_TICK)
  /// @param sqrtPriceX96 Current sqrt price from pool.slot0()
  /// @return geometricMean √(amount0 · amount1) representing actual √K value
  function geometricMeanForLiquidity(int24 tickSpacing, uint128 liquidityDelta, uint160 sqrtPriceX96)
    internal
    pure
    returns (uint256 geometricMean)
  {
    (uint160 minSqrtPriceX96, uint160 maxSqrtPriceX96) = LUnitMath.getActualFullRangePrices(tickSpacing);
    geometricMean = geometricMeanForLiquidity(minSqrtPriceX96, maxSqrtPriceX96, liquidityDelta, sqrtPriceX96);
  }

  /// @notice Calculate geometric mean for full-range position with pre-computed price bounds
  /// @dev Overload for callers that already have minSqrtPriceX96 and maxSqrtPriceX96 cached.
  ///      Used by router to avoid redundant getActualFullRangePrices() calls.
  /// @param minSqrtPriceX96 Sqrt price at minimum tick (from getActualFullRangePrices)
  /// @param maxSqrtPriceX96 Sqrt price at maximum tick (from getActualFullRangePrices)
  /// @param liquidityDelta Target liquidity for full-range position
  /// @param sqrtPriceX96 Current sqrt price from pool.slot0()
  /// @return geometricMean √(amount0 · amount1) representing actual √K value
  function geometricMeanForLiquidity(
    uint160 minSqrtPriceX96,
    uint160 maxSqrtPriceX96,
    uint128 liquidityDelta,
    uint160 sqrtPriceX96
  ) internal pure returns (uint256 geometricMean) {
    // Calculate token amounts needed for full-range position (rounded up per Uniswap convention)
    uint256 amount0 = SqrtPriceMath.getAmount0Delta(sqrtPriceX96, maxSqrtPriceX96, liquidityDelta, true);
    uint256 amount1 = SqrtPriceMath.getAmount1Delta(minSqrtPriceX96, sqrtPriceX96, liquidityDelta, true);

    // Geometric mean = √(amount0 · amount1) with overflow protection
    geometricMean = SqrtMath.sqrtProductLowerBound(amount0, amount1);
  }

  /// @notice Preview conservative bridge impact for full-range repay position.
  /// @dev Call BEFORE repaying to understand potential deviation from geometric mean.
  ///      The relative deviation is M-invariant (same whether borrowIndex = 1.0 or 2.5).
  ///      Users should check relativeDeviation against acceptable thresholds before repaying.
  ///      Note: The geometric mean calculation matches `geometricMeanForLiquidity()`, but this function
  ///      also returns the individual token amounts and deviation metrics for analysis.
  /// @param liquidityDelta Target liquidity to mint for full-range position (MIN_TICK to MAX_TICK)
  /// @param sqrtPriceX96 Current sqrt price from pool.slot0()
  /// @return amount0Required Token0 needed for mint (rounded up per Uniswap)
  /// @return amount1Required Token1 needed for mint (rounded up per Uniswap)
  /// @return geometricMean √(amount0·amount1) - actual √K value provided
  /// @return deviation Absolute |liquidityDelta - geometricMean|
  /// @return relativeDeviation deviation / liquidityDelta (1e18 = 100%)
  function previewConservativeBridge(int24 tickSpacing, uint128 liquidityDelta, uint160 sqrtPriceX96)
    internal
    pure
    returns (
      uint256 amount0Required,
      uint256 amount1Required,
      uint256 geometricMean,
      uint256 deviation,
      uint256 relativeDeviation
    )
  {
    (uint160 minSqrtPriceX96, uint160 maxSqrtPriceX96) = LUnitMath.getActualFullRangePrices(tickSpacing);
    // Compute token amounts for full-range position (MIN_TICK to MAX_TICK)
    // Round up to ensure sufficient tokens are pulled
    amount0Required = SqrtPriceMath.getAmount0Delta(sqrtPriceX96, maxSqrtPriceX96, liquidityDelta, true);
    amount1Required = SqrtPriceMath.getAmount1Delta(minSqrtPriceX96, sqrtPriceX96, liquidityDelta, true);

    // Geometric mean = √(amount0 · amount1) with overflow protection - represents actual √K value
    geometricMean = SqrtMath.sqrtProductLowerBound(amount0Required, amount1Required);

    // Absolute deviation between liquidity and geometric mean
    deviation = liquidityDelta > geometricMean ? liquidityDelta - geometricMean : geometricMean - liquidityDelta;

    // Relative deviation (WAD scale: 1e18 = 100%)
    relativeDeviation = FullMath.mulDiv(deviation, WAD, liquidityDelta);
  }

  function getActualFullRangeTicks(int24 tickSpacing) internal pure returns (int24 minTick, int24 maxTick) {
    minTick = _roundTowardZero(TickMath.MIN_TICK, tickSpacing);
    maxTick = _roundTowardZero(TickMath.MAX_TICK, tickSpacing);
  }

  function getActualFullRangePrices(int24 tickSpacing)
    internal
    pure
    returns (uint160 minSqrtPriceX96, uint160 maxSqrtPriceX96)
  {
    (int24 minTick, int24 maxTick) = getActualFullRangeTicks(tickSpacing);
    minSqrtPriceX96 = TickMath.getSqrtPriceAtTick(minTick);
    maxSqrtPriceX96 = TickMath.getSqrtPriceAtTick(maxTick);
  }

  function _roundTowardZero(int24 value, int24 spacing) private pure returns (int24) {
    int24 remainder = value % spacing;
    if (remainder == 0) return value;
    return value - remainder;
  }
}
