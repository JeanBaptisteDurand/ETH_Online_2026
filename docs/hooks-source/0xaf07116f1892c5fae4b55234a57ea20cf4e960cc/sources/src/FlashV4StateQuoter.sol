// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapMath} from "@uniswap/v4-core/src/libraries/SwapMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {TickBitmap} from "@uniswap/v4-core/src/libraries/TickBitmap.sol";
import {BitMath} from "@uniswap/v4-core/src/libraries/BitMath.sol";
import {LiquidityMath} from "@uniswap/v4-core/src/libraries/LiquidityMath.sol";
import {ProtocolFeeLibrary} from "@uniswap/v4-core/src/libraries/ProtocolFeeLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";

/// @notice Read-only reproduction of the v4 core swap loop for static-fee
/// pools. It avoids revert-as-return quotation while preserving core rounding,
/// protocol fees, initialized-tick crossings and exact-input/output semantics.
library FlashV4StateQuoter {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using ProtocolFeeLibrary for uint16;

    uint256 internal constant MAX_STEPS = 128;

    struct State {
        int256 remaining;
        int256 calculated;
        uint160 sqrtPriceX96;
        int24 tick;
        uint128 liquidity;
    }

    struct Step {
        int24 tickNext;
        bool initialized;
        uint160 sqrtNext;
        uint160 start;
        uint256 amountIn;
        uint256 amountOut;
        uint256 feeAmount;
    }

    struct VirtualBand {
        bool enabled;
        int24 lower;
        int24 upper;
        uint128 liquidity;
    }

    struct QuoteResult {
        bool ok;
        uint256 amountIn;
        uint256 amountOut;
        uint160 sqrtPriceX96;
    }

    struct RunConfig {
        PoolKey key;
        bool zeroForOne;
        int256 amountSpecified;
        VirtualBand band;
        bool allowPartial;
    }

    struct StepConfig {
        PoolId id;
        int24 spacing;
        bool zeroForOne;
        uint160 limit;
        uint24 swapFee;
        VirtualBand band;
    }

    function quote(IPoolManager manager, PoolKey memory key, bool zeroForOne, int256 amountSpecified)
        internal
        view
        returns (bool ok, uint256 amountIn, uint256 amountOut)
    {
        QuoteResult memory result = _quote(manager, RunConfig({
            key: key,
            zeroForOne: zeroForOne,
            amountSpecified: amountSpecified,
            band: VirtualBand(false, 0, 0, 0),
            allowPartial: false
        }));
        return (result.ok, result.amountIn, result.amountOut);
    }

    /// @notice Matches PoolManager's partial-fill result without mutating the
    /// pool. FLASH uses this to determine the precise remainder sent to its
    /// verified external venue fleet.
    function quotePartial(IPoolManager manager, PoolKey memory key, bool zeroForOne, int256 amountSpecified)
        internal
        view
        returns (bool ok, uint256 amountIn, uint256 amountOut)
    {
        QuoteResult memory result = _quote(manager, RunConfig({
            key: key,
            zeroForOne: zeroForOne,
            amountSpecified: amountSpecified,
            band: VirtualBand(false, 0, 0, 0),
            allowPartial: true
        }));
        return (result.ok, result.amountIn, result.amountOut);
    }

    /// @notice Read-only PoolManager simulation with one hypothetical JIT
    /// position overlaid on the initialized-tick state.
    function quoteWithBand(
        IPoolManager manager,
        PoolKey memory key,
        bool zeroForOne,
        int256 amountSpecified,
        int24 lower,
        int24 upper,
        uint128 liquidity
    ) internal view returns (QuoteResult memory result, uint256 acquiredToken, uint256 quoteSpent) {
        if (lower >= upper || liquidity == 0) return (result, 0, 0);
        (uint160 startSqrtPriceX96,,,) = manager.getSlot0(key.toId());
        VirtualBand memory band = VirtualBand(true, lower, upper, liquidity);
        result = _quote(manager, RunConfig({
            key: key,
            zeroForOne: zeroForOne,
            amountSpecified: amountSpecified,
            band: band,
            allowPartial: true
        }));
        if (!result.ok) return (result, 0, 0);

        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(lower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(upper);
        if (zeroForOne) {
            if (startSqrtPriceX96 < sqrtUpper) return (QuoteResult(false, 0, 0, 0), 0, 0);
            uint256 initialQuote = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, true);
            if (result.sqrtPriceX96 <= sqrtLower) {
                acquiredToken = SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false);
                quoteSpent = initialQuote;
            } else if (result.sqrtPriceX96 < sqrtUpper) {
                acquiredToken =
                    SqrtPriceMath.getAmount0Delta(result.sqrtPriceX96, sqrtUpper, liquidity, false);
                uint256 remainingQuote =
                    SqrtPriceMath.getAmount1Delta(sqrtLower, result.sqrtPriceX96, liquidity, false);
                if (initialQuote < remainingQuote) return (QuoteResult(false, 0, 0, 0), 0, 0);
                quoteSpent = initialQuote - remainingQuote;
            }
        } else {
            if (startSqrtPriceX96 > sqrtLower) return (QuoteResult(false, 0, 0, 0), 0, 0);
            uint256 initialQuote = SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, true);
            if (result.sqrtPriceX96 >= sqrtUpper) {
                acquiredToken = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);
                quoteSpent = initialQuote;
            } else if (result.sqrtPriceX96 > sqrtLower) {
                acquiredToken =
                    SqrtPriceMath.getAmount1Delta(sqrtLower, result.sqrtPriceX96, liquidity, false);
                uint256 remainingQuote =
                    SqrtPriceMath.getAmount0Delta(result.sqrtPriceX96, sqrtUpper, liquidity, false);
                if (initialQuote < remainingQuote) return (QuoteResult(false, 0, 0, 0), 0, 0);
                quoteSpent = initialQuote - remainingQuote;
            }
        }
    }

    function _quote(IPoolManager manager, RunConfig memory config)
        private
        view
        returns (QuoteResult memory result)
    {
        if (
            config.amountSpecified == 0 || config.amountSpecified == type(int256).min
                || config.key.tickSpacing <= 0
        ) {
            return result;
        }
        PoolId id = config.key.toId();
        (bool valid, State memory state, uint24 swapFee) =
            _load(manager, id, config.zeroForOne, config.amountSpecified);
        if (!valid) return result;
        if (config.band.enabled && state.tick >= config.band.lower && state.tick < config.band.upper) {
            state.liquidity = LiquidityMath.addDelta(state.liquidity, int128(config.band.liquidity));
        }
        StepConfig memory stepConfig = StepConfig({
            id: id,
            spacing: config.key.tickSpacing,
            zeroForOne: config.zeroForOne,
            limit: config.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1,
            swapFee: swapFee,
            band: config.band
        });

        for (uint256 steps; state.remaining != 0 && state.sqrtPriceX96 != stepConfig.limit; ++steps) {
            if (steps == MAX_STEPS) return result;
            if (!_step(manager, stepConfig, state)) {
                break;
            }
        }
        if (!config.allowPartial && state.remaining != 0) return result;

        if (config.amountSpecified > 0) {
            if (state.calculated >= 0 || state.remaining < 0) return result;
            result.amountIn = uint256(-state.calculated);
            result.amountOut = uint256(config.amountSpecified - state.remaining);
        } else {
            if (state.calculated <= 0 || state.remaining > 0) return result;
            result.amountIn = uint256(-(config.amountSpecified - state.remaining));
            result.amountOut = uint256(state.calculated);
        }
        result.ok = result.amountIn != 0 && result.amountOut != 0;
        result.sqrtPriceX96 = state.sqrtPriceX96;
    }

    function _load(IPoolManager manager, PoolId id, bool zeroForOne, int256 amountSpecified)
        private
        view
        returns (bool valid, State memory state, uint24 swapFee)
    {
        (uint160 sqrtPriceX96, int24 tick, uint24 packedProtocolFee, uint24 lpFee) = manager.getSlot0(id);
        if (sqrtPriceX96 == 0 || lpFee >= 1_000_000) return (false, state, 0);
        uint16 protocolFee = zeroForOne
            ? ProtocolFeeLibrary.getZeroForOneFee(packedProtocolFee)
            : ProtocolFeeLibrary.getOneForZeroFee(packedProtocolFee);
        swapFee = protocolFee == 0 ? lpFee : protocolFee.calculateSwapFee(lpFee);
        if (amountSpecified > 0 && swapFee >= 1_000_000) return (false, state, 0);
        state = State(amountSpecified, 0, sqrtPriceX96, tick, manager.getLiquidity(id));
        valid = true;
    }

    function _step(
        IPoolManager manager,
        StepConfig memory config,
        State memory state
    ) private view returns (bool) {
        Step memory step;
        (step.tickNext, step.initialized) =
            _nextInitialized(manager, config.id, state.tick, config.spacing, config.zeroForOne);
        (step.tickNext, step.initialized) =
            _overlayNext(step.tickNext, step.initialized, state.tick, config.zeroForOne, config.band);
        if (step.tickNext <= TickMath.MIN_TICK) step.tickNext = TickMath.MIN_TICK;
        if (step.tickNext >= TickMath.MAX_TICK) step.tickNext = TickMath.MAX_TICK;
        step.sqrtNext = TickMath.getSqrtPriceAtTick(step.tickNext);
        step.start = state.sqrtPriceX96;
        (state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount) = SwapMath.computeSwapStep(
            step.start,
            SwapMath.getSqrtPriceTarget(config.zeroForOne, step.sqrtNext, config.limit),
            state.liquidity,
            state.remaining,
            config.swapFee
        );

        if (state.remaining > 0) {
            state.remaining -= int256(step.amountOut);
            state.calculated -= int256(step.amountIn + step.feeAmount);
        } else {
            state.remaining += int256(step.amountIn + step.feeAmount);
            state.calculated += int256(step.amountOut);
        }
        if (state.sqrtPriceX96 == step.sqrtNext) {
            if (step.initialized) {
                (, int128 liquidityNet) = manager.getTickLiquidity(config.id, step.tickNext);
                if (config.band.enabled) {
                    if (step.tickNext == config.band.lower) liquidityNet += int128(config.band.liquidity);
                    if (step.tickNext == config.band.upper) liquidityNet -= int128(config.band.liquidity);
                }
                if (config.zeroForOne) liquidityNet = -liquidityNet;
                state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
            }
            state.tick = config.zeroForOne ? step.tickNext - 1 : step.tickNext;
        } else if (state.sqrtPriceX96 != step.start) {
            state.tick = TickMath.getTickAtSqrtPrice(state.sqrtPriceX96);
        } else {
            return false;
        }
        return true;
    }

    function _overlayNext(
        int24 realNext,
        bool realInitialized,
        int24 current,
        bool zeroForOne,
        VirtualBand memory band
    ) private pure returns (int24 next, bool initialized) {
        next = realNext;
        initialized = realInitialized;
        if (!band.enabled) return (next, initialized);

        int24 virtualNext;
        bool hasVirtual;
        if (zeroForOne) {
            if (current >= band.upper) {
                virtualNext = band.upper;
                hasVirtual = true;
            } else if (current >= band.lower) {
                virtualNext = band.lower;
                hasVirtual = true;
            }
            if (hasVirtual && virtualNext > next) return (virtualNext, true);
        } else {
            if (current < band.lower) {
                virtualNext = band.lower;
                hasVirtual = true;
            } else if (current < band.upper) {
                virtualNext = band.upper;
                hasVirtual = true;
            }
            if (hasVirtual && virtualNext < next) return (virtualNext, true);
        }
        if (hasVirtual && virtualNext == next) initialized = true;
    }

    function _nextInitialized(
        IPoolManager manager,
        PoolId id,
        int24 tick,
        int24 spacing,
        bool lte
    ) private view returns (int24 next, bool initialized) {
        unchecked {
            int24 compressed = TickBitmap.compress(tick, spacing);
            if (lte) {
                (int16 wordPos, uint8 bitPos) = TickBitmap.position(compressed);
                uint256 mask = type(uint256).max >> (uint256(type(uint8).max) - bitPos);
                uint256 masked = manager.getTickBitmap(id, wordPos) & mask;
                initialized = masked != 0;
                next = initialized
                    ? (compressed - int24(uint24(bitPos - BitMath.mostSignificantBit(masked)))) * spacing
                    : (compressed - int24(uint24(bitPos))) * spacing;
            } else {
                ++compressed;
                (int16 wordPos, uint8 bitPos) = TickBitmap.position(compressed);
                uint256 mask = ~((uint256(1) << bitPos) - 1);
                uint256 masked = manager.getTickBitmap(id, wordPos) & mask;
                initialized = masked != 0;
                next = initialized
                    ? (compressed + int24(uint24(BitMath.leastSignificantBit(masked) - bitPos))) * spacing
                    : (compressed + int24(uint24(type(uint8).max - bitPos))) * spacing;
            }
        }
    }
}
