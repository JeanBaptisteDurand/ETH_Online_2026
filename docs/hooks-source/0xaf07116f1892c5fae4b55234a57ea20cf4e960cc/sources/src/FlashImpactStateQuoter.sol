// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {ProtocolFeeLibrary} from "@uniswap/v4-core/src/libraries/ProtocolFeeLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {FlashV4StateQuoter} from "./FlashV4StateQuoter.sol";
import {FlashVenueRegistry} from "./FlashVenueRegistry.sol";
import {FlashVenueFleetOptimizer} from "./venues/FlashVenueFleetOptimizer.sol";
import {IFlashSafeVenueAdapter} from "./venues/IFlashSafeVenueAdapter.sol";
import {IFlashConstantProductModel} from "./venues/IFlashConstantProductModel.sol";
import {IFlashImpactVenue} from "./venues/IFlashImpactVenue.sol";

interface IFlashV4FeeJarSource {
    function TOKEN_JAR() external view returns (address);
}

interface IFlashRoutedTaxQuote {
    function quoteRoutedImpact(bytes32 rawId, uint256 amount, uint256 routeImpactBps, bool zeroForOne)
        external
        view
        returns (uint256 bps);
}

/// @notice Read-only impact candidate evaluator. It overlays the proposed JIT
/// band on PoolManager state and quotes the verified external fleet without
/// executing either path. An unavailable candidate is returned as data, never
/// encoded as an EVM revert.
contract FlashImpactStateQuoter {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using ProtocolFeeLibrary for uint16;

    uint256 private constant PIPS = 1_000_000;
    uint256 private constant BPS = 10_000;
    uint256 private constant PRICE_SCALE = 1e18;
    uint256 private constant SLICES = 20;
    uint256 private constant MAX_EXTERNAL = 4;
    uint256 private constant PROTOCOL_FEE_MULTIPLIER = 25;

    /// @notice Complete route selected for a protocol-token sell. External
    /// input/output are the actual venue amounts; totalInput/totalOutput also
    /// include Uniswap's aggregator-hook protocol fee.
    struct SellPlan {
        bool found;
        bool exactOutput;
        uint128 totalInput;
        uint128 totalOutput;
        uint128 v4Input;
        uint128 v4Output;
        uint128 externalInput;
        uint128 externalGrossOutput;
        uint128 externalNetOutput;
        uint128 externalProtocolFee;
    }

    struct SellGrid {
        uint256 v4Amount;
        uint256 v4Quote;
        uint256[4] venueAmount;
        uint256[4] venueQuote;
    }

    struct SellAddition {
        bool found;
        uint8 index;
        uint256 quote;
        uint256 marginal;
    }

    struct SellSearchContext {
        bytes32 rawId;
        uint256 addition;
        uint256 currentRaw;
        uint24 feePips;
        bool zeroForOne;
        bool exactOutput;
    }

    struct CandidateQuote {
        bool ok;
        uint256 output;
        uint256 totalOutput;
        uint256 input;
        uint256 totalInput;
        uint256 profit;
    }

    struct CandidateRuntime {
        uint256 output;
        uint256 input;
        uint256 acquired;
        uint256 quoteSpent;
    }

    IPoolManager public immutable poolManager;
    FlashVenueFleetOptimizer public immutable optimizer;
    FlashVenueRegistry public immutable registry;

    constructor(IPoolManager poolManager_, FlashVenueFleetOptimizer optimizer_) {
        require(address(poolManager_) != address(0) && address(optimizer_).code.length != 0, "INVALID_CONFIG");
        poolManager = poolManager_;
        optimizer = optimizer_;
        registry = optimizer_.registry();
    }

    /// @notice Optimizes a sell across the native hooked v4 curve and every
    /// enabled verified venue. Twenty bounded marginal slices make the result
    /// deterministic and ensure a healthy external route competes with v4
    /// even when v4 can technically consume the whole order.
    function planSell(PoolKey calldata key, bool zeroForOne, bool exactOutput, uint256 amount)
        external
        view
        returns (SellPlan memory plan)
    {
        (plan,) = _planSell(key, zeroForOne, exactOutput, amount);
    }

    function _planSell(PoolKey calldata key, bool zeroForOne, bool exactOutput, uint256 amount)
        private
        view
        returns (SellPlan memory plan, SellGrid memory grid)
    {
        if (amount == 0 || amount > uint256(uint128(type(int128).max))) return (plan, grid);
        uint256 slice = amount / SLICES;
        if (slice == 0) {
            if (!_allocateSellSlice(key, zeroForOne, exactOutput, grid, amount)) return (plan, grid);
            return (_sellPlan(key, zeroForOne, exactOutput, grid, amount), grid);
        }
        for (uint256 step; step < SLICES; ++step) {
            if (!_allocateSellSlice(key, zeroForOne, exactOutput, grid, slice)) return (plan, grid);
        }
        uint256 remainder = amount - slice * SLICES;
        if (remainder != 0 && !_allocateSellSlice(key, zeroForOne, exactOutput, grid, remainder)) {
            return (plan, grid);
        }
        plan = _sellPlan(key, zeroForOne, exactOutput, grid, amount);
    }

    function planTaxedExactInputSell(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 grossAmount,
        IFlashRoutedTaxQuote taxModule
    ) external view returns (uint256 bps, uint256 tax, uint256 externalInput) {
        require(address(taxModule).code.length != 0, "INVALID_TAX");
        // Price the impact of the gross sell request across the same optimal
        // fleet split used for execution. Measuring again after subtracting
        // tax is circular: a discrete slice can change venues and create a
        // two-point bps oscillation with no integer fixed point.
        (SellPlan memory grossRoute, SellGrid memory grossGrid) = _planSell(key, zeroForOne, false, grossAmount);
        require(grossRoute.found, "NO_ROUTE");
        bps = taxModule.quoteRoutedImpact(
            PoolId.unwrap(key.toId()),
            grossAmount,
            _routeImpactBps(key, zeroForOne, false, grossRoute, grossGrid),
            zeroForOne
        );
        tax = grossAmount * bps / 10_000;
        require(tax < grossAmount, "INVALID_TAX");
        (SellPlan memory executionRoute,) = _planSell(key, zeroForOne, false, grossAmount - tax);
        require(executionRoute.found, "NO_ROUTE");
        return (bps, tax, executionRoute.externalInput);
    }

    function planExactOutputSellExternal(PoolKey calldata key, bool zeroForOne, uint256 requestedOutput)
        external
        view
        returns (uint256 externalOutput)
    {
        (SellPlan memory route,) = _planSell(key, zeroForOne, true, requestedOutput);
        require(route.found && route.totalOutput == requestedOutput, "NO_ROUTE");
        externalOutput = route.externalNetOutput;
    }

    /// @notice Exact-output sell allocation plus the input-weighted price
    /// movement across every selected curve. The hook records the impact with
    /// the pending external input so realization uses the pre-swap fleet state.
    function planExactOutputSellRoute(PoolKey calldata key, bool zeroForOne, uint256 requestedOutput)
        external
        view
        returns (uint256 externalOutput, uint256 routeImpactBps)
    {
        (SellPlan memory route, SellGrid memory grid) = _planSell(key, zeroForOne, true, requestedOutput);
        require(route.found && route.totalOutput == requestedOutput, "NO_ROUTE");
        externalOutput = route.externalNetOutput;
        routeImpactBps = _routeImpactBps(key, zeroForOne, true, route, grid);
    }

    function baseline(PoolKey calldata key, SwapParams calldata params, uint256 exactInputTax)
        external
        view
        returns (bool ok, uint256 output, uint256 input, uint256 totalOutput, uint256 totalInput)
    {
        int256 amountSpecified = params.amountSpecified;
        if (amountSpecified < 0) {
            if (exactInputTax >= uint256(-amountSpecified)) return (false, 0, 0, 0, 0);
            amountSpecified += int256(exactInputTax);
        }
        (ok, input, output) = FlashV4StateQuoter.quotePartial(poolManager, key, params.zeroForOne, amountSpecified);
        if (!ok) return (false, 0, 0, 0, 0);

        bytes32 poolId = PoolId.unwrap(key.toId());
        address token = Currency.unwrap(params.zeroForOne ? key.currency0 : key.currency1);
        address quoteToken = Currency.unwrap(params.zeroForOne ? key.currency1 : key.currency0);
        if (params.amountSpecified < 0) {
            uint256 netInput = uint256(-params.amountSpecified) - exactInputTax;
            if (input > netInput) return (false, 0, 0, 0, 0);
            totalInput = netInput;
            totalOutput = output;
            uint256 remainderInput = netInput - input;
            if (remainderInput != 0) {
                FlashVenueFleetOptimizer.Plan memory remainder =
                    optimizer.planExactInput(poolId, token, quoteToken, remainderInput);
                if (
                    !remainder.found || _totalPlanInput(remainder) != remainderInput || remainder.totalOut == 0
                        || output > type(uint256).max - remainder.totalOut
                ) return (false, 0, 0, 0, 0);
                totalOutput += remainder.totalOut;
            }
        } else {
            uint256 requestedOutput = uint256(params.amountSpecified);
            if (output > requestedOutput) return (false, 0, 0, 0, 0);
            totalOutput = requestedOutput;
            totalInput = input;
            uint256 remainderOutput = requestedOutput - output;
            if (remainderOutput != 0) {
                FlashVenueFleetOptimizer.Plan memory remainder =
                    optimizer.planExactOutput(poolId, token, quoteToken, remainderOutput);
                if (!remainder.found || remainder.totalOut != remainderOutput) return (false, 0, 0, 0, 0);
                uint256 remainderInput = _totalPlanInput(remainder);
                if (totalInput > type(uint256).max - remainderInput) return (false, 0, 0, 0, 0);
                totalInput += remainderInput;
            }
        }
    }

    function candidate(
        PoolKey calldata key,
        SwapParams calldata params,
        uint256 exactInputTax,
        uint128 capacity,
        int24 width
    ) external view returns (CandidateQuote memory result) {
        (bool bandOk, int24 lower, int24 upper, uint128 liquidity) = _band(key, params.zeroForOne, capacity, width);
        if (!bandOk) return result;

        int256 amountSpecified = params.amountSpecified;
        if (amountSpecified < 0) {
            if (exactInputTax >= uint256(-amountSpecified)) return result;
            amountSpecified += int256(exactInputTax);
        }
        (FlashV4StateQuoter.QuoteResult memory quote, uint256 acquired, uint256 quoteSpent) = FlashV4StateQuoter.quoteWithBand(
            poolManager, key, params.zeroForOne, amountSpecified, lower, upper, liquidity
        );
        if (!quote.ok || acquired == 0 || quoteSpent == 0) return result;

        return _completeCandidate(
            key, params, exactInputTax, CandidateRuntime(quote.amountOut, quote.amountIn, acquired, quoteSpent)
        );
    }

    function _completeCandidate(
        PoolKey calldata key,
        SwapParams calldata params,
        uint256 exactInputTax,
        CandidateRuntime memory runtime
    ) private view returns (CandidateQuote memory result) {
        bytes32 poolId = PoolId.unwrap(key.toId());
        address token = Currency.unwrap(params.zeroForOne ? key.currency0 : key.currency1);
        address quoteToken = Currency.unwrap(params.zeroForOne ? key.currency1 : key.currency0);

        uint256 totalInput;
        uint256 externalInput;
        uint256 externalOutput;
        if (params.amountSpecified < 0) {
            uint256 netInput = uint256(-params.amountSpecified) - exactInputTax;
            if (runtime.input > netInput) return result;
            externalInput = netInput - runtime.input;
            if (externalInput != 0) {
                FlashVenueFleetOptimizer.Plan memory remainder =
                    optimizer.planExactInput(poolId, token, quoteToken, externalInput);
                if (!remainder.found || _totalPlanInput(remainder) != externalInput || remainder.totalOut == 0) {
                    return result;
                }
                externalOutput = remainder.totalOut;
            }
            totalInput = netInput;
        } else {
            uint256 requestedOutput = uint256(params.amountSpecified);
            if (runtime.output > requestedOutput) return result;
            externalOutput = requestedOutput - runtime.output;
            totalInput = runtime.input;
            if (externalOutput != 0) {
                FlashVenueFleetOptimizer.Plan memory remainder =
                    optimizer.planExactOutput(poolId, token, quoteToken, externalOutput);
                if (!remainder.found || remainder.totalOut != externalOutput) return result;
                externalInput = _totalPlanInput(remainder);
                totalInput += externalInput;
            }
        }

        // The hook executes the external remainder before removing and
        // unwinding the impact band. Quote those same-direction token sales as
        // one aggregate curve traversal, then value the unwind only by its
        // marginal output after the remainder. Quoting the unwind against the
        // pre-remainder reserves can arm a position whose execution-time exit
        // is no longer solvent.
        if (externalInput > type(uint256).max - runtime.acquired) return result;
        uint256 combinedInput = externalInput + runtime.acquired;
        FlashVenueFleetOptimizer.Plan memory unwind = optimizer.planExactInput(poolId, token, quoteToken, combinedInput);
        if (
            !unwind.found || _totalPlanInput(unwind) != combinedInput
                || externalOutput > type(uint256).max - runtime.quoteSpent
                || unwind.totalOut <= externalOutput + runtime.quoteSpent
        ) return result;

        uint256 totalExecutionOutput;
        if (params.amountSpecified < 0) {
            if (runtime.output > type(uint256).max - externalOutput) return result;
            totalExecutionOutput = runtime.output + externalOutput;
        } else {
            totalExecutionOutput = uint256(params.amountSpecified);
        }
        result = CandidateQuote({
            ok: true,
            output: runtime.output,
            totalOutput: totalExecutionOutput,
            input: runtime.input,
            totalInput: totalInput,
            profit: unwind.totalOut - externalOutput - runtime.quoteSpent
        });
    }

    function _band(PoolKey calldata key, bool tokenIs0, uint128 capacity, int24 width)
        private
        view
        returns (bool ok, int24 lower, int24 upper, uint128 liquidity)
    {
        if (capacity == 0 || width <= 0 || width % key.tickSpacing != 0) return (false, 0, 0, 0);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        int24 spacing = key.tickSpacing;
        int24 floorTick = tick / spacing * spacing;
        if (tick < 0 && tick % spacing != 0) floorTick -= spacing;
        if (tokenIs0) {
            upper = floorTick;
            lower = upper - width;
            if (lower <= TickMath.MIN_TICK || upper >= TickMath.MAX_TICK) return (false, 0, 0, 0);
            liquidity = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), capacity
            );
        } else {
            lower = tick == floorTick ? floorTick : floorTick + spacing;
            upper = lower + width;
            if (lower <= TickMath.MIN_TICK || upper >= TickMath.MAX_TICK) return (false, 0, 0, 0);
            liquidity = LiquidityAmounts.getLiquidityForAmount0(
                TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), capacity
            );
        }
        ok = liquidity != 0 && liquidity <= uint128(type(int128).max);
    }

    function _totalPlanInput(FlashVenueFleetOptimizer.Plan memory plan) private pure returns (uint256 total) {
        for (uint256 i; i < 4; ++i) {
            total += plan.amountIn[i];
        }
    }

    function _allocateSellSlice(
        PoolKey calldata key,
        bool zeroForOne,
        bool exactOutput,
        SellGrid memory grid,
        uint256 addition
    ) private view returns (bool found) {
        uint256 best = MAX_EXTERNAL;
        uint256 bestMarginal = exactOutput ? type(uint256).max : 0;
        (bool v4Ok, uint256 v4Candidate) = _trySellV4(key, zeroForOne, exactOutput, grid.v4Amount + addition);
        if (v4Ok && v4Candidate >= grid.v4Quote) {
            found = true;
            bestMarginal = v4Candidate - grid.v4Quote;
        }

        SellAddition memory externalBest = _bestSellExternalAddition(key, zeroForOne, exactOutput, grid, addition);
        if (
            externalBest.found
                && (!found
                    || (exactOutput ? externalBest.marginal < bestMarginal : externalBest.marginal > bestMarginal))
        ) {
            found = true;
            best = externalBest.index;
            v4Candidate = externalBest.quote;
        }
        if (!found) return false;
        if (best == MAX_EXTERNAL) {
            grid.v4Amount += addition;
            grid.v4Quote = v4Candidate;
        } else {
            grid.venueAmount[best] += addition;
            grid.venueQuote[best] = v4Candidate;
        }
    }

    function _bestSellExternalAddition(
        PoolKey calldata key,
        bool zeroForOne,
        bool exactOutput,
        SellGrid memory grid,
        uint256 addition
    ) private view returns (SellAddition memory best) {
        if (exactOutput) best.marginal = type(uint256).max;
        (uint24 feePips, bool usable) = _sellProtocolFee(key, zeroForOne);
        if (!usable) return best;
        bytes32 rawId = PoolId.unwrap(key.toId());
        uint256 count = registry.venueCount(rawId);
        if (count > MAX_EXTERNAL) count = MAX_EXTERNAL;
        SellSearchContext memory context = SellSearchContext({
            rawId: rawId,
            addition: addition,
            currentRaw: _sellExternalRaw(grid),
            feePips: feePips,
            zeroForOne: zeroForOne,
            exactOutput: exactOutput
        });
        for (uint256 i; i < count; ++i) {
            (bool ok, uint256 candidateQuote) = _quoteSellExternalAddition(key, context, i, grid.venueAmount[i]);
            if (!ok || candidateQuote < grid.venueQuote[i]) continue;
            uint256 marginal = context.exactOutput
                ? _externalExactOutputMarginal(context.feePips, context.currentRaw, grid.venueQuote[i], candidateQuote)
                : _externalExactInputMarginal(context.feePips, context.currentRaw, grid.venueQuote[i], candidateQuote);
            if (!best.found || (context.exactOutput ? marginal < best.marginal : marginal > best.marginal)) {
                best = SellAddition(true, uint8(i), candidateQuote, marginal);
            }
        }
    }

    function _quoteSellExternalAddition(
        PoolKey calldata key,
        SellSearchContext memory context,
        uint256 index,
        uint256 currentAmount
    ) private view returns (bool ok, uint256 quote) {
        return _trySellExternal(
            key, context.zeroForOne, context.rawId, index, currentAmount + context.addition, context.exactOutput
        );
    }

    /// @dev Measures every selected curve from its own pre-swap price and
    /// weights the resulting token-price movement by actual token input. This
    /// avoids charging an external allocation against thin native-v4 depth,
    /// while also preventing an all-external route from escaping impact tax.
    function _routeImpactBps(
        PoolKey calldata key,
        bool zeroForOne,
        bool exactOutput,
        SellPlan memory route,
        SellGrid memory grid
    ) private view returns (uint256 impactBps) {
        uint256 totalInput;
        uint256 weightedImpact;
        uint256 v4Input = exactOutput ? grid.v4Quote : grid.v4Amount;
        if (v4Input != 0) {
            (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
            uint256 component =
                _v4InputImpactBps(sqrtPriceX96, poolManager.getLiquidity(key.toId()), v4Input, zeroForOne);
            weightedImpact += component * v4Input;
            totalInput += v4Input;
        }

        bytes32 rawId = PoolId.unwrap(key.toId());
        address token = Currency.unwrap(zeroForOne ? key.currency0 : key.currency1);
        address quoteToken = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);
        for (uint256 i; i < MAX_EXTERNAL; ++i) {
            uint256 venueInput = exactOutput ? grid.venueQuote[i] : grid.venueAmount[i];
            if (venueInput == 0) continue;
            uint256 venueOutput = exactOutput ? grid.venueAmount[i] : grid.venueQuote[i];
            FlashVenueRegistry.Venue memory venue = registry.venueAt(rawId, i);
            uint256 component = _externalInputImpactBps(venue, token, quoteToken, venueInput, venueOutput);
            weightedImpact += component * venueInput;
            totalInput += venueInput;
        }

        // The collapsed plan and detailed grid must describe the same token
        // input. A mismatch is an unavailable route, never a lower tax quote.
        uint256 plannedInput = uint256(route.v4Input) + uint256(route.externalInput);
        if (totalInput == 0 || totalInput != plannedInput) return BPS;
        impactBps = weightedImpact / totalInput;
    }

    function _v4InputImpactBps(uint160 start, uint128 liquidity, uint256 input, bool zeroForOne)
        private
        pure
        returns (uint256)
    {
        if (input == 0) return 0;
        if (start == 0 || liquidity == 0) return BPS;
        uint160 next = SqrtPriceMath.getNextSqrtPriceFromInput(start, liquidity, input, zeroForOne);
        uint256 ratio;
        if (zeroForOne) {
            if (next >= start) return 0;
            ratio = FullMath.mulDiv(next, PRICE_SCALE, start);
        } else {
            if (next <= start) return 0;
            ratio = FullMath.mulDiv(start, PRICE_SCALE, next);
        }
        uint256 ratioSquared = FullMath.mulDiv(ratio, ratio, PRICE_SCALE);
        return ratioSquared >= PRICE_SCALE ? 0 : (PRICE_SCALE - ratioSquared) * BPS / PRICE_SCALE;
    }

    function _externalInputImpactBps(
        FlashVenueRegistry.Venue memory venue,
        address token,
        address quoteToken,
        uint256 input,
        uint256 output
    ) private view returns (uint256) {
        if (!venue.enabled || input == 0 || output == 0) return BPS;
        try IFlashImpactVenue(venue.adapter).trySpotQuoteExactInput(venue.venuePool, token, quoteToken, input) returns (
            bool available, uint256 noMovementOutput
        ) {
            if (available && noMovementOutput != 0) {
                return _terminalImpactFromAverage(noMovementOutput, output);
            }
        } catch {}
        try IFlashConstantProductModel(venue.adapter).constantProductModel(venue.venuePool, token, quoteToken) returns (
            uint256 reserveIn, uint256 reserveOut, uint16 feeBps, bytes32
        ) {
            if (reserveIn != 0 && reserveOut != 0 && feeBps < BPS) {
                uint256 effectiveInput = FullMath.mulDiv(input, BPS - feeBps, BPS);
                uint256 noMovementOutput = FullMath.mulDiv(effectiveInput, reserveOut, reserveIn);
                return _terminalImpactFromAverage(noMovementOutput, output);
            }
        } catch {}

        // Generic verified-adapter fallback: use a bounded small executable
        // quote as the venue-local marginal reference. It includes that
        // venue's fixed fee on both sides, isolating curve movement.
        uint256 probe = input > 1_000 ? input / 1_000 : input;
        try IFlashSafeVenueAdapter(venue.adapter)
            .tryQuoteExactInput(venue.venuePool, token, quoteToken, probe) returns (
            bool ok, uint256 probeOutput
        ) {
            if (ok && probeOutput != 0) {
                uint256 noMovementOutput = FullMath.mulDiv(probeOutput, input, probe);
                return _terminalImpactFromAverage(noMovementOutput, output);
            }
        } catch {}
        return BPS;
    }

    /// @dev Converts average execution-price movement to the equivalent end
    /// price movement. It is exact for x*y=k and conservative for verified
    /// concentrated-liquidity adapters that cross into thinner liquidity.
    function _terminalImpactFromAverage(uint256 noMovementOutput, uint256 actualOutput) private pure returns (uint256) {
        if (noMovementOutput == 0) return BPS;
        if (actualOutput >= noMovementOutput) return 0;
        uint256 average = FullMath.mulDiv(noMovementOutput - actualOutput, BPS, noMovementOutput);
        uint256 terminal = average * 2 - FullMath.mulDiv(average, average, BPS);
        return terminal > BPS ? BPS : terminal;
    }

    function _sellPlan(PoolKey calldata key, bool zeroForOne, bool exactOutput, SellGrid memory grid, uint256 specified)
        private
        view
        returns (SellPlan memory plan)
    {
        uint256 externalAmount;
        uint256 externalRaw;
        for (uint256 i; i < MAX_EXTERNAL; ++i) {
            externalAmount += grid.venueAmount[i];
            externalRaw += grid.venueQuote[i];
        }
        (uint24 feePips, bool feeOk) = _sellProtocolFee(key, zeroForOne);
        if (!feeOk && externalAmount != 0) return plan;
        uint256 fee = _sellProtocolFeeAmount(feePips, !exactOutput, externalRaw);
        return exactOutput
            ? _sellExactOutputPlan(grid, specified, externalAmount, externalRaw, fee)
            : _sellExactInputPlan(grid, specified, externalAmount, externalRaw, fee);
    }

    function _sellExactInputPlan(
        SellGrid memory grid,
        uint256 specified,
        uint256 externalAmount,
        uint256 externalRaw,
        uint256 fee
    ) private pure returns (SellPlan memory plan) {
        uint256 totalInput = specified;
        uint256 totalOutput = grid.v4Quote + externalRaw - fee;
        uint256 v4Input = grid.v4Amount;
        uint256 v4Output = grid.v4Quote;
        uint256 externalInput = externalAmount;
        uint256 externalGrossOutput = externalRaw;
        uint256 externalNetOutput = externalRaw - fee;
        if (
            totalInput == 0 || totalOutput == 0 || totalInput > uint256(uint128(type(int128).max))
                || totalOutput > type(uint128).max || v4Input > type(uint128).max || v4Output > type(uint128).max
                || externalInput > type(uint128).max || externalGrossOutput > type(uint128).max
                || externalNetOutput > type(uint128).max || fee > type(uint128).max
        ) return plan;
        plan = SellPlan({
            found: true,
            exactOutput: false,
            totalInput: uint128(totalInput),
            totalOutput: uint128(totalOutput),
            v4Input: uint128(v4Input),
            v4Output: uint128(v4Output),
            externalInput: uint128(externalInput),
            externalGrossOutput: uint128(externalGrossOutput),
            externalNetOutput: uint128(externalNetOutput),
            externalProtocolFee: uint128(fee)
        });
    }

    function _sellExactOutputPlan(
        SellGrid memory grid,
        uint256 specified,
        uint256 externalAmount,
        uint256 externalRaw,
        uint256 fee
    ) private pure returns (SellPlan memory plan) {
        uint256 totalInput = grid.v4Quote + externalRaw + fee;
        uint256 totalOutput = specified;
        uint256 v4Input = grid.v4Quote;
        uint256 v4Output = grid.v4Amount;
        uint256 externalInput = externalRaw;
        uint256 externalGrossOutput = externalAmount;
        uint256 externalNetOutput = externalAmount;
        if (
            totalInput == 0 || totalOutput == 0 || totalInput > uint256(uint128(type(int128).max))
                || totalOutput > type(uint128).max || v4Input > type(uint128).max || v4Output > type(uint128).max
                || externalInput > type(uint128).max || externalGrossOutput > type(uint128).max
                || fee > type(uint128).max
        ) return plan;
        plan = SellPlan({
            found: true,
            exactOutput: true,
            totalInput: uint128(totalInput),
            totalOutput: uint128(totalOutput),
            v4Input: uint128(v4Input),
            v4Output: uint128(v4Output),
            externalInput: uint128(externalInput),
            externalGrossOutput: uint128(externalGrossOutput),
            externalNetOutput: uint128(externalNetOutput),
            externalProtocolFee: uint128(fee)
        });
    }

    function _bestSingleSell(PoolKey calldata key, bool zeroForOne, bool exactOutput, uint256 amount)
        private
        view
        returns (SellPlan memory plan)
    {
        SellGrid memory grid;
        if (!_allocateSellSlice(key, zeroForOne, exactOutput, grid, amount)) return plan;
        return _sellPlan(key, zeroForOne, exactOutput, grid, amount);
    }

    function _trySellV4(PoolKey calldata key, bool zeroForOne, bool exactOutput, uint256 amount)
        private
        view
        returns (bool ok, uint256 quote)
    {
        if (amount == 0 || amount > uint256(uint128(type(int128).max))) return (false, 0);
        uint256 input;
        uint256 output;
        (ok, input, output) =
            FlashV4StateQuoter.quote(poolManager, key, zeroForOne, exactOutput ? int256(amount) : -int256(amount));
        quote = exactOutput ? input : output;
    }

    function _trySellExternal(
        PoolKey calldata key,
        bool zeroForOne,
        bytes32 rawId,
        uint256 index,
        uint256 amount,
        bool exactOutput
    ) private view returns (bool ok, uint256 quote) {
        if (amount == 0) return (false, 0);
        FlashVenueRegistry.Venue memory venue = registry.venueAt(rawId, index);
        if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) return (false, 0);
        Currency token = zeroForOne ? key.currency0 : key.currency1;
        Currency quoteToken = zeroForOne ? key.currency1 : key.currency0;
        return exactOutput
            ? IFlashSafeVenueAdapter(venue.adapter)
                .tryQuoteExactOutput(venue.venuePool, Currency.unwrap(token), Currency.unwrap(quoteToken), amount)
            : IFlashSafeVenueAdapter(venue.adapter)
                .tryQuoteExactInput(venue.venuePool, Currency.unwrap(token), Currency.unwrap(quoteToken), amount);
    }

    function _sellProtocolFee(PoolKey calldata key, bool zeroForOne)
        private
        view
        returns (uint24 feePips, bool usable)
    {
        (,, uint24 packed,) = poolManager.getSlot0(key.toId());
        uint24 raw =
            zeroForOne ? ProtocolFeeLibrary.getZeroForOneFee(packed) : ProtocolFeeLibrary.getOneForZeroFee(packed);
        feePips = raw * uint24(PROTOCOL_FEE_MULTIPLIER);
        if (feePips == 0) return (0, true);
        address controller = poolManager.protocolFeeController();
        if (controller.code.length == 0) return (feePips, false);
        try IFlashV4FeeJarSource(controller).TOKEN_JAR() returns (address jar) {
            usable = jar != address(0);
        } catch {}
    }

    function _sellProtocolFeeAmount(uint24 feePips, bool exactInput, uint256 basis) private pure returns (uint256) {
        if (feePips == 0 || basis == 0) return 0;
        return exactInput
            ? FullMath.mulDivRoundingUp(basis, feePips, PIPS)
            : FullMath.mulDivRoundingUp(basis, feePips, PIPS - feePips);
    }

    function _externalExactInputMarginal(uint24 feePips, uint256 currentGross, uint256 oldQuote, uint256 nextQuote)
        private
        pure
        returns (uint256)
    {
        uint256 currentNet = currentGross - _sellProtocolFeeAmount(feePips, true, currentGross);
        uint256 nextGross = currentGross - oldQuote + nextQuote;
        return nextGross - _sellProtocolFeeAmount(feePips, true, nextGross) - currentNet;
    }

    function _externalExactOutputMarginal(uint24 feePips, uint256 currentRaw, uint256 oldQuote, uint256 nextQuote)
        private
        pure
        returns (uint256)
    {
        uint256 currentCost = currentRaw + _sellProtocolFeeAmount(feePips, false, currentRaw);
        uint256 nextRaw = currentRaw - oldQuote + nextQuote;
        return nextRaw + _sellProtocolFeeAmount(feePips, false, nextRaw) - currentCost;
    }

    function _sellExternalRaw(SellGrid memory grid) private pure returns (uint256 total) {
        for (uint256 i; i < MAX_EXTERNAL; ++i) {
            total += grid.venueQuote[i];
        }
    }
}
