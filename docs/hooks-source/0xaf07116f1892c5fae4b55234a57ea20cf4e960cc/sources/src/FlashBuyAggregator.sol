// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {ProtocolFeeLibrary} from "@uniswap/v4-core/src/libraries/ProtocolFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

import {FlashVenueRegistry} from "./FlashVenueRegistry.sol";
import {IFlashVenueAdapter} from "./venues/IFlashVenueAdapter.sol";
import {IFlashSafeVenueAdapter} from "./venues/IFlashSafeVenueAdapter.sol";
import {FlashV4StateQuoter} from "./FlashV4StateQuoter.sol";

interface IFlashBuyRegistry {
    function protocolTokenOfPool(PoolId id) external view returns (Currency);
}

interface IFlashV4FeeAdapter {
    function TOKEN_JAR() external view returns (address);
}

/// @notice Exact ordinary-buy planner/executor across the native FLASH v4 pool
/// and every enabled verified external venue. OTC is priced from the realized
/// aggregate AMM ratio and remains full-fill-or-skip.
contract FlashBuyAggregator {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using TransientStateLibrary for IPoolManager;
    using StateLibrary for IPoolManager;
    using SafeTransferLib for ERC20;

    error NotHook();
    error NotSelf();
    error InvalidConfiguration();
    error InvalidPlan();
    error NoRoute();
    error Reentered();

    uint256 private constant BPS = 10_000;
    uint256 private constant SLICES = 20;
    uint256 private constant MAX_EXTERNAL = 4;
    uint24 public constant PROTOCOL_FEE_MULTIPLIER = 25;

    struct BuyPlan {
        bool exactOutput;
        bool useOtc;
        uint128 specifiedAmount;
        uint128 ammInput;
        uint128 ammOutput;
        uint128 maxAmmInput;
        uint128 maxTotalInput;
        uint128 fallbackInput;
        uint128 fallbackOutput;
        uint128 v4Input;
        uint128 v4Output;
        uint8[4] venueIndex;
        uint128[4] venueInput;
        uint128[4] venueOutput;
    }

    struct RoutePlan {
        uint256 input;
        uint256 output;
        uint256 v4Input;
        uint256 v4Output;
        uint8[4] venueIndex;
        uint128[4] venueInput;
        uint128[4] venueOutput;
    }

    struct GridState {
        uint256 v4Amount;
        uint256 v4Quote;
        uint256[4] venueAmount;
        uint256[4] venueQuote;
    }

    struct Addition {
        bool found;
        uint8 best;
        uint256 quote;
        uint256 marginal;
    }

    IPoolManager public immutable poolManager;
    address public immutable hook;
    FlashVenueRegistry public immutable venueRegistry;
    bool private entered;

    event OrdinaryBuyRouted(
        bytes32 indexed poolId,
        bool exactOutput,
        uint256 ammInput,
        uint256 ammOutput,
        uint256 v4Input,
        uint256 externalInput,
        bool usedFallback
    );
    event ExternalProtocolFee(
        bytes32 indexed poolId,
        address indexed tokenJar,
        Currency currency,
        bool exactOutput,
        uint256 basis,
        uint256 amount
    );

    constructor(IPoolManager pm, address hook_, FlashVenueRegistry registry_) {
        if (address(pm) == address(0) || hook_ == address(0) || address(registry_).code.length == 0) {
            revert InvalidConfiguration();
        }
        poolManager = pm;
        hook = hook_;
        venueRegistry = registry_;
    }

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    /// @notice Returns the multiplied protocol fee and current governance
    /// TokenJar for the externally executed part of a Flash swap. The native
    /// v4 part is charged independently by PoolManager.
    function externalProtocolFeeConfig(PoolId id, bool zeroForOne)
        public
        view
        returns (uint24 feePips, address tokenJar)
    {
        (,, uint24 packed,) = poolManager.getSlot0(id);
        uint24 raw =
            zeroForOne ? ProtocolFeeLibrary.getZeroForOneFee(packed) : ProtocolFeeLibrary.getOneForZeroFee(packed);
        feePips = raw * PROTOCOL_FEE_MULTIPLIER;
        if (feePips == 0) return (0, address(0));
        address controller = poolManager.protocolFeeController();
        if (controller.code.length == 0) return (feePips, address(0));
        try IFlashV4FeeAdapter(controller).TOKEN_JAR() returns (address currentJar) {
            tokenJar = currentJar;
        } catch {}
    }

    /// @notice Canonical Uniswap aggregator-hook fee arithmetic. Exact-input
    /// fees are a fraction of output; exact-output fees are grossed up so the
    /// fee is the configured fraction of total input. Both round up.
    function externalProtocolFeeQuote(PoolId id, bool zeroForOne, bool exactInput, uint256 amountUnspecified)
        external
        view
        onlyHook
        returns (address tokenJar, uint256 feeAmount)
    {
        uint24 feePips;
        (feePips, tokenJar) = externalProtocolFeeConfig(id, zeroForOne);
        if (feePips == 0 || tokenJar == address(0)) return (tokenJar, 0);
        feeAmount = _protocolFeeAmount(feePips, exactInput, amountUnspecified);
    }

    /// @notice Plans the AMM remainder and determines whether the requested OTC
    /// slice is fully supportable under both the selected route and direct-v4
    /// execution fallback.
    function planBuy(PoolKey calldata key, SwapParams calldata params, uint16 otcBps, uint256 otcInventory)
        external
        view
        onlyHook
        returns (BuyPlan memory plan)
    {
        if (otcBps >= BPS || params.amountSpecified == 0) revert InvalidPlan();
        bool exactOutput = params.amountSpecified > 0;
        uint256 specified = exactOutput ? uint256(params.amountSpecified) : uint256(-params.amountSpecified);
        if (specified > uint256(uint128(type(int128).max))) revert InvalidPlan();
        plan.exactOutput = exactOutput;
        plan.specifiedAmount = uint128(specified);

        plan = exactOutput
            ? _planExactOutput(key, plan, otcBps, otcInventory)
            : _planExactInput(key, plan, otcBps, otcInventory);
        (Currency quote,) = _buyCurrencies(key);
        if (ERC20(Currency.unwrap(quote)).balanceOf(address(poolManager)) < plan.maxTotalInput) {
            delete plan;
        }
        return plan;
    }

    function _planExactInput(PoolKey calldata key, BuyPlan memory plan, uint16 otcBps, uint256 inventory)
        private
        view
        returns (BuyPlan memory)
    {
        uint256 totalInput = plan.specifiedAmount;
        uint256 otcInput = totalInput * otcBps / BPS;
        uint256 ammInput = totalInput - otcInput;
        RoutePlan memory selected = _planExactInputRoutes(key, ammInput);
        (bool fallbackFound, uint256 fallbackQuote) = _tryV4(key, false, ammInput);
        uint256 fallbackInput = fallbackFound ? ammInput : 0;
        uint256 fallbackOutput = fallbackFound ? fallbackQuote : 0;
        uint256 selectedOtc = otcInput == 0 ? 0 : otcInput * selected.output / ammInput;
        uint256 fallbackOtc = otcInput == 0 || !fallbackFound ? 0 : otcInput * fallbackOutput / fallbackInput;
        if (otcInput == 0 || selectedOtc == 0 || inventory < _max(selectedOtc, fallbackOtc)) {
            otcInput = 0;
            ammInput = totalInput;
            selected = _planExactInputRoutes(key, ammInput);
            (fallbackFound, fallbackQuote) = _tryV4(key, false, ammInput);
            fallbackInput = fallbackFound ? ammInput : 0;
            fallbackOutput = fallbackFound ? fallbackQuote : 0;
        } else {
            plan.useOtc = true;
        }
        _storeRoute(plan, selected);
        plan.ammInput = uint128(ammInput);
        plan.ammOutput = uint128(selected.output);
        plan.maxAmmInput = uint128(ammInput);
        plan.maxTotalInput = plan.specifiedAmount;
        plan.fallbackInput = uint128(fallbackInput);
        plan.fallbackOutput = uint128(fallbackOutput);
        return plan;
    }

    function _planExactOutput(PoolKey calldata key, BuyPlan memory plan, uint16 otcBps, uint256 inventory)
        private
        view
        returns (BuyPlan memory)
    {
        uint256 totalOutput = plan.specifiedAmount;
        uint256 otcOutput = totalOutput * otcBps / BPS;
        uint256 ammOutput = totalOutput - otcOutput;
        if (otcOutput == 0 || inventory < otcOutput) {
            otcOutput = 0;
            ammOutput = totalOutput;
        } else {
            plan.useOtc = true;
        }
        RoutePlan memory selected = _planExactOutputRoutes(key, ammOutput);
        (bool fallbackFound, uint256 fallbackQuote) = _tryV4(key, true, ammOutput);
        uint256 fallbackInput = fallbackFound ? fallbackQuote : 0;
        uint256 fallbackOutput = fallbackFound ? ammOutput : 0;
        _storeRoute(plan, selected);
        plan.ammInput = uint128(selected.input);
        plan.ammOutput = uint128(ammOutput);
        plan.maxAmmInput = uint128(_max(selected.input, fallbackInput));
        uint256 maxTotalInput = plan.maxAmmInput;
        if (plan.useOtc) {
            maxTotalInput += FullMath.mulDivRoundingUp(totalOutput - ammOutput, plan.maxAmmInput, ammOutput);
        }
        if (maxTotalInput > type(uint128).max) revert InvalidPlan();
        plan.maxTotalInput = uint128(maxTotalInput);
        plan.fallbackInput = uint128(fallbackInput);
        plan.fallbackOutput = uint128(fallbackOutput);
        return plan;
    }

    /// @return actualInput AMM input consumed after selected-plan execution or
    /// direct-v4 soft fallback.
    /// @return actualOutput AMM output delivered to the hook.
    /// @return usedFallback True when any selected route failed atomically.
    function executeBuy(PoolKey calldata key, BuyPlan calldata plan)
        external
        onlyHook
        returns (uint256 actualInput, uint256 actualOutput, bool usedFallback)
    {
        if (entered) revert Reentered();
        entered = true;
        _validatePlan(plan);
        (Currency quote, Currency token) = _buyCurrencies(key);
        ERC20 input = ERC20(Currency.unwrap(quote));
        ERC20 output = ERC20(Currency.unwrap(token));
        uint256 inputBefore = input.balanceOf(address(this));
        uint256 outputBefore = output.balanceOf(address(this));
        // `onlyHook` fixes the payer; the caller cannot select an arbitrary
        // third-party `from` address.
        // slither-disable-next-line arbitrary-send-erc20
        input.safeTransferFrom(hook, address(this), plan.maxAmmInput);

        try this.executeSelected(key, plan) returns (uint256 spent, uint256 received) {
            actualInput = spent;
            actualOutput = received;
        } catch {
            // A selected external route can remain valid after the native pool
            // becomes too thin to satisfy the whole request. In that case the
            // native fallback is intentionally absent and a failed selected
            // execution must roll the transaction back atomically.
            if (plan.fallbackInput == 0 || plan.fallbackOutput == 0) revert InvalidPlan();
            usedFallback = true;
            (actualInput, actualOutput) =
                _executeV4(key, plan.exactOutput, plan.exactOutput ? plan.ammOutput : plan.ammInput);
            if (actualInput != plan.fallbackInput || actualOutput != plan.fallbackOutput) revert InvalidPlan();
        }

        if (actualInput > plan.maxAmmInput || actualOutput == 0) revert InvalidPlan();
        uint256 unused = plan.maxAmmInput - actualInput;
        if (unused != 0) input.safeTransfer(hook, unused);
        output.safeTransfer(hook, actualOutput);
        if (input.balanceOf(address(this)) != inputBefore || output.balanceOf(address(this)) != outputBefore) {
            revert InvalidPlan();
        }
        entered = false;
        _emitRouted(key, plan, actualInput, actualOutput, usedFallback);
    }

    function executeSelected(PoolKey calldata key, BuyPlan calldata plan)
        external
        onlySelf
        returns (uint256 spent, uint256 received)
    {
        if (plan.v4Input != 0) {
            (uint256 v4Spent, uint256 v4Received) =
                _executeV4(key, plan.exactOutput, plan.exactOutput ? plan.v4Output : plan.v4Input);
            if (v4Spent != plan.v4Input || v4Received != plan.v4Output) revert InvalidPlan();
            spent += v4Spent;
            received += v4Received;
        }
        (Currency quote, Currency token) = _buyCurrencies(key);
        uint256 externalSpent;
        uint256 externalReceived;
        for (uint256 i; i < MAX_EXTERNAL; ++i) {
            uint256 routeInput = plan.venueInput[i];
            uint256 routeOutput = plan.venueOutput[i];
            if (routeInput == 0) continue;
            FlashVenueRegistry.Venue memory venue = venueRegistry.venueAt(PoolId.unwrap(key.toId()), plan.venueIndex[i]);
            if (!venue.enabled || !venueRegistry.approvedAdapter(venue.adapter)) revert InvalidPlan();
            ERC20(Currency.unwrap(quote)).safeApprove(venue.adapter, routeInput);
            uint256 result = plan.exactOutput
                ? IFlashVenueAdapter(venue.adapter)
                    .swapExactOutput(
                        venue.venuePool,
                        Currency.unwrap(quote),
                        Currency.unwrap(token),
                        routeOutput,
                        routeInput,
                        address(this)
                    )
                : IFlashVenueAdapter(venue.adapter)
                    .swapExactInput(
                        venue.venuePool,
                        Currency.unwrap(quote),
                        Currency.unwrap(token),
                        routeInput,
                        routeOutput,
                        address(this)
                    );
            ERC20(Currency.unwrap(quote)).safeApprove(venue.adapter, 0);
            if (plan.exactOutput ? result != routeInput : result != routeOutput) revert InvalidPlan();
            externalSpent += routeInput;
            externalReceived += routeOutput;
        }
        (externalSpent, externalReceived) =
            _applyExternalProtocolFee(key, plan.exactOutput, externalSpent, externalReceived);
        spent += externalSpent;
        received += externalReceived;
        if (spent != plan.ammInput || received != plan.ammOutput) revert InvalidPlan();
    }

    function _applyExternalProtocolFee(
        PoolKey calldata key,
        bool exactOutput,
        uint256 externalSpent,
        uint256 externalReceived
    ) private returns (uint256 chargedInput, uint256 netOutput) {
        chargedInput = externalSpent;
        netOutput = externalReceived;
        if (externalSpent == 0) return (chargedInput, netOutput);
        (Currency quote, Currency token) = _buyCurrencies(key);
        (uint24 feePips, address tokenJar) = externalProtocolFeeConfig(key.toId(), key.currency0 == quote);
        if (feePips == 0 || tokenJar == address(0)) return (chargedInput, netOutput);
        uint256 basis = exactOutput ? externalSpent : externalReceived;
        uint256 feeAmount = _protocolFeeAmount(feePips, !exactOutput, basis);
        Currency feeCurrency = exactOutput ? quote : token;
        ERC20(Currency.unwrap(feeCurrency)).safeTransfer(tokenJar, feeAmount);
        if (exactOutput) chargedInput += feeAmount;
        else netOutput -= feeAmount;
        emit ExternalProtocolFee(PoolId.unwrap(key.toId()), tokenJar, feeCurrency, exactOutput, basis, feeAmount);
    }

    function _emitRouted(
        PoolKey calldata key,
        BuyPlan calldata plan,
        uint256 actualInput,
        uint256 actualOutput,
        bool usedFallback
    ) private {
        uint256 externalInput = usedFallback || actualInput <= plan.v4Input ? 0 : actualInput - plan.v4Input;
        emit OrdinaryBuyRouted(
            PoolId.unwrap(key.toId()),
            plan.exactOutput,
            actualInput,
            actualOutput,
            usedFallback ? actualInput : plan.v4Input,
            externalInput,
            usedFallback
        );
    }

    function _executeV4(PoolKey calldata key, bool exactOutput, uint256 amount)
        private
        returns (uint256 input, uint256 output)
    {
        (Currency quote, Currency token) = _buyCurrencies(key);
        bool zeroForOne = key.currency0 == quote;
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: exactOutput ? int256(amount) : -int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 rawInput = zeroForOne ? delta.amount0() : delta.amount1();
        int128 rawOutput = zeroForOne ? delta.amount1() : delta.amount0();
        if (rawInput >= 0 || rawOutput <= 0) revert InvalidPlan();
        input = uint128(-rawInput);
        output = uint128(rawOutput);
        if (exactOutput ? output != amount : input != amount) revert InvalidPlan();

        poolManager.sync(quote);
        ERC20(Currency.unwrap(quote)).safeTransfer(address(poolManager), input);
        poolManager.settle();
        poolManager.take(token, address(this), output);
        if (
            poolManager.currencyDelta(address(this), quote) != 0 || poolManager.currencyDelta(address(this), token) != 0
        ) revert InvalidPlan();
    }

    function _planExactInputRoutes(PoolKey calldata key, uint256 amount) private view returns (RoutePlan memory plan) {
        if (amount == 0 || amount > type(uint128).max) revert InvalidPlan();
        uint256 slice = amount / SLICES;
        if (slice == 0) return _bestSingle(key, false, amount);
        GridState memory state;
        for (uint256 step; step < SLICES; ++step) {
            _allocateInputSlice(key, state, slice);
        }
        uint256 remainder = amount - slice * SLICES;
        if (remainder != 0) _allocateInputRemainder(key, state, remainder);
        return _inputPlan(key, state, amount);
    }

    function _planExactOutputRoutes(PoolKey calldata key, uint256 amount) private view returns (RoutePlan memory plan) {
        if (amount == 0 || amount > type(uint128).max) revert InvalidPlan();
        uint256 slice = amount / SLICES;
        if (slice == 0) return _bestSingle(key, true, amount);
        GridState memory state;
        for (uint256 step; step < SLICES; ++step) {
            _allocateOutputSlice(key, state, slice);
        }
        uint256 remainder = amount - slice * SLICES;
        if (remainder != 0) _allocateOutputRemainder(key, state, remainder);
        return _outputPlan(key, state, amount);
    }

    function _allocateInputSlice(PoolKey calldata key, GridState memory state, uint256 slice) private view {
        (bool found, uint256 best, uint256 quote) = _bestInputAddition(key, state, slice);
        if (!found) revert NoRoute();
        if (best == MAX_EXTERNAL) {
            state.v4Amount += slice;
            state.v4Quote = quote;
        } else {
            state.venueAmount[best] += slice;
            state.venueQuote[best] = quote;
        }
    }

    function _allocateOutputSlice(PoolKey calldata key, GridState memory state, uint256 slice) private view {
        (bool found, uint256 best, uint256 quote) = _bestOutputAddition(key, state, slice);
        if (!found) revert NoRoute();
        if (best == MAX_EXTERNAL) {
            state.v4Amount += slice;
            state.v4Quote = quote;
        } else {
            state.venueAmount[best] += slice;
            state.venueQuote[best] = quote;
        }
    }

    function _allocateInputRemainder(PoolKey calldata key, GridState memory state, uint256 amount) private view {
        (bool found, uint256 best, uint256 quote) = _bestInputAddition(key, state, amount);
        if (!found) revert NoRoute();
        if (best == MAX_EXTERNAL) {
            state.v4Amount += amount;
            state.v4Quote = quote;
        } else {
            state.venueAmount[best] += amount;
            state.venueQuote[best] = quote;
        }
    }

    function _allocateOutputRemainder(PoolKey calldata key, GridState memory state, uint256 amount) private view {
        (bool found, uint256 best, uint256 quote) = _bestOutputAddition(key, state, amount);
        if (!found) revert NoRoute();
        if (best == MAX_EXTERNAL) {
            state.v4Amount += amount;
            state.v4Quote = quote;
        } else {
            state.venueAmount[best] += amount;
            state.venueQuote[best] = quote;
        }
    }

    function _bestInputAddition(PoolKey calldata key, GridState memory state, uint256 addition)
        private
        view
        returns (bool found, uint256 best, uint256 bestQuote)
    {
        (bool ok, uint256 quote) = _tryV4(key, false, state.v4Amount + addition);
        uint256 bestMarginal;
        if (ok && quote >= state.v4Quote) {
            found = true;
            best = MAX_EXTERNAL;
            bestQuote = quote;
            bestMarginal = quote - state.v4Quote;
        }
        Addition memory ext = _bestExternalInputAddition(key, state, addition);
        if (ext.found && (!found || ext.marginal > bestMarginal)) return (true, ext.best, ext.quote);
    }

    function _bestOutputAddition(PoolKey calldata key, GridState memory state, uint256 addition)
        private
        view
        returns (bool found, uint256 best, uint256 bestQuote)
    {
        (bool ok, uint256 quote) = _tryV4(key, true, state.v4Amount + addition);
        uint256 bestMarginal = type(uint256).max;
        if (ok && quote >= state.v4Quote) {
            found = true;
            best = MAX_EXTERNAL;
            bestQuote = quote;
            bestMarginal = quote - state.v4Quote;
        }
        Addition memory ext = _bestExternalOutputAddition(key, state, addition);
        if (ext.found && (!found || ext.marginal < bestMarginal)) return (true, ext.best, ext.quote);
    }

    function _bestExternalInputAddition(PoolKey calldata key, GridState memory state, uint256 addition)
        private
        view
        returns (Addition memory best)
    {
        (uint24 feePips, address tokenJar) = _buyProtocolFeeConfig(key);
        if (feePips != 0 && tokenJar == address(0)) return best;
        return _bestExternalInputAdditionWithFee(key, state, addition, feePips);
    }

    function _bestExternalInputAdditionWithFee(
        PoolKey calldata key,
        GridState memory state,
        uint256 addition,
        uint24 feePips
    ) private view returns (Addition memory best) {
        uint256 currentGross = _externalQuoteTotal(state);
        bytes32 id = PoolId.unwrap(key.toId());
        uint256 count = _venueCount(id);
        for (uint256 i; i < count; ++i) {
            (bool routeOk, uint256 candidate) = _tryExternalAt(key, id, i, state.venueAmount[i] + addition, false);
            if (routeOk) {
                if (candidate < state.venueQuote[i]) continue;
                uint256 marginal = _externalInputMarginal(feePips, currentGross, state.venueQuote[i], candidate);
                if (!best.found || marginal > best.marginal) {
                    best = Addition(true, uint8(i), candidate, marginal);
                }
            }
        }
    }

    function _bestExternalOutputAddition(PoolKey calldata key, GridState memory state, uint256 addition)
        private
        view
        returns (Addition memory best)
    {
        best.marginal = type(uint256).max;
        (uint24 feePips, address tokenJar) = _buyProtocolFeeConfig(key);
        if (feePips != 0 && tokenJar == address(0)) return best;
        return _bestExternalOutputAdditionWithFee(key, state, addition, feePips);
    }

    function _bestExternalOutputAdditionWithFee(
        PoolKey calldata key,
        GridState memory state,
        uint256 addition,
        uint24 feePips
    ) private view returns (Addition memory best) {
        best.marginal = type(uint256).max;
        uint256 currentRaw = _externalQuoteTotal(state);
        bytes32 id = PoolId.unwrap(key.toId());
        uint256 count = _venueCount(id);
        for (uint256 i; i < count; ++i) {
            (bool routeOk, uint256 candidate) = _tryExternalAt(key, id, i, state.venueAmount[i] + addition, true);
            if (routeOk) {
                if (candidate < state.venueQuote[i]) continue;
                uint256 marginal = _externalOutputMarginal(feePips, currentRaw, state.venueQuote[i], candidate);
                if (!best.found || marginal < best.marginal) {
                    best = Addition(true, uint8(i), candidate, marginal);
                }
            }
        }
    }

    function _bestSingle(PoolKey calldata key, bool exactOutput, uint256 amount)
        private
        view
        returns (RoutePlan memory plan)
    {
        return exactOutput ? _bestSingleOutput(key, amount) : _bestSingleInput(key, amount);
    }

    function _bestSingleInput(PoolKey calldata key, uint256 amount) private view returns (RoutePlan memory plan) {
        (bool v4Found, uint256 bestQuote) = _tryV4(key, false, amount);
        uint256 best = MAX_EXTERNAL;
        (Currency input, Currency output) = _buyCurrencies(key);
        (bool externalFound, uint256 externalBest, uint256 externalGross) =
            _bestSingleExternal(PoolId.unwrap(key.toId()), input, output, amount, false);
        (uint24 feePips, address tokenJar) = _buyProtocolFeeConfig(key);
        if (feePips != 0 && tokenJar == address(0)) externalFound = false;
        uint256 externalNet = externalGross - _protocolFeeAmount(feePips, true, externalGross);
        if (externalFound && (!v4Found || externalNet > bestQuote)) {
            v4Found = true;
            bestQuote = externalNet;
            best = externalBest;
        }
        if (!v4Found) revert NoRoute();
        plan.input = amount;
        plan.output = bestQuote;
        if (best == MAX_EXTERNAL) {
            plan.v4Input = amount;
            plan.v4Output = bestQuote;
        } else {
            plan.venueIndex[best] = uint8(best);
            plan.venueInput[best] = uint128(amount);
            plan.venueOutput[best] = uint128(externalGross);
        }
    }

    function _bestSingleOutput(PoolKey calldata key, uint256 amount) private view returns (RoutePlan memory plan) {
        (bool v4Found, uint256 bestQuote) = _tryV4(key, true, amount);
        uint256 best = MAX_EXTERNAL;
        (Currency input, Currency output) = _buyCurrencies(key);
        (bool externalFound, uint256 externalBest, uint256 externalRawInput) =
            _bestSingleExternal(PoolId.unwrap(key.toId()), input, output, amount, true);
        (uint24 feePips, address tokenJar) = _buyProtocolFeeConfig(key);
        if (feePips != 0 && tokenJar == address(0)) externalFound = false;
        uint256 externalTotalInput = externalRawInput + _protocolFeeAmount(feePips, false, externalRawInput);
        if (externalFound && (!v4Found || externalTotalInput < bestQuote)) {
            v4Found = true;
            bestQuote = externalTotalInput;
            best = externalBest;
        }
        if (!v4Found) revert NoRoute();
        plan.input = bestQuote;
        plan.output = amount;
        if (best == MAX_EXTERNAL) {
            plan.v4Input = bestQuote;
            plan.v4Output = amount;
        } else {
            plan.venueIndex[best] = uint8(best);
            plan.venueInput[best] = uint128(externalRawInput);
            plan.venueOutput[best] = uint128(amount);
        }
    }

    function _bestSingleExternal(bytes32 id, Currency input, Currency output, uint256 amount, bool exactOutput)
        private
        view
        returns (bool found, uint256 best, uint256 bestQuote)
    {
        uint256 count = _venueCount(id);
        for (uint256 i; i < count; ++i) {
            FlashVenueRegistry.Venue memory venue = venueRegistry.venueAt(id, i);
            if (!venue.enabled || !venueRegistry.approvedAdapter(venue.adapter)) continue;
            (bool ok, uint256 candidate) = _tryExternal(venue, input, output, amount, exactOutput);
            if (ok && (!found || (exactOutput ? candidate < bestQuote : candidate > bestQuote))) {
                found = true;
                best = i;
                bestQuote = candidate;
            }
        }
    }

    function _tryExternal(
        FlashVenueRegistry.Venue memory venue,
        Currency input,
        Currency output,
        uint256 amount,
        bool exactOutput
    ) private view returns (bool ok, uint256 quote) {
        return exactOutput
            ? IFlashSafeVenueAdapter(venue.adapter)
                .tryQuoteExactOutput(venue.venuePool, Currency.unwrap(input), Currency.unwrap(output), amount)
            : IFlashSafeVenueAdapter(venue.adapter)
                .tryQuoteExactInput(venue.venuePool, Currency.unwrap(input), Currency.unwrap(output), amount);
    }

    function _tryExternalForKey(
        PoolKey calldata key,
        FlashVenueRegistry.Venue memory venue,
        uint256 amount,
        bool exactOutput
    ) private view returns (bool ok, uint256 quote) {
        (Currency input, Currency output) = _buyCurrencies(key);
        return _tryExternal(venue, input, output, amount, exactOutput);
    }

    function _tryExternalAt(PoolKey calldata key, bytes32 id, uint256 index, uint256 amount, bool exactOutput)
        private
        view
        returns (bool ok, uint256 quote)
    {
        FlashVenueRegistry.Venue memory venue = venueRegistry.venueAt(id, index);
        if (!venue.enabled || !venueRegistry.approvedAdapter(venue.adapter)) return (false, 0);
        return _tryExternalForKey(key, venue, amount, exactOutput);
    }

    function _inputPlan(PoolKey calldata key, GridState memory state, uint256 amount)
        private
        view
        returns (RoutePlan memory plan)
    {
        plan.input = amount;
        plan.v4Input = state.v4Amount;
        plan.v4Output = state.v4Quote;
        plan.output = state.v4Quote;
        uint256 externalGross;
        bytes32 id = PoolId.unwrap(key.toId());
        uint256 count = _venueCount(id);
        for (uint256 i; i < count; ++i) {
            if (state.venueAmount[i] == 0) continue;
            plan.venueIndex[i] = uint8(i);
            plan.venueInput[i] = uint128(state.venueAmount[i]);
            plan.venueOutput[i] = uint128(state.venueQuote[i]);
            externalGross += state.venueQuote[i];
        }
        (uint24 feePips,) = _buyProtocolFeeConfig(key);
        plan.output += externalGross - _protocolFeeAmount(feePips, true, externalGross);
        if (plan.output == 0) revert NoRoute();
    }

    function _outputPlan(PoolKey calldata key, GridState memory state, uint256 amount)
        private
        view
        returns (RoutePlan memory plan)
    {
        plan.output = amount;
        plan.v4Input = state.v4Quote;
        plan.v4Output = state.v4Amount;
        plan.input = state.v4Quote;
        uint256 externalRawInput;
        bytes32 id = PoolId.unwrap(key.toId());
        uint256 count = _venueCount(id);
        for (uint256 i; i < count; ++i) {
            if (state.venueAmount[i] == 0) continue;
            plan.venueIndex[i] = uint8(i);
            plan.venueInput[i] = uint128(state.venueQuote[i]);
            plan.venueOutput[i] = uint128(state.venueAmount[i]);
            externalRawInput += state.venueQuote[i];
        }
        (uint24 feePips,) = _buyProtocolFeeConfig(key);
        plan.input += externalRawInput + _protocolFeeAmount(feePips, false, externalRawInput);
        if (plan.input == 0) revert NoRoute();
    }

    function _quoteV4(PoolKey calldata key, bool exactOutput, uint256 amount)
        private
        view
        returns (uint256 input, uint256 output)
    {
        (bool ok, uint256 quote) = _tryV4(key, exactOutput, amount);
        if (!ok) revert NoRoute();
        return exactOutput ? (quote, amount) : (amount, quote);
    }

    function _tryV4(PoolKey calldata key, bool exactOutput, uint256 amount)
        private
        view
        returns (bool ok, uint256 quote)
    {
        if (amount == 0 || amount > uint256(uint128(type(int128).max))) return (false, 0);
        (Currency quoteCurrency,) = _buyCurrencies(key);
        bool zeroForOne = key.currency0 == quoteCurrency;
        uint256 input;
        uint256 output;
        (ok, input, output) =
            FlashV4StateQuoter.quote(poolManager, key, zeroForOne, exactOutput ? int256(amount) : -int256(amount));
        // Reaching a price limit or the end of active liquidity may return a
        // partial quote. A partial fill is not a valid route for either exact
        // mode and must not cap otherwise executable external liquidity.
        if (!ok || (exactOutput ? output != amount : input != amount)) return (false, 0);
        quote = exactOutput ? input : output;
    }

    function _buyProtocolFeeConfig(PoolKey calldata key) private view returns (uint24 feePips, address tokenJar) {
        (Currency quote,) = _buyCurrencies(key);
        return externalProtocolFeeConfig(key.toId(), key.currency0 == quote);
    }

    function _protocolFeeAmount(uint24 feePips, bool exactInput, uint256 amountUnspecified)
        private
        pure
        returns (uint256)
    {
        if (feePips == 0 || amountUnspecified == 0) return 0;
        return exactInput
            ? FullMath.mulDivRoundingUp(amountUnspecified, feePips, ProtocolFeeLibrary.PIPS_DENOMINATOR)
            : FullMath.mulDivRoundingUp(amountUnspecified, feePips, ProtocolFeeLibrary.PIPS_DENOMINATOR - feePips);
    }

    function _externalInputMarginal(uint24 feePips, uint256 currentGross, uint256 oldQuote, uint256 nextQuote)
        private
        pure
        returns (uint256)
    {
        uint256 currentNet = currentGross - _protocolFeeAmount(feePips, true, currentGross);
        uint256 nextGross = currentGross - oldQuote + nextQuote;
        return nextGross - _protocolFeeAmount(feePips, true, nextGross) - currentNet;
    }

    function _externalOutputMarginal(uint24 feePips, uint256 currentRaw, uint256 oldQuote, uint256 nextQuote)
        private
        pure
        returns (uint256)
    {
        uint256 currentCost = currentRaw + _protocolFeeAmount(feePips, false, currentRaw);
        uint256 nextRaw = currentRaw - oldQuote + nextQuote;
        return nextRaw + _protocolFeeAmount(feePips, false, nextRaw) - currentCost;
    }

    function _externalQuoteTotal(GridState memory state) private pure returns (uint256 total) {
        for (uint256 i; i < MAX_EXTERNAL; ++i) {
            total += state.venueQuote[i];
        }
    }

    function _storeRoute(BuyPlan memory plan, RoutePlan memory route) private pure {
        if (
            route.input == 0 || route.output == 0 || route.input > type(uint128).max || route.output > type(uint128).max
                || route.v4Input > type(uint128).max || route.v4Output > type(uint128).max
        ) revert InvalidPlan();
        plan.v4Input = uint128(route.v4Input);
        plan.v4Output = uint128(route.v4Output);
        plan.venueIndex = route.venueIndex;
        plan.venueInput = route.venueInput;
        plan.venueOutput = route.venueOutput;
    }

    function _validatePlan(BuyPlan calldata plan) private pure {
        if (
            plan.specifiedAmount == 0 || plan.ammInput == 0 || plan.ammOutput == 0 || plan.maxAmmInput < plan.ammInput
                || plan.maxAmmInput < plan.fallbackInput || plan.maxTotalInput < plan.maxAmmInput
        ) revert InvalidPlan();
    }

    function _buyCurrencies(PoolKey calldata key) private view returns (Currency input, Currency output) {
        output = IFlashBuyRegistry(hook).protocolTokenOfPool(key.toId());
        if (Currency.unwrap(output) == address(0)) revert InvalidPlan();
        if (key.currency0 == output) input = key.currency1;
        else if (key.currency1 == output) input = key.currency0;
        else revert InvalidPlan();
    }

    function _venueCount(bytes32 id) private view returns (uint256 count) {
        count = venueRegistry.venueCount(id);
        if (count > MAX_EXTERNAL) count = MAX_EXTERNAL;
    }

    function _max(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a : b;
    }
}
