// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice PROTOTYPE — out of audit scope. The only new math the JIT-range shape needs: the
///         desk's Q128 price mapped onto the curve's coordinates, with every rounding chosen
///         adverse to the taker.
///
/// The desk prices in `priceQ128` (currency1 base units per ONE currency0 base unit, Q128), the
/// curve in `sqrtPriceX96`. The two are related by `(sqrtPriceX96 / 2^96)^2 = priceQ128 / 2^128`,
/// so `sqrtPriceX96 = sqrt(priceQ128 << 64)` — floor sqrt, from OpenZeppelin's `Math` because
/// v4-core ships no integer sqrt.
library JITMath {
    uint256 internal constant Q96 = 1 << 96;

    error PriceOutOfTickRange();
    error TickOutOfRange();

    /// @notice `priceQ128` -> the curve's sqrt price. Floor rounding; the one-tick alignment in
    ///         `edgeRange` dominates the half-ulp lost here.
    function sqrtPriceX96FromPriceQ128(uint256 priceQ128) internal pure returns (uint160) {
        // `priceQ128 << 64` must fit; every FX-magnitude price does by a wide margin
        // (wBRL ~1.75e51 << 64 ~ 3.2e70 vs 2^256 ~ 1.16e77).
        if (priceQ128 == 0 || priceQ128 >= (1 << 192)) revert PriceOutOfTickRange();
        uint256 s = Math.sqrt(priceQ128 << 64);
        if (s < TickMath.MIN_SQRT_PRICE || s > TickMath.MAX_SQRT_PRICE) revert PriceOutOfTickRange();
        return uint160(s);
    }

    /// @notice The one-spacing-wide range whose NEAR edge sits at the effective price, aligned
    ///         adverse to the taker.
    ///
    /// zeroForOne: the swap moves price DOWN through the range, so the near edge is `tickUpper`
    /// and the fill executes in `[price(lower), price(upper)]` — at or below the effective price,
    /// never above it (a lower price pays the zeroForOne taker less). Alignment therefore rounds
    /// the edge DOWN. oneForZero mirrors: near edge is `tickLower`, rounded UP.
    ///
    /// @return tickLower  Range lower tick, spacing-aligned.
    /// @return tickUpper  Range upper tick, spacing-aligned.
    /// @return targetSqrt The near edge's sqrt price — where the corrective swap parks the pool
    ///                    before injection, so the position is single-sided in the output token.
    function edgeRange(uint256 effPriceQ128, bool zeroForOne, int24 tickSpacing)
        internal
        pure
        returns (int24 tickLower, int24 tickUpper, uint160 targetSqrt)
    {
        uint160 sqrtEff = sqrtPriceX96FromPriceQ128(effPriceQ128);
        // Floor tick: price(t) <= sqrtEff < price(t + 1).
        int24 t = TickMath.getTickAtSqrtPrice(sqrtEff);

        if (zeroForOne) {
            tickUpper = _floorTo(t, tickSpacing);
            tickLower = tickUpper - tickSpacing;
            targetSqrt = TickMath.getSqrtPriceAtTick(tickUpper);
        } else {
            // Ceil to the next tick unless sqrtEff sits exactly on one, then ceil to spacing.
            int24 up = TickMath.getSqrtPriceAtTick(t) == sqrtEff ? t : t + 1;
            tickLower = _ceilTo(up, tickSpacing);
            tickUpper = tickLower + tickSpacing;
            targetSqrt = TickMath.getSqrtPriceAtTick(tickLower);
        }
        if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) revert TickOutOfRange();
    }

    /// @notice Liquidity that guarantees the range holds at least `amount` of the OUTPUT token.
    ///         Rounds UP — v4-periphery's `LiquidityAmounts` rounds down, which here would size a
    ///         range that comes up a wei short and turn a full fill into a `PartialFill` revert.
    function liquidityForOutput(uint256 amount, uint160 sqrtLower, uint160 sqrtUpper, bool zeroForOne)
        internal
        pure
        returns (uint128)
    {
        uint256 delta = uint256(sqrtUpper) - uint256(sqrtLower);
        uint256 liq;
        if (zeroForOne) {
            // Output is token1: amount1 = L * (sqrtUpper - sqrtLower) / Q96.
            liq = FullMath.mulDivRoundingUp(amount, Q96, delta);
        } else {
            // Output is token0: amount0 = L * (sqrtUpper - sqrtLower) * Q96 / (sqrtUpper * sqrtLower).
            // Two round-up steps compose to >= the exact value.
            uint256 inter = FullMath.mulDivRoundingUp(amount, sqrtUpper, delta);
            liq = FullMath.mulDivRoundingUp(inter, sqrtLower, Q96);
        }
        require(liq <= type(uint128).max, "liquidity overflow");
        return uint128(liq);
    }

    function _floorTo(int24 tick, int24 spacing) private pure returns (int24) {
        int24 c = tick / spacing;
        if (tick < 0 && tick % spacing != 0) c--;
        return c * spacing;
    }

    function _ceilTo(int24 tick, int24 spacing) private pure returns (int24) {
        int24 c = tick / spacing;
        if (tick > 0 && tick % spacing != 0) c++;
        return c * spacing;
    }
}
