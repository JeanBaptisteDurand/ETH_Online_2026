// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FixedPoint96} from '@uniswap/v4-core/src/libraries/FixedPoint96.sol';
import {FullMath} from '@uniswap/v4-core/src/libraries/FullMath.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';

/**
 * A helper library that finds the next valid tick for the specified tick spacing, starting
 * from a single tick. This will allow us to round up or down to find it and also supports
 * negative rounding.
 *
 * This is beneficial as it allows us to create positions directly next to the current tick.
 *
 * @dev This is used by `using TickFinder for int24;`
 */
library TickFinder {
    /// The valid tick spacing value for the pool
    int24 internal constant TICK_SPACING = 60;

    /**
     * Our min/max tick range that is valid for the tick spacing.
     *
     * These sit one full `TICK_SPACING` inside Uniswap's own domain (`TickMath.MIN_TICK` /
     * `MAX_TICK`, +/-887272) rather than at the outermost spacing-aligned ticks (+/-887220).
     * Every consumer clamps through {validTick} and then adds or subtracts a whole spacing to
     * form the other side of a single-spacing position:
     *
     *     newTickLower = baseTick.validTick(false);   // saturates at MAX_TICK
     *     newTickUpper = newTickLower + TICK_SPACING; // a full spacing beyond it
     *
     * Uniswap's domain is only 52 ticks wider than +/-887220 -- less than one `TICK_SPACING` --
     * so saturating there placed the far side at +/-887280, outside the domain, and
     * `TickMath.getSqrtPriceAtTick` reverted with `InvalidTick`. In the {BidWall} that revert
     * lands inside `afterSwap` and is permanent rather than transient: `_distributeFees` only
     * resets the pool's fee balance after a successful deposit, so the rollback leaves the
     * balance above the threshold and every later swap re-enters the same branch. The pool stops
     * trading for everyone, and only the creator disabling the wall recovers it.
     *
     * +/-887160 is the largest spacing-aligned tick whose +/- `TICK_SPACING` neighbour
     * (+/-887220) is still inside Uniswap's domain, so the clamp-then-add-a-spacing shape can no
     * longer produce an out-of-domain tick.
     *
     * Three call sites share that shape and are all fixed by bounding the domain here rather than
     * clamping at each of them: {BidWall._addETHLiquidity}, {BuyBackAndBurnFlay.notify}
     * and {FlaunchLibrary.launchTickRanges}. The last of those also uses these constants
     * directly as the memecoin position's outer bound, which simply narrows that position by one
     * spacing.
     */
    int24 internal constant MIN_TICK = -887160;
    int24 internal constant MAX_TICK = 887160;

    /**
     * Helper function to find the nearest valid tick, rounding up or down.
     *
     * @param _tick The tick that we want to find a valid value for
     * @param _roundDown If we want to round down (true) or up (false)
     *
     * return tick_ The valid tick
     */
    function validTick(
        int24 _tick,
        bool _roundDown
    ) internal pure returns (int24 tick_) {
        // If we have a malformed tick, then we need to bring it back within range
        if (_tick < MIN_TICK) {
            _tick = MIN_TICK;
        } else if (_tick > MAX_TICK) {
            _tick = MAX_TICK;
        }

        // If the tick is already valid, exit early
        if (_tick % TICK_SPACING == 0) {
            return _tick;
        }

        tick_ = _tick / TICK_SPACING * TICK_SPACING;
        if (_tick < 0) {
            tick_ -= TICK_SPACING;
        }

        // If we are rounding up, then we can just add a `TICK_SPACING` to the lower tick
        if (!_roundDown) {
            return tick_ + TICK_SPACING;
        }
    }

    /**
     * Resolves the single-spacing, single-sided position a caller would open just outside
     * `_currentTick`, reporting whether one can be built at all.
     *
     * @dev Three consumers share this shape -- {BidWall._addETHLiquidity},
     * {BuyBackAndBurnFlay.notify} and {FlaunchLibrary.launchTickRanges} -- and each funds ONE side
     * only. So the position they open must satisfy two properties at once, and near the domain
     * edge those properties pull against each other:
     *
     *   1. Both ticks must be inside `TickMath`'s domain, or `getSqrtPriceAtTick` reverts.
     *   2. The range must sit STRICTLY on the far side of spot, or Uniswap asks for the currency
     *      the caller does not hold and the settle fails.
     *
     * The bounds above secure (1): they sit a full `TICK_SPACING` inside `TickMath`'s, so the
     * neighbour this shape adds is always priceable. But securing (1) by CLAMPING is exactly what
     * breaks (2). Once {validTick} saturates, its result stops tracking spot, so the step outward
     * lands at or below it -- a range that is perfectly priceable and completely unusable, because
     * for a native-is-currency0 pool it would demand the memecoin the caller has none of.
     *
     * No arithmetic satisfies both at the extreme, because no valid single-sided range EXISTS
     * there. This reports that rather than manufacturing a broken one, and leaves each caller to
     * decide: the {BidWall} defers, the launch path rejects.
     *
     * The liquidity is checked for the same reason. {LiquidityAmounts} reverts on an overflowing
     * downcast, and at the domain edge the price ratio across a single spacing is so small that a
     * realistic deposit overflows it while a small one rounds to ZERO -- a third and fourth way to
     * fail, in the same region, and reachable even when the range IS correctly sided. A
     * zero-liquidity position would record a range while leaving the deposit undeposited.
     *
     * @param _currentTick The pool tick the position is being placed against
     * @param _fundedSideIsZero Whether the funded side of the pool is `currency0`
     * @param _amount The amount of the funded side being deposited
     *
     * @return ok_ Whether a valid single-sided position exists at this price
     * @return tickLower_ The lower tick of that position
     * @return tickUpper_ The upper tick of that position
     * @return liquidity_ The liquidity `_amount` buys across it
     */
    function singleSidedPosition(
        int24 _currentTick,
        bool _fundedSideIsZero,
        uint _amount
    ) internal pure returns (bool ok_, int24 tickLower_, int24 tickUpper_, uint128 liquidity_) {
        // A real pool tick is always inside `TickMath`'s domain, but this is a shared helper taking
        // a raw int24, and stepping one tick outward from `int24` min/max would silently overflow.
        // Clamp first so the function is total over its own input type.
        if (_currentTick < TickMath.MIN_TICK) {
            _currentTick = TickMath.MIN_TICK;
        } else if (_currentTick > TickMath.MAX_TICK) {
            _currentTick = TickMath.MAX_TICK;
        }

        // Determine a base tick just outside of the current tick
        int24 baseTick = _fundedSideIsZero ? _currentTick + 1 : _currentTick - 1;

        /**
         * Calculate the tick range.
         *
         *                   tick ( lower | upper )
         * When the tick is  6931 (  6960 |  7020 )
         * When the tick is -6932 ( -7020 | -6960 )
         */
        if (_fundedSideIsZero) {
            tickLower_ = validTick(baseTick, false);
            tickUpper_ = tickLower_ + TICK_SPACING;

            // A currency0-only position needs the pool tick strictly BELOW the range. Uniswap's
            // own rule is `tick < tickLower`, so equality is not enough: a pool's tick is the floor
            // of its price, and at `tick == tickLower` the price may already sit inside the range,
            // which would make the position two-sided.
            if (tickLower_ <= _currentTick) {
                return (false, 0, 0, 0);
            }
        } else {
            tickUpper_ = validTick(baseTick, true);
            tickLower_ = tickUpper_ - TICK_SPACING;

            // Mirror image: a currency1-only position needs `tick >= tickUpper`.
            if (tickUpper_ > _currentTick) {
                return (false, 0, 0, 0);
            }
        }

        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(tickLower_);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(tickUpper_);

        // Mirrors {LiquidityAmounts} exactly, but keeps the result in `uint` so an overflowing
        // downcast becomes a decision to defer rather than a revert
        uint liquidity = _fundedSideIsZero
            ? FullMath.mulDiv(
                _amount, FullMath.mulDiv(sqrtPriceLower, sqrtPriceUpper, FixedPoint96.Q96), sqrtPriceUpper - sqrtPriceLower
            )
            : FullMath.mulDiv(_amount, FixedPoint96.Q96, sqrtPriceUpper - sqrtPriceLower);

        // Zero is refused alongside an overflow, and for the same reason: at the domain edge a
        // small deposit rounds to no liquidity at all, and opening that position would record a
        // range while leaving the deposit undeposited. Unreachable at ordinary prices.
        if (liquidity == 0 || liquidity > type(uint128).max) {
            return (false, 0, 0, 0);
        }

        ok_ = true;
        liquidity_ = uint128(liquidity);
    }
}
