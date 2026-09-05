// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FlashVenueRegistry} from "../FlashVenueRegistry.sol";
import {IFlashVenueAdapter} from "./IFlashVenueAdapter.sol";
import {IFlashSafeVenueAdapter} from "./IFlashSafeVenueAdapter.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";

/// @notice Curve-agnostic split planner over the bounded FLASH venue registry.
/// @dev The optimizer consumes only cumulative executable quotes, so every
/// approved adapter participates through the same interface. Twenty fixed
/// slices bound gas and provide 5% marginal allocation without hookData.
contract FlashVenueFleetOptimizer {
    error InvalidAmount();

    uint256 public constant SLICES = 20;
    uint256 private constant MAX_VENUES = 4;
    uint256 private constant BPS = 10_000;
    uint256 private constant Q64 = 1 << 64;
    uint256 private constant Q128 = 1 << 128;

    FlashVenueRegistry public immutable registry;

    struct Plan {
        bool found;
        bool mathematicalFastPath;
        uint8 availableRoutes;
        uint8 usedRoutes;
        uint8[4] venueIndex;
        uint128[4] amountIn;
        uint256[4] amountOut;
        uint256 totalOut;
    }

    struct Workspace {
        address[4] adapters;
        address[4] pools;
        uint8[4] allocated;
        bool[4] nextValid;
        uint256[4] currentQuote;
        uint256[4] nextQuote;
    }

    struct ExactOutputWorkspace {
        address[4] adapters;
        address[4] pools;
        uint8[4] allocated;
        bool[4] nextValid;
        uint256[4] currentInput;
        uint256[4] nextInput;
    }

    struct ConstantProductRoute {
        address adapter;
        address pool;
        uint256 reserveIn;
        uint256 reserveOut;
        uint256 feeFactor;
        uint8 venueIndex;
    }

    struct ConstantProductWorkspace {
        ConstantProductRoute[4] routes;
        uint8 count;
    }

    constructor(FlashVenueRegistry registry_) {
        registry = registry_;
    }

    function planExactInput(bytes32 poolId, address tokenIn, address tokenOut, uint256 totalInput)
        external
        view
        returns (Plan memory plan)
    {
        if (totalInput == 0 || totalInput > type(uint128).max) revert InvalidAmount();
        (Plan memory fast, bool fastAvailable) = _constantProductPlan(poolId, tokenIn, tokenOut, totalInput);
        if (fastAvailable) return fast;
        return _gridPlan(poolId, tokenIn, tokenOut, totalInput);
    }

    /// @notice Finds the lowest-input bounded split that produces exactly
    /// `totalOutput` across the verified venue fleet.
    function planExactOutput(bytes32 poolId, address tokenIn, address tokenOut, uint256 totalOutput)
        external
        view
        returns (Plan memory plan)
    {
        if (totalOutput == 0 || totalOutput > type(uint128).max) revert InvalidAmount();
        uint256 slice = totalOutput / SLICES;
        if (slice == 0) return _bestSingleExactOutput(poolId, tokenIn, tokenOut, totalOutput);

        ExactOutputWorkspace memory work;
        uint256 count = registry.venueCount(poolId);
        if (count > MAX_VENUES) count = MAX_VENUES;
        for (uint256 registryIndex; registryIndex < count; ++registryIndex) {
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, registryIndex);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) continue;
            (bool ok, uint256 firstInput) =
                _tryQuoteExactOutput(venue.adapter, venue.venuePool, tokenIn, tokenOut, slice);
            if (!ok) continue;
            uint256 column = plan.availableRoutes;
            plan.venueIndex[column] = uint8(registryIndex);
            work.adapters[column] = venue.adapter;
            work.pools[column] = venue.venuePool;
            work.nextValid[column] = true;
            work.nextInput[column] = firstInput;
            ++plan.availableRoutes;
        }
        if (plan.availableRoutes == 0) return plan;

        for (uint256 step; step < SLICES; ++step) {
            (bool found, uint256 best) = _lowestMarginalInput(plan.availableRoutes, work);
            if (!found) return _empty(plan);
            work.currentInput[best] = work.nextInput[best];
            ++work.allocated[best];
            if (work.allocated[best] < SLICES) {
                (work.nextValid[best], work.nextInput[best]) = _tryQuoteExactOutput(
                    work.adapters[best],
                    work.pools[best],
                    tokenIn,
                    tokenOut,
                    slice * (uint256(work.allocated[best]) + 1)
                );
                if (work.nextInput[best] < work.currentInput[best]) work.nextValid[best] = false;
            } else {
                work.nextValid[best] = false;
            }
        }

        uint256 remainder = totalOutput - slice * SLICES;
        if (remainder != 0) {
            (bool found, uint256 best, uint256 finalInput) =
                _lowestRemainderInput(plan.availableRoutes, work, slice, remainder, tokenIn, tokenOut);
            if (!found) return _empty(plan);
            plan.amountOut[best] = uint256(work.allocated[best]) * slice + remainder;
            plan.amountIn[best] = uint128(finalInput);
        }

        for (uint256 i; i < plan.availableRoutes; ++i) {
            if (work.allocated[i] == 0) continue;
            ++plan.usedRoutes;
            if (plan.amountOut[i] == 0) {
                plan.amountOut[i] = uint256(work.allocated[i]) * slice;
                plan.amountIn[i] = uint128(work.currentInput[i]);
            }
            plan.totalOut += plan.amountOut[i];
        }
        plan.found = plan.usedRoutes != 0 && plan.totalOut == totalOutput;
        if (plan.found) {
            Plan memory single = _bestSingleExactOutput(poolId, tokenIn, tokenOut, totalOutput);
            if (single.found && _totalInput(single) < _totalInput(plan)) return single;
        }
    }

    function _gridPlan(bytes32 poolId, address tokenIn, address tokenOut, uint256 totalInput)
        private
        view
        returns (Plan memory plan)
    {
        uint256 slice = totalInput / SLICES;
        if (slice == 0) return _bestSingle(poolId, tokenIn, tokenOut, totalInput);

        Workspace memory work;
        uint256 count = registry.venueCount(poolId);
        if (count > MAX_VENUES) count = MAX_VENUES;

        for (uint256 registryIndex; registryIndex < count; ++registryIndex) {
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, registryIndex);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) continue;
            uint256 column = plan.availableRoutes;
            (bool quoteOk, uint256 firstQuote) = _tryQuote(venue.adapter, venue.venuePool, tokenIn, tokenOut, slice);
            if (!quoteOk || firstQuote == 0) continue;
            plan.venueIndex[column] = uint8(registryIndex);
            work.adapters[column] = venue.adapter;
            work.pools[column] = venue.venuePool;
            work.nextValid[column] = true;
            work.nextQuote[column] = firstQuote;
            ++plan.availableRoutes;
        }
        if (plan.availableRoutes == 0) return plan;

        for (uint256 step; step < SLICES; ++step) {
            (bool hasRoute, uint256 best) = _bestMarginal(plan.availableRoutes, work);
            if (!hasRoute) return _empty(plan);
            work.currentQuote[best] = work.nextQuote[best];
            ++work.allocated[best];
            if (work.allocated[best] < SLICES) {
                (work.nextValid[best], work.nextQuote[best]) = _tryQuote(
                    work.adapters[best],
                    work.pools[best],
                    tokenIn,
                    tokenOut,
                    slice * (uint256(work.allocated[best]) + 1)
                );
                if (work.nextQuote[best] < work.currentQuote[best]) work.nextValid[best] = false;
            } else {
                work.nextValid[best] = false;
            }
        }

        uint256 remainder = totalInput - slice * SLICES;
        if (remainder != 0) {
            (bool hasRemainderRoute, uint256 bestRemainder, uint256 finalOutput) =
                _bestRemainder(plan.availableRoutes, work, slice, remainder, tokenIn, tokenOut);
            if (!hasRemainderRoute) return _empty(plan);
            plan.amountOut[bestRemainder] = finalOutput;
            plan.amountIn[bestRemainder] = uint128(uint256(work.allocated[bestRemainder]) * slice + remainder);
        }

        for (uint256 i; i < plan.availableRoutes; ++i) {
            if (work.allocated[i] == 0) continue;
            ++plan.usedRoutes;
            if (plan.amountIn[i] == 0) {
                plan.amountIn[i] = uint128(uint256(work.allocated[i]) * slice);
                plan.amountOut[i] = work.currentQuote[i];
            }
            plan.totalOut += plan.amountOut[i];
        }
        plan.found = plan.usedRoutes != 0;
    }

    function _constantProductPlan(bytes32 poolId, address tokenIn, address tokenOut, uint256 totalInput)
        private
        view
        returns (Plan memory plan, bool available)
    {
        ConstantProductWorkspace memory work;
        uint256 count = registry.venueCount(poolId);
        if (count > MAX_VENUES) count = MAX_VENUES;
        for (uint256 registryIndex; registryIndex < count; ++registryIndex) {
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, registryIndex);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) continue;
            (uint8 modelStatus, ConstantProductRoute memory route) =
                _safeConstantProductRoute(venue, tokenIn, tokenOut, uint8(registryIndex));
            if (modelStatus == 0) return (plan, false);
            // A verified constant-product pool can legitimately become empty
            // after registration. Ignore only that route; other healthy
            // constant-product venues retain the exact allocation path.
            if (modelStatus == 1) continue;
            work.routes[work.count] = route;
            ++work.count;
        }
        if (work.count == 0) return (plan, false);
        plan = _solveConstantProduct(work, totalInput);
        if (!plan.found) return (plan, false);

        // Final adapter quotes prove the local model and rounding match the
        // executable adapter before the plan is accepted.
        for (uint256 i; i < work.count; ++i) {
            uint256 amount = plan.amountIn[i];
            if (amount == 0) continue;
            (bool quoteAvailable, uint256 output) = IFlashSafeVenueAdapter(work.routes[i].adapter)
                .tryQuoteExactInput(work.routes[i].pool, tokenIn, tokenOut, amount);
            if (!quoteAvailable || output != plan.amountOut[i]) return (_empty(plan), false);
        }
        plan.mathematicalFastPath = true;
        return (plan, true);
    }

    /// @dev status: 0 = adapter has no safe CP model, 1 = empty model,
    /// 2 = usable model. Isolating ABI decode keeps the planner stack bounded.
    function _safeConstantProductRoute(
        FlashVenueRegistry.Venue memory venue,
        address tokenIn,
        address tokenOut,
        uint8 venueIndex
    ) private view returns (uint8 status, ConstantProductRoute memory route) {
        (bool available, uint256 reserveIn, uint256 reserveOut, uint16 feeBps,) =
            IFlashSafeVenueAdapter(venue.adapter).tryConstantProductModel(
                venue.venuePool, tokenIn, tokenOut
            );
        if (!available) return (0, route);
        if (reserveIn == 0 || reserveOut == 0) return (1, route);
        if (reserveIn > type(uint112).max || reserveOut > type(uint112).max || feeBps >= BPS) {
            return (0, route);
        }
        route = ConstantProductRoute({
            adapter: venue.adapter,
            pool: venue.venuePool,
            reserveIn: reserveIn,
            reserveOut: reserveOut,
            feeFactor: BPS - feeBps,
            venueIndex: venueIndex
        });
        status = 2;
    }

    function _solveConstantProduct(ConstantProductWorkspace memory work, uint256 totalInput)
        private
        pure
        returns (Plan memory plan)
    {
        uint256 bestOutput;
        uint128[4] memory bestAllocation;
        uint256 bestMask;
        uint8[4] memory order = _constantProductOrder(work);
        uint256 mask;
        for (uint256 active; active < work.count; ++active) {
            mask |= uint256(1) << order[active];
            (uint128[4] memory allocation, bool valid) = _constantProductCandidate(work, totalInput, mask);
            if (!valid) continue;
            uint256 output = _constantProductOutput(work, allocation);
            // Prefer the wider active prefix on a tie so the bounded integer
            // refinement can recover cross-route rounding value.
            if (output >= bestOutput) {
                bestOutput = output;
                bestAllocation = allocation;
                bestMask = mask;
            }
        }
        if (bestOutput == 0) return plan;
        _improveIntegerNeighbors(work, bestAllocation, bestMask);
        _consolidateZeroOutputDust(work, bestAllocation, bestMask);
        bestOutput = _constantProductOutput(work, bestAllocation);
        plan.found = true;
        plan.availableRoutes = work.count;
        plan.totalOut = bestOutput;
        for (uint256 i; i < work.count; ++i) {
            plan.venueIndex[i] = work.routes[i].venueIndex;
            plan.amountIn[i] = bestAllocation[i];
            if (bestAllocation[i] == 0) continue;
            ++plan.usedRoutes;
            plan.amountOut[i] = _constantProductQuote(work.routes[i], bestAllocation[i]);
        }
    }

    function _constantProductOrder(ConstantProductWorkspace memory work) private pure returns (uint8[4] memory order) {
        for (uint8 i; i < work.count; ++i) {
            order[i] = i;
            uint256 cursor = i;
            while (cursor != 0 && _betterInitialPrice(work.routes[order[cursor]], work.routes[order[cursor - 1]])) {
                (order[cursor], order[cursor - 1]) = (order[cursor - 1], order[cursor]);
                --cursor;
            }
        }
    }

    function _betterInitialPrice(ConstantProductRoute memory a, ConstantProductRoute memory b)
        private
        pure
        returns (bool)
    {
        return a.feeFactor * a.reserveOut * b.reserveIn > b.feeFactor * b.reserveOut * a.reserveIn;
    }

    function _constantProductCandidate(ConstantProductWorkspace memory work, uint256 totalInput, uint256 mask)
        private
        pure
        returns (uint128[4] memory allocation, bool valid)
    {
        uint256[4] memory priceWeight;
        uint256[4] memory reserveOffset;
        uint256 sumWeight;
        uint256 sumOffset;
        for (uint256 i; i < work.count; ++i) {
            if (mask & (uint256(1) << i) == 0) continue;
            ConstantProductRoute memory route = work.routes[i];
            uint256 root = FixedPointMathLib.sqrt(route.feeFactor * route.reserveOut * route.reserveIn * BPS);
            priceWeight[i] = FullMath.mulDiv(root, Q64, route.feeFactor);
            reserveOffset[i] = route.reserveIn * BPS / route.feeFactor;
            sumWeight += priceWeight[i];
            sumOffset += reserveOffset[i];
        }
        if (sumWeight == 0) return (allocation, false);
        uint256 common = FullMath.mulDiv(totalInput + sumOffset, Q128, sumWeight);
        uint256 allocated;
        uint256 largest;
        for (uint256 i; i < work.count; ++i) {
            if (mask & (uint256(1) << i) == 0) continue;
            uint256 gross = FullMath.mulDiv(common, priceWeight[i], Q128);
            if (gross <= reserveOffset[i]) return (allocation, false);
            uint256 amount = gross - reserveOffset[i];
            if (amount > type(uint128).max) return (allocation, false);
            allocation[i] = uint128(amount);
            allocated += amount;
            if (allocation[i] > allocation[largest]) largest = i;
        }
        if (allocated > totalInput) {
            uint256 excess = allocated - totalInput;
            if (allocation[largest] < excess) return (allocation, false);
            allocation[largest] -= uint128(excess);
        } else if (allocated < totalInput) {
            uint256 remainder = totalInput - allocated;
            uint256 best = _bestConstantProductAddition(work, allocation, mask, remainder);
            allocation[best] += uint128(remainder);
        }
        valid = true;
    }

    function _bestConstantProductAddition(
        ConstantProductWorkspace memory work,
        uint128[4] memory allocation,
        uint256 mask,
        uint256 amount
    ) private pure returns (uint256 best) {
        uint256 bestGain;
        bool found;
        for (uint256 i; i < work.count; ++i) {
            if (mask & (uint256(1) << i) == 0) continue;
            uint256 beforeQuote = _constantProductQuote(work.routes[i], allocation[i]);
            uint256 afterQuote = _constantProductQuote(work.routes[i], uint256(allocation[i]) + amount);
            uint256 gain = afterQuote - beforeQuote;
            if (!found || gain > bestGain || (gain == bestGain && allocation[i] > allocation[best])) {
                found = true;
                bestGain = gain;
                best = i;
            }
        }
    }

    function _improveIntegerNeighbors(ConstantProductWorkspace memory work, uint128[4] memory allocation, uint256 mask)
        private
        pure
    {
        // The continuous optimum leaves integer rounding plateaus. Search a
        // fixed, input-independent neighborhood large enough to cross those
        // plateaus even in very shallow pools; the bound keeps callback gas
        // independent of trade size.
        for (uint256 pass; pass < 8; ++pass) {
            uint256 bestGain;
            uint256 bestFrom;
            uint256 bestTo;
            uint256 bestStep;
            for (uint256 from; from < work.count; ++from) {
                if (allocation[from] == 0 || mask & (uint256(1) << from) == 0) continue;
                for (uint256 to; to < work.count; ++to) {
                    if (from == to || mask & (uint256(1) << to) == 0) continue;
                    uint256 beforeQuote = _constantProductQuote(work.routes[from], allocation[from])
                        + _constantProductQuote(work.routes[to], allocation[to]);
                    for (uint256 step = 1; step <= 64 && step <= allocation[from]; ++step) {
                        uint256 afterQuote = _constantProductQuote(work.routes[from], allocation[from] - step)
                            + _constantProductQuote(work.routes[to], allocation[to] + step);
                        uint256 gain = afterQuote > beforeQuote ? afterQuote - beforeQuote : 0;
                        if (gain > bestGain) {
                            bestGain = gain;
                            bestFrom = from;
                            bestTo = to;
                            bestStep = step;
                        }
                    }
                }
            }
            if (bestGain == 0) break;
            allocation[bestFrom] -= uint128(bestStep);
            allocation[bestTo] += uint128(bestStep);
        }
    }

    function _consolidateZeroOutputDust(
        ConstantProductWorkspace memory work,
        uint128[4] memory allocation,
        uint256 mask
    ) private pure {
        uint256 dust;
        for (uint256 i; i < work.count; ++i) {
            if (allocation[i] != 0 && _constantProductQuote(work.routes[i], allocation[i]) == 0) {
                dust += allocation[i];
                allocation[i] = 0;
            }
        }
        if (dust != 0) {
            uint256 best = _bestConstantProductAddition(work, allocation, mask, dust);
            allocation[best] += uint128(dust);
        }
    }

    function _constantProductOutput(ConstantProductWorkspace memory work, uint128[4] memory allocation)
        private
        pure
        returns (uint256 output)
    {
        for (uint256 i; i < work.count; ++i) {
            output += _constantProductQuote(work.routes[i], allocation[i]);
        }
    }

    function _constantProductQuote(ConstantProductRoute memory route, uint256 amountIn) private pure returns (uint256) {
        if (amountIn == 0) return 0;
        uint256 net = amountIn * route.feeFactor;
        return net * route.reserveOut / (route.reserveIn * BPS + net);
    }

    function _tryQuote(address adapter, address pool, address tokenIn, address tokenOut, uint256 amount)
        private
        view
        returns (bool ok, uint256 output)
    {
        (ok, output) = IFlashSafeVenueAdapter(adapter).tryQuoteExactInput(pool, tokenIn, tokenOut, amount);
        ok = ok && output != 0;
    }

    function _tryQuoteExactOutput(address adapter, address pool, address tokenIn, address tokenOut, uint256 amount)
        private
        view
        returns (bool ok, uint256 input)
    {
        (ok, input) = IFlashSafeVenueAdapter(adapter).tryQuoteExactOutput(pool, tokenIn, tokenOut, amount);
        ok = ok && input != 0 && input <= type(uint128).max;
    }

    function _lowestMarginalInput(uint256 routes, ExactOutputWorkspace memory work)
        private
        pure
        returns (bool found, uint256 best)
    {
        uint256 lowest;
        for (uint256 i; i < routes; ++i) {
            if (!work.nextValid[i]) continue;
            uint256 marginal = work.nextInput[i] - work.currentInput[i];
            if (!found || marginal < lowest) {
                found = true;
                best = i;
                lowest = marginal;
            }
        }
    }

    function _lowestRemainderInput(
        uint256 routes,
        ExactOutputWorkspace memory work,
        uint256 slice,
        uint256 remainder,
        address tokenIn,
        address tokenOut
    ) private view returns (bool found, uint256 best, uint256 finalInput) {
        uint256 lowest;
        for (uint256 i; i < routes; ++i) {
            if (work.allocated[i] == 0) continue;
            uint256 currentInput = work.currentInput[i];
            uint256 candidateOutput = uint256(work.allocated[i]) * slice + remainder;
            (bool ok, uint256 candidateInput) =
                _tryQuoteExactOutput(work.adapters[i], work.pools[i], tokenIn, tokenOut, candidateOutput);
            if (!ok || candidateInput < currentInput) continue;
            uint256 marginal = candidateInput - currentInput;
            if (!found || marginal < lowest) {
                found = true;
                best = i;
                lowest = marginal;
                finalInput = candidateInput;
            }
        }
    }

    function _bestMarginal(uint256 routes, Workspace memory work) private pure returns (bool found, uint256 best) {
        uint256 bestMarginal;
        for (uint256 i; i < routes; ++i) {
            if (!work.nextValid[i]) continue;
            uint256 marginal = work.nextQuote[i] - work.currentQuote[i];
            if (!found || marginal > bestMarginal) {
                found = true;
                best = i;
                bestMarginal = marginal;
            }
        }
    }

    function _bestRemainder(
        uint256 routes,
        Workspace memory work,
        uint256 slice,
        uint256 remainder,
        address tokenIn,
        address tokenOut
    ) private view returns (bool found, uint256 best, uint256 finalOutput) {
        uint256 bestMarginal;
        for (uint256 i; i < routes; ++i) {
            uint256 currentOutput = work.currentQuote[i];
            uint256 candidateInput = uint256(work.allocated[i]) * slice + remainder;
            (bool quoteAvailable, uint256 candidateOutput) = IFlashSafeVenueAdapter(work.adapters[i])
                .tryQuoteExactInput(work.pools[i], tokenIn, tokenOut, candidateInput);
            if (!quoteAvailable || candidateOutput < currentOutput) continue;
            uint256 marginal = candidateOutput - currentOutput;
            if (!found || marginal > bestMarginal) {
                found = true;
                best = i;
                bestMarginal = marginal;
                finalOutput = candidateOutput;
            }
        }
    }

    function _bestSingle(bytes32 poolId, address tokenIn, address tokenOut, uint256 amountIn)
        private
        view
        returns (Plan memory plan)
    {
        uint256 count = registry.venueCount(poolId);
        if (count > MAX_VENUES) count = MAX_VENUES;
        for (uint256 i; i < count; ++i) {
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, i);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) continue;
            ++plan.availableRoutes;
            (bool quoteAvailable, uint256 output) = IFlashSafeVenueAdapter(venue.adapter)
                .tryQuoteExactInput(venue.venuePool, tokenIn, tokenOut, amountIn);
            if (quoteAvailable && output != 0 && (!plan.found || output > plan.totalOut)) {
                plan.found = true;
                plan.usedRoutes = 1;
                plan.venueIndex[0] = uint8(i);
                plan.amountIn[0] = uint128(amountIn);
                plan.amountOut[0] = output;
                plan.totalOut = output;
            }
        }
    }

    function _bestSingleExactOutput(bytes32 poolId, address tokenIn, address tokenOut, uint256 amountOut)
        private
        view
        returns (Plan memory plan)
    {
        uint256 count = registry.venueCount(poolId);
        if (count > MAX_VENUES) count = MAX_VENUES;
        uint256 lowestInput;
        for (uint256 i; i < count; ++i) {
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, i);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) continue;
            ++plan.availableRoutes;
            (bool ok, uint256 input) =
                _tryQuoteExactOutput(venue.adapter, venue.venuePool, tokenIn, tokenOut, amountOut);
            if (ok && (!plan.found || input < lowestInput)) {
                plan.found = true;
                plan.usedRoutes = 1;
                plan.venueIndex[0] = uint8(i);
                plan.amountIn[0] = uint128(input);
                plan.amountOut[0] = amountOut;
                plan.totalOut = amountOut;
                lowestInput = input;
            }
        }
    }

    function _empty(Plan memory prior) private pure returns (Plan memory plan) {
        plan.availableRoutes = prior.availableRoutes;
    }

    function _totalInput(Plan memory plan) private pure returns (uint256 total) {
        for (uint256 i; i < MAX_VENUES; ++i) total += plan.amountIn[i];
    }
}
