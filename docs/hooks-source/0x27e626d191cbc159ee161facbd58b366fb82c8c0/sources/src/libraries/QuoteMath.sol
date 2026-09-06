// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";

/// @notice Q128 conversions between currency0 and currency1 base units.
///
/// The price is `currency1 base-units per ONE currency0 base-unit`, in Q128. For the wBRL pool
/// (currency0 = USDC 6dp, currency1 = wBRL 18dp) at 5.1475 BRL/USDC:
///
///   1 USDC base unit = 1e-6 USDC = 5.1475e-6 BRL = 5.1475e12 wBRL base units
///   priceQ128        = 5.1475e12 * 2**128 ~= 1.75e51        (uint256 max ~1.16e77)
///
/// Folding the decimal mismatch into that single constant is what lets `beforeSwap` do no
/// decimal juggling.
///
/// ROUNDING RULE, applied without exception: the pool never rounds in the taker's favour.
/// Outputs round DOWN, inputs round UP.
library QuoteMath {
    uint256 internal constant Q128 = 1 << 128;

    /// @notice currency0 base units -> currency1 base units, rounded DOWN.
    function c0ToC1(uint256 amount0, uint256 priceQ128) internal pure returns (uint256) {
        return FullMath.mulDiv(amount0, priceQ128, Q128);
    }

    /// @notice currency1 base units -> currency0 base units, rounded DOWN.
    function c1ToC0(uint256 amount1, uint256 priceQ128) internal pure returns (uint256) {
        return FullMath.mulDiv(amount1, Q128, priceQ128);
    }

    /// @notice currency0 base units -> currency1 base units, rounded UP.
    function c0ToC1Up(uint256 amount0, uint256 priceQ128) internal pure returns (uint256) {
        return FullMath.mulDivRoundingUp(amount0, priceQ128, Q128);
    }

    /// @notice currency1 base units -> currency0 base units, rounded UP.
    function c1ToC0Up(uint256 amount1, uint256 priceQ128) internal pure returns (uint256) {
        return FullMath.mulDivRoundingUp(amount1, Q128, priceQ128);
    }

    /// @notice Output for a known input. Rounds DOWN — the taker receives no free base unit.
    function amountOutFor(uint256 amountIn, uint256 priceQ128, bool zeroForOne)
        internal
        pure
        returns (uint256)
    {
        return zeroForOne ? c0ToC1(amountIn, priceQ128) : c1ToC0(amountIn, priceQ128);
    }

    /// @notice Input required for a known output. Rounds UP — the taker pays no free base unit.
    function amountInFor(uint256 amountOut, uint256 priceQ128, bool zeroForOne)
        internal
        pure
        returns (uint256)
    {
        return zeroForOne ? c1ToC0Up(amountOut, priceQ128) : c0ToC1Up(amountOut, priceQ128);
    }
}
