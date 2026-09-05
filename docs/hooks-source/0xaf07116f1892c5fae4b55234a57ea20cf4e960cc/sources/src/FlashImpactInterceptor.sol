// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

import {FlashVenueRegistry} from "./FlashVenueRegistry.sol";
import {FlashVenueFleetOptimizer} from "./venues/FlashVenueFleetOptimizer.sol";
import {IFlashVenueAdapter} from "./venues/IFlashVenueAdapter.sol";
import {FlashSellRemainderRouter} from "./venues/FlashSellRemainderRouter.sol";
import {FlashImpactStateQuoter} from "./FlashImpactStateQuoter.sol";
import {FlashV4StateQuoter} from "./FlashV4StateQuoter.sol";

interface IFlashBuybackHook {
    function owner() external view returns (address);
    function treasury() external view returns (address);
    function wrappedNative() external view returns (Currency);
    function mainPoolOf(Currency token) external view returns (PoolId);
    function protocolTokenOfPool(PoolId id) external view returns (Currency);
    function stakingFactory() external view returns (address);
}

interface IFlashBuybackStakingFactory {
    function allocateBuyback(bytes32 poolId, uint256 amount) external;
}

/// @notice Sell-only, unprefunded v4 JIT interception coordinator.
/// @dev The canonical hook asks the read-only state quoter to evaluate ordinary
/// and assisted execution while PoolManager is unlocked. Candidate discovery
/// never mutates venue state and never uses a caught revert as quote data. Only
/// a proved-profitable candidate is armed for the outer swap. No hookData is read.
contract FlashImpactInterceptor is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;
    using SafeTransferLib for ERC20;

    error NotHook();
    error NotSelf();
    error InvalidConfig();
    error InvalidState();
    error BuybackFailed();

    uint256 private constant BPS = 10_000;
    int24 public constant MIN_WIDTH_TICKS = 60;
    int24 public constant MAX_WIDTH_TICKS = 6_000;
    bytes32 private constant POSITION_SALT = keccak256("FLASH.IMPACT.INTERCEPTOR.V1");

    struct Config {
        bool enabled;
        uint16 minImpactBps;
        int24 width;
        uint128 minQuoteCapacity;
        uint128 maxQuoteCapacity;
        uint128 minProfit;
    }

    struct Pending {
        bool armed;
        bool exactOutput;
        bool tokenIs0;
        int24 lower;
        int24 upper;
        uint128 liquidity;
        uint128 baselineOutput;
        uint128 baselineInput;
        uint128 assistedOutput;
        uint128 assistedInput;
        uint128 assistedTotalInput;
    }

    struct FinishResult {
        bool activated;
        bool captureInToken;
        uint256 capture;
        uint256 quoteProfit;
    }

    struct Preparation {
        bool armed;
        uint256 poolInput;
        uint256 poolOutput;
    }

    struct Search {
        uint256 score;
        uint256 cap;
        uint256 output;
        uint256 input;
        uint256 totalInput;
        uint256 profit;
        uint256 totalOutput;
    }

    struct Baseline {
        uint256 output;
        uint256 input;
        uint256 totalOutput;
        uint256 totalInput;
        bool ok;
    }

    struct Candidate {
        uint256 output;
        uint256 input;
        uint256 totalInput;
        uint256 profit;
        uint256 totalOutput;
        bool ok;
    }

    IPoolManager public immutable poolManager;
    address public immutable hook;
    FlashVenueRegistry public immutable venueRegistry;
    FlashVenueFleetOptimizer public immutable optimizer;
    FlashSellRemainderRouter public immutable sellRouter;
    FlashImpactStateQuoter public immutable stateQuoter;
    mapping(bytes32 => Config) public configOf;
    mapping(bytes32 => Pending) public pendingOf;
    mapping(bytes32 => uint128) private pendingAssistedTotalOutput;
    mapping(bytes32 => FinishResult) public lastResult;

    bool public buyback_enabled;
    address public main_token;
    bytes32 public buybackPoolId;
    PoolKey private buybackKey;

    event Configured(bytes32 indexed poolId, Config config);
    event Armed(bytes32 indexed poolId, uint256 capacity, uint256 expectedProfit);
    event Finished(bytes32 indexed poolId, uint256 capture, uint256 quoteProfit);
    event BuybackConfigured(bytes32 indexed poolId, address indexed token, bool enabled);
    event TreasuryBuyback(uint256 grossWeth, uint256 treasuryWeth, uint256 buybackWeth, uint256 tokensBought);
    event TreasuryBuybackFallback(uint256 wethToTreasury);

    constructor(
        IPoolManager pm,
        address hook_,
        FlashVenueRegistry venueRegistry_,
        FlashVenueFleetOptimizer optimizer_,
        FlashSellRemainderRouter sellRouter_,
        FlashImpactStateQuoter stateQuoter_
    ) {
        if (
            address(pm) == address(0) || hook_ == address(0) || address(venueRegistry_).code.length == 0
                || address(optimizer_).code.length == 0 || address(optimizer_.registry()) != address(venueRegistry_)
                || address(sellRouter_).code.length == 0 || sellRouter_.hook() != hook_
                || address(sellRouter_.registry()) != address(venueRegistry_)
                || address(sellRouter_.optimizer()) != address(optimizer_) || address(stateQuoter_).code.length == 0
                || address(stateQuoter_.poolManager()) != address(pm)
                || address(stateQuoter_.optimizer()) != address(optimizer_)
        ) revert InvalidConfig();
        poolManager = pm;
        hook = hook_;
        venueRegistry = venueRegistry_;
        optimizer = optimizer_;
        sellRouter = sellRouter_;
        stateQuoter = stateQuoter_;
    }

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    modifier onlyProtocolOwner() {
        if (msg.sender != IFlashBuybackHook(hook).owner()) revert NotHook();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    /// @notice Configures the canonical FLASH/WETH pool used for automatic
    /// buybacks. The pool must already be the registered main pool for token.
    function configureBuyback(PoolKey calldata key, address token, bool enabled) external onlyProtocolOwner {
        Currency protocolToken = Currency.wrap(token);
        bytes32 rawId = PoolId.unwrap(key.toId());
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        if (
            token == address(0) || address(key.hooks) != hook
                || PoolId.unwrap(IFlashBuybackHook(hook).mainPoolOf(protocolToken)) != rawId
                || Currency.unwrap(IFlashBuybackHook(hook).protocolTokenOfPool(PoolId.wrap(rawId))) != token
                || !((key.currency0 == weth && key.currency1 == protocolToken)
                    || (key.currency1 == weth && key.currency0 == protocolToken))
        ) revert InvalidConfig();
        buybackKey = key;
        buybackPoolId = rawId;
        main_token = token;
        buyback_enabled = enabled;
        emit BuybackConfigured(rawId, token, enabled);
    }

    /// @notice Pulls one terminal owner payout from the hook and contains the
    /// complete soft-fallback boundary. A failed nested attempt leaves the
    /// pulled WETH here, then transfers 100% to treasury without reverting the
    /// user's outer swap.
    function routeTreasuryPayout(uint256 amount) external onlyHook returns (uint256 bought) {
        if (amount == 0) revert BuybackFailed();
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        // `onlyHook` fixes the payer to the one immutable hook.
        // slither-disable-next-line arbitrary-send-erc20
        ERC20(Currency.unwrap(weth)).safeTransferFrom(hook, address(this), amount);
        if (buyback_enabled) {
            try this.executeTreasuryBuyback(amount) returns (uint256 output) {
                return output;
            } catch {}
        }
        ERC20(Currency.unwrap(weth)).safeTransfer(IFlashBuybackHook(hook).treasury(), amount);
        emit TreasuryBuybackFallback(amount);
    }

    /// @notice Splits one terminal owner WETH payout and buys through the
    /// better executable quote from either the verified external fleet or the
    /// canonical hooked FLASH pool. A failed first choice is rolled back and
    /// the alternate is attempted before the caller falls back to treasury.
    function executeTreasuryBuyback(uint256 amount) external onlySelf returns (uint256 bought) {
        if (!buyback_enabled || amount == 0 || amount > uint256(uint128(type(int128).max))) {
            revert BuybackFailed();
        }
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        uint256 treasuryAmount = amount * 69 / 100;
        uint256 buybackAmount = amount - treasuryAmount;
        ERC20(Currency.unwrap(weth)).safeTransfer(IFlashBuybackHook(hook).treasury(), treasuryAmount);

        FlashVenueFleetOptimizer.Plan memory fleet;
        bool fleetFound;
        try optimizer.planExactInput(buybackPoolId, Currency.unwrap(weth), main_token, buybackAmount) returns (
            FlashVenueFleetOptimizer.Plan memory candidate
        ) {
            fleet = candidate;
            fleetFound = candidate.found && candidate.totalOut != 0;
        } catch {}
        uint256 directQuote = _directBuybackQuote(buybackAmount);
        bool fleetFirst = fleetFound && fleet.totalOut > directQuote;

        if (fleetFirst) {
            try this.executeFleetBuyback(buybackAmount) returns (uint256 output) {
                bought = output;
            } catch {
                try this.executeDirectBuyback(buybackAmount) returns (uint256 output) {
                    bought = output;
                } catch {}
            }
        } else {
            try this.executeDirectBuyback(buybackAmount) returns (uint256 output) {
                bought = output;
            } catch {
                if (fleetFound) {
                    try this.executeFleetBuyback(buybackAmount) returns (uint256 output) {
                        bought = output;
                    } catch {}
                }
            }
        }
        if (bought == 0) revert BuybackFailed();
        emit TreasuryBuyback(amount, treasuryAmount, buybackAmount, bought);
    }

    /// @dev Isolated direct-pool execution. Its entire state transition rolls
    /// back before the fleet alternate is tried if any settlement/allocation
    /// invariant fails.
    function executeDirectBuyback(uint256 buybackAmount) external onlySelf returns (uint256 bought) {
        if (!poolManager.isUnlocked()) {
            return abi.decode(poolManager.unlock(abi.encode(buybackAmount)), (uint256));
        }
        return _executeDirectBuyback(buybackAmount);
    }

    /// @notice Opens only the direct canonical buyback when a treasury sweep
    /// originates outside an existing v4 unlock (for example staking churn).
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotHook();
        return abi.encode(_executeDirectBuyback(abi.decode(data, (uint256))));
    }

    function _executeDirectBuyback(uint256 buybackAmount) private returns (uint256 bought) {
        PoolKey memory key = buybackKey;
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        Currency token = Currency.wrap(main_token);

        bool zeroForOne = key.currency0 == weth;
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(buybackAmount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 inputDelta = zeroForOne ? delta.amount0() : delta.amount1();
        int128 outputDelta = zeroForOne ? delta.amount1() : delta.amount0();
        if (inputDelta >= 0 || outputDelta <= 0 || uint128(-inputDelta) != buybackAmount) revert BuybackFailed();
        bought = uint128(outputDelta);

        poolManager.sync(weth);
        ERC20(Currency.unwrap(weth)).safeTransfer(address(poolManager), buybackAmount);
        poolManager.settle();
        address staking = IFlashBuybackHook(hook).stakingFactory();
        poolManager.take(token, staking, bought);
        if (poolManager.currencyDelta(address(this), weth) != 0 || poolManager.currencyDelta(address(this), token) != 0)
        {
            revert BuybackFailed();
        }
        IFlashBuybackStakingFactory(staking).allocateBuyback(buybackPoolId, bought);
    }

    /// @dev Executes through the shared verified-fleet router in its own
    /// rollback boundary. The router re-plans against execution-time state.
    function executeFleetBuyback(uint256 buybackAmount) external onlySelf returns (uint256 bought) {
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        address staking = IFlashBuybackHook(hook).stakingFactory();
        ERC20(Currency.unwrap(weth)).safeTransfer(address(sellRouter), buybackAmount);
        bought = sellRouter.executeExactInput(buybackPoolId, weth, Currency.wrap(main_token), buybackAmount);
        ERC20(main_token).safeTransfer(staking, bought);
        IFlashBuybackStakingFactory(staking).allocateBuyback(buybackPoolId, bought);
    }

    function _directBuybackQuote(uint256 buybackAmount) private view returns (uint256 output) {
        PoolKey memory key = buybackKey;
        Currency weth = IFlashBuybackHook(hook).wrappedNative();
        bool zeroForOne = key.currency0 == weth;
        (bool ok, uint256 input, uint256 quotedOutput) =
            FlashV4StateQuoter.quote(poolManager, key, zeroForOne, -int256(buybackAmount));
        if (ok && input == buybackAmount) output = quotedOutput;
    }

    function spotOutputBound(PoolId id, Currency quote, Currency token, uint256 quoteAmount)
        external
        view
        returns (uint256 output)
    {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            output = Currency.unwrap(quote) < Currency.unwrap(token)
                ? FullMath.mulDivRoundingUp(ratioX192, quoteAmount, 1 << 192)
                : FullMath.mulDivRoundingUp(1 << 192, quoteAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            output = Currency.unwrap(quote) < Currency.unwrap(token)
                ? FullMath.mulDivRoundingUp(ratioX128, quoteAmount, 1 << 128)
                : FullMath.mulDivRoundingUp(1 << 128, quoteAmount, ratioX128);
        }
    }

    function configure(PoolKey calldata key, Config calldata config) external onlyHook {
        if (
            config.width < MIN_WIDTH_TICKS || config.width > MAX_WIDTH_TICKS
                || config.width % key.tickSpacing != 0 || config.minQuoteCapacity == 0
                || config.minQuoteCapacity > config.maxQuoteCapacity
                || config.minProfit == 0 || config.minImpactBps > BPS
        ) revert InvalidConfig();
        bytes32 poolId = PoolId.unwrap(key.toId());
        configOf[poolId] = config;
        emit Configured(poolId, config);
    }

    /// @return preparation Simulated in-pool execution and whether a full
    /// add/swap/remove/unwind cycle exceeded the configured profit floor.
    function prepare(PoolKey calldata key, SwapParams calldata params, uint256 exactInputTax)
        external
        onlyHook
        returns (Preparation memory preparation)
    {
        bytes32 rawId = PoolId.unwrap(key.toId());
        Config memory cfg = configOf[rawId];
        if (pendingOf[rawId].armed) return preparation;
        delete lastResult[rawId];
        bool exactOutput = params.amountSpecified > 0;
        uint256 gross = exactOutput ? uint256(params.amountSpecified) : uint256(-params.amountSpecified);
        if (poolManager.getLiquidity(PoolId.wrap(rawId)) == 0) return preparation;

        Baseline memory baseline;
        (
            baseline.output,
            baseline.input,
            baseline.totalOutput,
            baseline.totalInput,
            baseline.ok
        ) = _baseline(key, params, exactInputTax);
        if (
            !baseline.ok || baseline.output > type(uint128).max || baseline.input > type(uint128).max
                || baseline.totalOutput > type(uint128).max || baseline.totalInput > type(uint128).max
        ) {
            return preparation;
        }
        preparation.poolInput = baseline.input;
        preparation.poolOutput = baseline.output;
        // Compare like-for-like units in both swap modes. For exact input the
        // sold-token amount is known up front; for exact output it is the
        // baseline in-pool plus verified-fleet input computed above. Using the
        // requested quote-token output here makes activation depend on token
        // price and can suppress otherwise profitable exact-output cycles.
        uint256 impactInput = exactOutput ? baseline.totalInput : gross - exactInputTax;
        if (!cfg.enabled || !_meetsImpactThreshold(rawId, impactInput, params.zeroForOne, cfg.minImpactBps)) {
            return preparation;
        }

        Search memory best = _findBest(key, params, exactInputTax, cfg, baseline.totalOutput, baseline.totalInput);
        if (best.score == 0) return preparation;
        _arm(key, params.zeroForOne, exactOutput, cfg, baseline, best);
        preparation.armed = true;
        preparation.poolInput = best.input;
        preparation.poolOutput = best.output;
    }

    function _meetsImpactThreshold(bytes32 rawId, uint256 soldTokenAmount, bool tokenIs0, uint256 threshold)
        private
        view
        returns (bool)
    {
        PoolId id = PoolId.wrap(rawId);
        uint128 liquidity = poolManager.getLiquidity(id);
        if (liquidity == 0) return false;
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        return _projectedPriceImpactBps(sqrtPriceX96, liquidity, soldTokenAmount, tokenIs0) >= threshold;
    }

    /// @dev Measures the percentage decline in the sold token's spot price.
    /// `liquidity` and token amounts are deliberately never compared directly:
    /// their dimensions differ whenever the pool is away from price 1.
    function _projectedPriceImpactBps(uint160 sqrtPriceX96, uint128 liquidity, uint256 soldTokenAmount, bool tokenIs0)
        private
        pure
        returns (uint256)
    {
        if (soldTokenAmount == 0) return 0;
        uint160 next = SqrtPriceMath.getNextSqrtPriceFromInput(sqrtPriceX96, liquidity, soldTokenAmount, tokenIs0);
        uint256 ratio = tokenIs0 ? FullMath.mulDiv(next, 1e18, sqrtPriceX96) : FullMath.mulDiv(sqrtPriceX96, 1e18, next);
        uint256 ratioSquared = FullMath.mulDiv(ratio, ratio, 1e18);
        return ratioSquared >= 1e18 ? 0 : (1e18 - ratioSquared) * BPS / 1e18;
    }

    function _arm(
        PoolKey calldata key,
        bool tokenIs0,
        bool exactOutput,
        Config memory cfg,
        Baseline memory baseline,
        Search memory best
    ) private {
        bytes32 rawId = PoolId.unwrap(key.toId());
        (int24 lower, int24 upper, uint128 liquidity) = _addBand(key, tokenIs0, uint128(best.cap), cfg.width);
        pendingOf[rawId] = Pending({
            armed: true,
            exactOutput: exactOutput,
            tokenIs0: tokenIs0,
            lower: lower,
            upper: upper,
            liquidity: liquidity,
            baselineOutput: uint128(baseline.totalOutput),
            baselineInput: uint128(baseline.totalInput),
            assistedOutput: uint128(best.output),
            assistedInput: uint128(best.input),
            assistedTotalInput: uint128(best.totalInput)
        });
        pendingAssistedTotalOutput[rawId] = uint128(best.totalOutput);
        emit Armed(rawId, best.cap, best.profit);
    }

    function _findBest(
        PoolKey calldata key,
        SwapParams calldata params,
        uint256 tax,
        Config memory cfg,
        uint256 baselineOutput,
        uint256 baselineInput
    ) private view returns (Search memory best) {
        bool exactOutput = params.amountSpecified > 0;
        for (uint256 i = 1; i <= 4; ++i) {
            uint256 cap = uint256(cfg.maxQuoteCapacity) * i / 4;
            if (cap < cfg.minQuoteCapacity) cap = cfg.minQuoteCapacity;
            Candidate memory candidate = _candidate(key, params, tax, uint128(cap), cfg.width);
            if (!candidate.ok || candidate.profit < cfg.minProfit) continue;
            if (
                candidate.output > type(uint128).max || candidate.totalOutput > type(uint128).max
                    || candidate.input > type(uint128).max || candidate.totalInput > type(uint128).max
            ) continue;
            uint256 capture = exactOutput
                ? (baselineInput > candidate.totalInput ? baselineInput - candidate.totalInput : 0)
                : (candidate.totalOutput > baselineOutput ? candidate.totalOutput - baselineOutput : 0);
            if (candidate.profit > type(uint256).max - capture) continue;
            uint256 score = exactOutput ? candidate.profit : candidate.profit + capture;
            if (capture != 0 && score > best.score) {
                best = Search(
                    score,
                    cap,
                    candidate.output,
                    candidate.input,
                    candidate.totalInput,
                    candidate.profit,
                    candidate.totalOutput
                );
            }
        }
    }

    function finish(PoolKey calldata key, BalanceDelta swapDelta)
        external
        onlyHook
        returns (FinishResult memory result)
    {
        bytes32 rawId = PoolId.unwrap(key.toId());
        // `lastResult` describes the most recently completed sell, not merely
        // the last sell that happened to arm an impact band. External-only and
        // other safe-bypass routes still reach afterSwap, so clear stale
        // observability before returning their zero result.
        delete lastResult[rawId];
        Pending memory pending = pendingOf[rawId];
        if (!pending.armed) return result;
        uint256 assistedTotalOutput = pendingAssistedTotalOutput[rawId];
        delete pendingOf[rawId];
        delete pendingAssistedTotalOutput[rawId];

        uint256 actualOutput = uint128(pending.tokenIs0 ? swapDelta.amount1() : swapDelta.amount0());
        uint256 actualInput = uint128(-(pending.tokenIs0 ? swapDelta.amount0() : swapDelta.amount1()));
        if (actualOutput != pending.assistedOutput || actualInput != pending.assistedInput) revert InvalidState();

        uint256 acquired = _removeBand(key, pending);
        uint256 profit = _unwind(rawId, _token(key, pending.tokenIs0), _quote(key, pending.tokenIs0), acquired, 0, 0);
        if (profit < configOf[rawId].minProfit) revert InvalidState();

        result.activated = true;
        result.captureInToken = pending.exactOutput;
        result.capture = pending.exactOutput
            ? uint256(pending.baselineInput) - uint256(pending.assistedTotalInput)
            : assistedTotalOutput - uint256(pending.baselineOutput);
        result.quoteProfit = profit;
        lastResult[rawId] = result;
        emit Finished(rawId, result.capture, profit);
    }

    function _baseline(PoolKey calldata key, SwapParams calldata params, uint256 tax)
        private
        view
        returns (uint256 output, uint256 input, uint256 totalOutput, uint256 totalInput, bool ok)
    {
        (ok, output, input, totalOutput, totalInput) = stateQuoter.baseline(key, params, tax);
    }

    function _candidate(PoolKey calldata key, SwapParams calldata params, uint256 tax, uint128 cap, int24 width)
        private
        view
        returns (Candidate memory candidate)
    {
        FlashImpactStateQuoter.CandidateQuote memory quoted = stateQuoter.candidate(key, params, tax, cap, width);
        candidate = Candidate(
            quoted.output, quoted.input, quoted.totalInput, quoted.profit, quoted.totalOutput, quoted.ok
        );
    }

    function _addBand(PoolKey calldata key, bool tokenIs0, uint128 capacity, int24 width)
        private
        returns (int24 lower, int24 upper, uint128 liquidity)
    {
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        int24 spacing = key.tickSpacing;
        if (width <= 0 || width % spacing != 0) revert InvalidConfig();
        int24 floorTick = tick / spacing * spacing;
        if (tick < 0 && tick % spacing != 0) floorTick -= spacing;
        if (tokenIs0) {
            upper = floorTick;
            lower = upper - width;
            liquidity = LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), capacity
            );
        } else {
            lower = tick == floorTick ? floorTick : floorTick + spacing;
            upper = lower + width;
            liquidity = LiquidityAmounts.getLiquidityForAmount0(
                TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), capacity
            );
        }
        if (liquidity == 0) revert InvalidConfig();
        bytes32 salt = keccak256(abi.encode(POSITION_SALT, key.toId()));
        ModifyLiquidityParams memory modify = ModifyLiquidityParams(lower, upper, int256(uint256(liquidity)), salt);
        poolManager.modifyLiquidity(key, modify, "");
    }

    function _removeBand(PoolKey calldata key, Pending memory pending) private returns (uint256 acquired) {
        (BalanceDelta removed,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams(
                pending.lower,
                pending.upper,
                -int256(uint256(pending.liquidity)),
                keccak256(abi.encode(POSITION_SALT, key.toId()))
            ),
            ""
        );
        int128 raw = pending.tokenIs0 ? removed.amount0() : removed.amount1();
        if (raw <= 0) revert InvalidState();
        acquired = uint128(raw);
    }

    function _unwind(
        bytes32 poolId,
        Currency token,
        Currency quote,
        uint256 amount,
        uint256 residualTokenDebt,
        uint256 residualQuoteCredit
    ) private returns (uint256 profit) {
        if (amount == 0) revert InvalidState();
        poolManager.take(token, address(this), amount);
        FlashVenueFleetOptimizer.Plan memory plan =
            optimizer.planExactInput(poolId, Currency.unwrap(token), Currency.unwrap(quote), amount);
        if (!plan.found || plan.totalOut == 0) revert InvalidState();
        uint256 beforeQuote = ERC20(Currency.unwrap(quote)).balanceOf(address(this));
        for (uint256 i; i < 4; ++i) {
            uint256 routeAmount = plan.amountIn[i];
            if (routeAmount == 0) continue;
            FlashVenueRegistry.Venue memory venue = venueRegistry.venueAt(poolId, plan.venueIndex[i]);
            ERC20(Currency.unwrap(token)).safeApprove(venue.adapter, routeAmount);
            uint256 output = IFlashVenueAdapter(venue.adapter)
                .swapExactInput(
                    venue.venuePool,
                    Currency.unwrap(token),
                    Currency.unwrap(quote),
                    routeAmount,
                    plan.amountOut[i],
                    address(this)
                );
            ERC20(Currency.unwrap(token)).safeApprove(venue.adapter, 0);
            if (output != plan.amountOut[i]) revert InvalidState();
        }
        uint256 quoteOutput = ERC20(Currency.unwrap(quote)).balanceOf(address(this)) - beforeQuote;
        poolManager.sync(quote);
        ERC20(Currency.unwrap(quote)).safeTransfer(address(poolManager), quoteOutput);
        poolManager.settle();
        int256 remaining = poolManager.currencyDelta(address(this), quote);
        if (remaining <= int256(residualQuoteCredit)) revert InvalidState();
        profit = uint256(remaining) - residualQuoteCredit;
        poolManager.take(quote, hook, profit);
        if (
            poolManager.currencyDelta(address(this), token) != -int256(residualTokenDebt)
                || poolManager.currencyDelta(address(this), quote) != int256(residualQuoteCredit)
        ) {
            revert InvalidState();
        }
    }

    function _adjusted(SwapParams calldata params, uint256 exactInputTax)
        private
        pure
        returns (SwapParams memory adjusted)
    {
        adjusted = params;
        if (params.amountSpecified < 0) adjusted.amountSpecified += int256(exactInputTax);
    }

    function _token(PoolKey calldata key, bool tokenIs0) private pure returns (Currency) {
        return tokenIs0 ? key.currency0 : key.currency1;
    }

    function _quote(PoolKey calldata key, bool tokenIs0) private pure returns (Currency) {
        return tokenIs0 ? key.currency1 : key.currency0;
    }
}
