// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    toBeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

import {FlashRegistry} from "./FlashRegistry.sol";
import {FlashOtcDeck} from "./FlashOtcDeck.sol";
import {FlashLaunchGate} from "./FlashLaunchGate.sol";
import {FlashPoolAdmin} from "./FlashPoolAdmin.sol";
import {FlashPoolStaking} from "./FlashPoolStaking.sol";
import {FlashPoolStakingFactory} from "./FlashPoolStakingFactory.sol";
import {FlashVenueRegistry} from "./FlashVenueRegistry.sol";
import {FlashTaxModule} from "./FlashTaxModule.sol";
import {FlashImpactInterceptor} from "./FlashImpactInterceptor.sol";
import {FlashImpactStateQuoter, IFlashRoutedTaxQuote} from "./FlashImpactStateQuoter.sol";
import {FlashBuyAggregator} from "./FlashBuyAggregator.sol";
import {FlashSellRemainderRouter} from "./venues/FlashSellRemainderRouter.sol";

/// @title FlashHook
/// @notice Consolidated FLASH v2 hook: WETH-rooted main/sub ecosystems,
/// static 0.6% LP pools, realized sell taxes, full-fill-or-skip OTC decks,
/// share-class churn, staking rewards and verified multi-venue routing state.
/// @dev No hookData is read. PoolManager deltas and token custody stay in this
/// hook; helper modules own configuration and accounting only.
contract FlashHook is FlashRegistry {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using SafeTransferLib for ERC20;

    error OnlyPoolManager();
    error HookPermissionsMismatch();
    error LaunchNotStaged();
    error WrongInitializer();
    error InvalidLaunch();
    error NotPoolAuthority();
    error InvalidAmount();
    error InvalidCallbackState();
    error WrongStakingVault();
    error ModulesAlreadyInitialized();
    error InvalidModules();

    uint160 internal constant REQUIRED_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );
    uint256 internal constant BPS = 10_000;
    uint24 public constant FLASH_LP_FEE = 6_000;
    uint16 private constant DEFAULT_FLASH_LOAN_FEE_BPS = 30;

    struct TaxParams {
        uint16 baseBps;
        uint16 impactCapBps;
        uint16 rollingCapBps;
        uint16 lowVolMaxBps;
        uint32 lowVolTau;
        uint32 anchorWindow;
    }

    struct LaunchIntent {
        address creator;
        address initializer;
        address adapter;
        address venuePool;
        bool exists;
    }

    struct BuyAmounts {
        uint256 totalInput;
        uint256 totalOutput;
        uint256 otcInput;
        uint256 otcOutput;
    }

    mapping(PoolId id => LaunchIntent) public launchIntent;
    mapping(PoolId id => uint256 amount) private pendingExternalSellInput;

    FlashOtcDeck public otcDeck;
    FlashLaunchGate public launchGate;
    FlashPoolAdmin public poolAdmins;
    FlashPoolStakingFactory public stakingFactory;
    FlashVenueRegistry public venueRegistry;
    FlashTaxModule public taxModule;
    FlashImpactInterceptor public impactInterceptor;
    FlashBuyAggregator public buyAggregator;
    /// @notice Mutable terminal recipient for protocol-owned WETH. Protocol
    /// OTC positions remain owned by `owner()` independently of this address.
    address public treasury;

    event PoolLaunchStaged(
        PoolId indexed id, address indexed creator, address indexed initializer, address adapter, address venuePool
    );
    event TaxCharged(PoolId indexed id, Currency currency, uint256 amount, uint256 bps);
    event TaxAllocated(PoolId indexed id, uint256 stakers, uint256 creator, uint256 protocolOwner);
    event OtcFilled(PoolId indexed id, uint256 tokenAmount, uint256 grossQuote, uint256 sellerFee);
    event TreasurySet(address indexed oldTreasury, address indexed newTreasury);

    constructor(IPoolManager pm, address initialOwner) FlashRegistry(pm, initialOwner) {
        if (uint160(address(this)) & Hooks.ALL_HOOK_MASK != REQUIRED_FLAGS) revert HookPermissionsMismatch();
        treasury = owner;
    }

    modifier onlyPM() {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        _;
    }

    // ---------------------------------------------------------------------
    // Launch and administration
    // ---------------------------------------------------------------------

    /// @notice One-shot satellite wiring keeps hook initcode deployable under
    /// EIP-3860 while preserving one canonical hook address.
    function initializeModules(
        FlashOtcDeck otcDeck_,
        FlashLaunchGate launchGate_,
        FlashPoolAdmin poolAdmins_,
        FlashPoolStakingFactory stakingFactory_,
        FlashVenueRegistry venueRegistry_,
        FlashTaxModule taxModule_,
        FlashImpactInterceptor impactInterceptor_,
        FlashBuyAggregator buyAggregator_
    ) external onlyOwner {
        if (address(otcDeck) != address(0)) {
            revert ModulesAlreadyInitialized();
        }
        if (
            address(otcDeck_).code.length == 0 || address(launchGate_).code.length == 0
                || address(poolAdmins_).code.length == 0 || address(stakingFactory_).code.length == 0
                || address(venueRegistry_).code.length == 0 || address(taxModule_).code.length == 0
                || address(impactInterceptor_).code.length == 0 || address(buyAggregator_).code.length == 0
        ) revert InvalidModules();
        otcDeck = otcDeck_;
        launchGate = launchGate_;
        poolAdmins = poolAdmins_;
        stakingFactory = stakingFactory_;
        venueRegistry = venueRegistry_;
        taxModule = taxModule_;
        impactInterceptor = impactInterceptor_;
        buyAggregator = buyAggregator_;
    }

    /// @notice Changes only the terminal WETH receiver. It cannot move or
    /// relabel owner, admin, or public OTC positions.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidModules();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasurySet(oldTreasury, newTreasury);
    }

    function stagePoolLaunch(PoolKey calldata key, address creator, address adapter, address venuePool) external {
        if (address(otcDeck) == address(0)) revert InvalidModules();
        // The fee tier is enforced again atomically in `_registerPool`; it is
        // deliberately not duplicated here to preserve the hook byte budget.
        if (address(key.hooks) != address(this) || creator == address(0)) {
            revert InvalidLaunch();
        }
        Currency weth = wrappedNative;
        bool main = key.currency0 == weth || key.currency1 == weth;
        if (main) {
            launchGate.validateMainLaunch(msg.sender, creator);
        } else if (msg.sender != creator && msg.sender != owner && !launchGate.safeLauncher(msg.sender)) {
            revert NotPoolAuthority();
        }
        PoolId id = key.toId();
        launchIntent[id] = LaunchIntent(creator, msg.sender, adapter, venuePool, true);
        emit PoolLaunchStaged(id, creator, msg.sender, adapter, venuePool);
    }

    /// @notice Trusts a v4 router/quoter only to report its original caller.
    ///         The router itself receives no keeper exemption: the resolved
    ///         caller must equal the pool's current admin on every swap.
    function setSwapperContext(address context, bool allowed) external onlyOwner {
        poolAdmins.setContextSource(context, allowed, false);
    }

    /// @notice Configures a Universal Router version which exposes signed
    /// route context. This mode preserves the signer through relayed routes.
    function setSignedSwapperContext(address context, bool allowed) external onlyOwner {
        poolAdmins.setContextSource(context, allowed, true);
    }

    function setTax(PoolKey calldata key, TaxParams calldata params) external {
        PoolId id = key.toId();
        _requirePoolAuthority(id);
        taxModule.setTax(
            PoolId.unwrap(id),
            FlashTaxModule.TaxParams(
                params.baseBps,
                params.impactCapBps,
                params.rollingCapBps,
                params.lowVolMaxBps,
                params.lowVolTau,
                params.anchorWindow
            )
        );
    }

    function setOtcBps(PoolKey calldata key, uint16 otcBps, uint16 sellerFeeBps) external {
        PoolId id = key.toId();
        _syncAdmin(id);
        bool ownerAuthority = msg.sender == owner;
        if (!ownerAuthority && msg.sender != poolAdmins.adminOf(PoolId.unwrap(id))) revert NotPoolAuthority();
        otcDeck.setBps(PoolId.unwrap(id), otcBps, sellerFeeBps, ownerAuthority);
    }

    function configureImpact(PoolKey calldata key, FlashImpactInterceptor.Config calldata config) external {
        PoolId id = key.toId();
        _requirePoolAuthority(id);
        impactInterceptor.configure(key, config);
    }

    function depositOtc(PoolKey calldata key, uint256 amount) external returns (uint256 shares) {
        if (amount == 0) revert InvalidAmount();
        PoolId id = key.toId();
        Currency token = protocolTokenOfPool[id];
        ERC20(Currency.unwrap(token)).safeTransferFrom(msg.sender, address(this), amount);
        shares = otcDeck.deposit(PoolId.unwrap(id), msg.sender, FlashOtcDeck.ShareClass.Public, amount);
    }

    function claimOtc(PoolKey calldata key) external returns (uint256 amount) {
        (address quote, uint256 claim) = otcDeck.claimPublic(PoolId.unwrap(key.toId()), msg.sender);
        amount = claim;
        if (amount != 0) ERC20(quote).safeTransfer(msg.sender, amount);
    }

    function withdrawOtc(PoolKey calldata key, uint256 shares, address receiver) external returns (uint256 amount) {
        if (receiver == address(0)) revert InvalidAmount();
        (address token, uint256 assets) = otcDeck.withdrawPublic(PoolId.unwrap(key.toId()), msg.sender, shares);
        amount = assets;
        ERC20(token).safeTransfer(receiver, amount);
    }

    function churn(PoolKey calldata key) external returns (uint256 amount) {
        PoolId id = key.toId();
        _syncAdmin(id);
        amount = otcDeck.churnFor(PoolId.unwrap(id), msg.sender, FlashOtcDeck.ShareClass.AdminFee);
        _flushPayout(id, msg.sender, FlashOtcDeck.ShareClass.AdminFee);
    }

    function onOwnerStakingRewards(bytes32 rawId, address token, uint256 amount) external {
        FlashPoolStaking staking = stakingFactory.stakingOf(rawId);
        if (msg.sender != address(staking) || address(staking) == address(0)) revert WrongStakingVault();
        PoolId id = PoolId.wrap(rawId);
        if (Currency.unwrap(protocolTokenOfPool[id]) != token || amount == 0) revert InvalidAmount();
        otcDeck.deposit(rawId, owner, FlashOtcDeck.ShareClass.OwnerFee, amount);
    }

    function onOwnerStakingQuoteRewards(bytes32 rawId, address quote, uint256 amount) external {
        FlashPoolStaking staking = stakingFactory.stakingOf(rawId);
        if (msg.sender != address(staking) || address(staking) == address(0) || amount == 0) {
            revert WrongStakingVault();
        }
        (,,, address expectedQuote,,,,) = otcDeck.poolConfig(rawId);
        if (quote != expectedQuote) revert InvalidAmount();
        otcDeck.routeExternalQuote(rawId, owner, FlashOtcDeck.ShareClass.OwnerFee, amount);
        _flushPayout(PoolId.wrap(rawId), owner, FlashOtcDeck.ShareClass.OwnerFee);
    }

    function _requirePoolAuthority(PoolId id) private view {
        if (msg.sender != owner && msg.sender != poolAdmins.adminOf(PoolId.unwrap(id))) revert NotPoolAuthority();
    }

    function _syncAdmin(PoolId id) private {
        bytes32 rawId = PoolId.unwrap(id);
        (,,,,, address recorded,,) = otcDeck.poolConfig(rawId);
        address current = poolAdmins.adminOf(rawId);
        if (current != recorded) {
            otcDeck.setAdmin(rawId, current);
            _flushPayout(id, recorded, FlashOtcDeck.ShareClass.AdminFee);
        }
    }

    // ---------------------------------------------------------------------
    // Hook permissions and pool initialization
    // ---------------------------------------------------------------------

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Uniswap governance convention for hooks that aggregate
    ///         execution across external venues. Classification does not set
    ///         the fee by itself; governance must configure and trigger it.
    function protocolFeeFlags() external pure returns (uint256) {
        return 1 << 11;
    }

    /// @notice Multiplier required by Uniswap's aggregator-hook protocol-fee
    /// convention. It applies only to execution moved outside PoolManager;
    /// native v4 execution is charged by core.
    function protocolFeeMultiplier() external pure returns (uint24) {
        return 25;
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        onlyPM
        returns (bytes4)
    {
        PoolId id = key.toId();
        LaunchIntent memory intent = launchIntent[id];
        if (!intent.exists) revert LaunchNotStaged();
        if (sender != intent.initializer) revert WrongInitializer();
        delete launchIntent[id];

        launchGate.validateTokenCode(Currency.unwrap(key.currency0), Currency.unwrap(key.currency1));
        _registerPool(intent.creator, key);
        poolAdmins.initializeAdmin(PoolId.unwrap(id), intent.creator);
        venueRegistry.initializePool(
            PoolId.unwrap(id),
            Currency.unwrap(key.currency0),
            Currency.unwrap(key.currency1),
            intent.adapter,
            intent.venuePool
        );

        Currency token = protocolTokenOfPool[id];
        bool main = isMainPool[id];
        PoolId upstream = main ? PoolId.wrap(bytes32(0)) : parentMainOfSub[token];
        Currency quote = main ? wrappedNative : (key.currency0 == token ? key.currency1 : key.currency0);
        otcDeck.configurePool(
            PoolId.unwrap(id),
            main,
            PoolId.unwrap(upstream),
            Currency.unwrap(quote),
            Currency.unwrap(token),
            intent.creator
        );
        stakingFactory.deployForPool(
            PoolId.unwrap(id), ERC20(Currency.unwrap(token)), ERC20(Currency.unwrap(quote)), DEFAULT_FLASH_LOAN_FEE_BPS
        );

        taxModule.initializePool(PoolId.unwrap(id), sqrtPriceX96, key.currency0 == token);
        return IHooks.beforeInitialize.selector;
    }

    // ---------------------------------------------------------------------
    // Swap callbacks: OTC buy path and realized sell tax
    // ---------------------------------------------------------------------

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPM
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // Custom-accounting hooks can route the whole swap away from native
        // v4 math. Never allow that path to execute before governance's
        // directional protocol fee has been pushed into PoolManager.
        taxModule.requireProtocolFee(PoolId.unwrap(key.toId()), params.zeroForOne);
        if (sender == address(impactInterceptor) || sender == address(buyAggregator)) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        PoolId id = key.toId();
        _syncAdmin(id);
        (address token, uint16 otcBps) = _poolOtcConfig(id);
        Currency protocolToken = Currency.wrap(token);

        if ((params.zeroForOne ? key.currency1 : key.currency0) == protocolToken) {
            taxModule.beginObservation(PoolId.unwrap(id));
            BeforeSwapDelta otcDelta = _beforeOtcBuy(id, key, params, otcBps);
            return (IHooks.beforeSwap.selector, otcDelta, 0);
        }

        BeforeSwapDelta sellDelta = _beforeSell(sender, key, params);
        return (IHooks.beforeSwap.selector, sellDelta, 0);
    }

    function _poolOtcConfig(PoolId id) private view returns (address token, uint16 otcBps) {
        (,,,, token,, otcBps,) = otcDeck.poolConfig(PoolId.unwrap(id));
    }

    function _beforeSell(address sender, PoolKey calldata key, SwapParams calldata params)
        private
        returns (BeforeSwapDelta)
    {
        PoolId id = key.toId();
        Currency protocolToken = protocolTokenOfPool[id];
        // `_beforeSell` is reached only after beforeSwap established that the
        // output is not the pool's protocol token. Since launch validation
        // requires that token to be one of the two currencies, the input is
        // necessarily the protocol token here.
        if (poolAdmins.isKeeperSwapper(sender)) {
            taxModule.beginObservation(PoolId.unwrap(id));
            return BeforeSwapDeltaLibrary.ZERO_DELTA;
        }
        Currency quote = params.zeroForOne ? key.currency1 : key.currency0;
        if (params.amountSpecified >= 0) {
            taxModule.beginObservation(PoolId.unwrap(id));
            uint256 requestedOutput = uint256(params.amountSpecified);
            (uint256 exactOutRemainder, uint256 routeImpactBps) =
                impactInterceptor.stateQuoter().planExactOutputSellRoute(key, params.zeroForOne, requestedOutput);
            if (routeImpactBps > BPS) revert InvalidCallbackState();
            if (exactOutRemainder == 0) {
                if (routeImpactBps != 0) pendingExternalSellInput[id] = routeImpactBps << 128;
                impactInterceptor.prepare(key, params, 0);
                return BeforeSwapDeltaLibrary.ZERO_DELTA;
            }
            uint256 exactOutInput = _externalExactOutput(id, protocolToken, quote, exactOutRemainder, params.zeroForOne);
            if (exactOutInput > type(uint128).max) revert InvalidAmount();
            pendingExternalSellInput[id] = exactOutInput | (routeImpactBps << 128);
            return toBeforeSwapDelta(-int128(int256(exactOutRemainder)), int128(int256(exactOutInput)));
        }
        uint256 amount = uint256(-params.amountSpecified);
        (uint256 bps, uint256 tax, uint256 externalInput) = impactInterceptor.stateQuoter()
            .planTaxedExactInputSell(key, params.zeroForOne, amount, IFlashRoutedTaxQuote(address(taxModule)));
        taxModule.touch(PoolId.unwrap(id));
        uint256 externalOutput;
        if (externalInput == 0) {
            impactInterceptor.prepare(key, params, tax);
        } else {
            externalOutput = _externalExactInput(id, protocolToken, quote, externalInput, params.zeroForOne);
        }
        if (tax != 0) {
            poolManager.take(protocolToken, address(this), tax);
            _allocateTax(id, protocolToken, tax);
            emit TaxCharged(id, protocolToken, tax, bps);
        }
        uint256 specifiedHandled = tax + externalInput;
        if (specifiedHandled == 0 && externalOutput == 0) return BeforeSwapDeltaLibrary.ZERO_DELTA;
        if (
            specifiedHandled > uint256(uint128(type(int128).max)) || externalOutput > uint256(uint128(type(int128).max))
        ) {
            revert InvalidAmount();
        }
        return toBeforeSwapDelta(int128(int256(specifiedHandled)), -int128(int256(externalOutput)));
    }

    function _externalExactInput(PoolId id, Currency token, Currency quote, uint256 input, bool zeroForOne)
        private
        returns (uint256 output)
    {
        FlashSellRemainderRouter remainderRouter = impactInterceptor.sellRouter();
        poolManager.take(token, address(remainderRouter), input);
        uint256 grossOutput = remainderRouter.executeExactInput(PoolId.unwrap(id), token, quote, input);
        if (grossOutput == 0 || grossOutput > uint256(uint128(type(int128).max))) revert InvalidCallbackState();
        _settle(quote, grossOutput);
        (address tokenJar, uint256 feeAmount) =
            buyAggregator.externalProtocolFeeQuote(id, zeroForOne, true, grossOutput);
        if (feeAmount != 0) poolManager.take(quote, tokenJar, feeAmount);
        output = grossOutput - feeAmount;
    }

    function _externalExactOutput(PoolId id, Currency token, Currency quote, uint256 output, bool zeroForOne)
        private
        returns (uint256 input)
    {
        FlashSellRemainderRouter remainderRouter = impactInterceptor.sellRouter();
        uint256 routeInput = remainderRouter.quoteExactOutput(PoolId.unwrap(id), token, quote, output);
        if (routeInput == 0 || routeInput > uint256(uint128(type(int128).max))) revert InvalidCallbackState();
        (address tokenJar, uint256 feeAmount) =
            buyAggregator.externalProtocolFeeQuote(id, zeroForOne, false, routeInput);
        input = routeInput + feeAmount;
        poolManager.take(token, address(remainderRouter), routeInput);
        if (feeAmount != 0) poolManager.take(token, tokenJar, feeAmount);
        uint256 spent = remainderRouter.executeExactOutput(PoolId.unwrap(id), token, quote, output, routeInput);
        if (spent != routeInput) revert InvalidCallbackState();
        _settle(quote, output);
    }

    function _beforeOtcBuy(PoolId id, PoolKey calldata key, SwapParams calldata params, uint16 otcBps)
        private
        returns (BeforeSwapDelta delta)
    {
        Currency token = protocolTokenOfPool[id];
        Currency quote = params.zeroForOne ? key.currency0 : key.currency1;
        uint256 inventory = otcDeck.inventoryOf(PoolId.unwrap(id));
        FlashBuyAggregator.BuyPlan memory plan = buyAggregator.planBuy(key, params, otcBps, inventory);
        if (plan.specifiedAmount == 0) {
            return BeforeSwapDeltaLibrary.ZERO_DELTA;
        }
        BuyAmounts memory amounts = _executeBuyPlan(key, params, quote, plan);
        if (amounts.otcOutput > inventory || amounts.totalOutput > uint256(uint128(type(int128).max))) {
            revert InvalidCallbackState();
        }
        _settle(token, amounts.totalOutput);
        _recordOtc(id, amounts.otcOutput, amounts.otcInput);
        return params.amountSpecified < 0
            ? toBeforeSwapDelta(int128(int256(amounts.totalInput)), -int128(int256(amounts.totalOutput)))
            : toBeforeSwapDelta(-int128(int256(amounts.totalOutput)), int128(int256(amounts.totalInput)));
    }

    function _executeBuyPlan(
        PoolKey calldata key,
        SwapParams calldata params,
        Currency quote,
        FlashBuyAggregator.BuyPlan memory plan
    ) private returns (BuyAmounts memory amounts) {
        uint256 maxInput = plan.maxTotalInput;
        if (maxInput > uint256(uint128(type(int128).max))) revert InvalidAmount();
        poolManager.take(quote, address(this), maxInput);
        ERC20(Currency.unwrap(quote)).safeApprove(address(buyAggregator), plan.maxAmmInput);
        (uint256 ammInput, uint256 ammOutput,) = buyAggregator.executeBuy(key, plan);
        ERC20(Currency.unwrap(quote)).safeApprove(address(buyAggregator), 0);
        if (params.amountSpecified < 0) {
            amounts.totalInput = uint256(-params.amountSpecified);
            amounts.otcInput = plan.useOtc ? amounts.totalInput - ammInput : 0;
            amounts.otcOutput = amounts.otcInput == 0 ? 0 : amounts.otcInput * ammOutput / ammInput;
            amounts.totalOutput = ammOutput + amounts.otcOutput;
        } else {
            amounts.totalOutput = uint256(params.amountSpecified);
            amounts.otcOutput = plan.useOtc ? amounts.totalOutput - ammOutput : 0;
            amounts.otcInput =
                amounts.otcOutput == 0 ? 0 : FullMath.mulDivRoundingUp(amounts.otcOutput, ammInput, ammOutput);
            amounts.totalInput = ammInput + amounts.otcInput;
        }
        if (amounts.totalInput > maxInput) revert InvalidCallbackState();
        uint256 refund = maxInput - amounts.totalInput;
        if (refund != 0) {
            poolManager.sync(quote);
            ERC20(Currency.unwrap(quote)).safeTransfer(address(poolManager), refund);
            poolManager.settle();
        }
    }

    function _recordOtc(PoolId id, uint256 otcOutput, uint256 otcInput) private {
        if (otcOutput == 0) return;
        uint256 sellerFee = otcDeck.recordFill(PoolId.unwrap(id), otcOutput, otcInput);
        emit OtcFilled(id, otcOutput, otcInput, sellerFee);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta swapDelta,
        bytes calldata
    ) external onlyPM returns (bytes4, int128 hookDelta) {
        if (sender == address(impactInterceptor) || sender == address(buyAggregator)) {
            return (IHooks.afterSwap.selector, 0);
        }
        PoolId id = key.toId();

        Currency token = protocolTokenOfPool[id];
        bool isBuy = (key.currency0 == token) != params.zeroForOne;
        if (isBuy || poolAdmins.isKeeperSwapper(sender)) {
            taxModule.finishObservation(PoolId.unwrap(id), isBuy);
            _activateChurn(id);
            return (IHooks.afterSwap.selector, 0);
        }
        FlashImpactInterceptor.FinishResult memory impact = impactInterceptor.finish(key, swapDelta);
        if (params.amountSpecified < 0) {
            hookDelta = _afterExactInputImpact(id, key, impact);
            _activateChurn(id);
            return (IHooks.afterSwap.selector, hookDelta);
        }
        hookDelta = _afterSell(id, key, token, params, swapDelta, impact);
        _activateChurn(id);
        return (IHooks.afterSwap.selector, hookDelta);
    }

    function _afterSell(
        PoolId id,
        PoolKey calldata key,
        Currency token,
        SwapParams calldata params,
        BalanceDelta swapDelta,
        FlashImpactInterceptor.FinishResult memory impact
    ) private returns (int128 hookDelta) {
        int128 rawInput = params.zeroForOne ? swapDelta.amount0() : swapDelta.amount1();
        (uint256 externalInput, uint256 routeImpactBps) = _consumePendingExactOutputRoute(id);
        if (rawInput > 0 || (rawInput == 0 && externalInput == 0)) revert InvalidCallbackState();
        uint256 realizedInput = rawInput == 0 ? 0 : uint256(uint128(-rawInput));
        uint256 taxedInput = realizedInput + externalInput + impact.capture;
        uint256 totalTokenReward =
            _realizeExactOutputTax(id, token, taxedInput, routeImpactBps, params.zeroForOne, impact.capture);
        if (impact.quoteProfit != 0) _allocateImpactQuote(id, key, impact.quoteProfit);
        return int128(int256(totalTokenReward));
    }

    function _consumePendingExactOutputRoute(PoolId id)
        private
        returns (uint256 externalInput, uint256 routeImpactBps)
    {
        uint256 packedRoute = pendingExternalSellInput[id];
        if (packedRoute != 0) delete pendingExternalSellInput[id];
        externalInput = uint128(packedRoute);
        routeImpactBps = packedRoute >> 128;
    }

    function _realizeExactOutputTax(
        PoolId id,
        Currency token,
        uint256 taxedInput,
        uint256 routeImpactBps,
        bool zeroForOne,
        uint256 impactCapture
    ) private returns (uint256 totalTokenReward) {
        uint256 bps = taxModule.quoteObservedRouteImpactAndTouch(
            PoolId.unwrap(id), taxedInput, routeImpactBps, zeroForOne
        );
        uint256 tax = taxedInput * bps / BPS;
        totalTokenReward = tax + impactCapture;
        if (totalTokenReward > uint256(uint128(type(int128).max))) revert InvalidAmount();
        if (totalTokenReward != 0) {
            poolManager.take(token, address(this), totalTokenReward);
            _allocateTax(id, token, totalTokenReward);
        }
        emit TaxCharged(id, token, tax, bps);
    }

    function _afterExactInputImpact(PoolId id, PoolKey calldata key, FlashImpactInterceptor.FinishResult memory impact)
        private
        returns (int128 hookDelta)
    {
        if (!impact.activated) return 0;
        if (impact.captureInToken || impact.capture > uint256(uint128(type(int128).max))) {
            revert InvalidCallbackState();
        }
        Currency quote = key.currency0 == protocolTokenOfPool[id] ? key.currency1 : key.currency0;
        if (impact.capture != 0) poolManager.take(quote, address(this), impact.capture);
        _allocateImpactQuote(id, key, impact.capture + impact.quoteProfit);
        return int128(int256(impact.capture));
    }

    // ---------------------------------------------------------------------
    // Tax distribution and churn
    // ---------------------------------------------------------------------

    function _allocateTax(PoolId id, Currency token, uint256 tax) private {
        bytes32 rawId = PoolId.unwrap(id);
        _syncAdmin(id);
        uint256 stakerAmount = tax * 69 / 100;
        uint256 remainder = tax - stakerAmount;
        uint256 creatorAmount = remainder * 70 / 100;
        uint256 ownerAmount = tax - stakerAmount - creatorAmount;
        FlashPoolStaking staking = stakingFactory.stakingOf(rawId);
        if (address(staking) == address(0) || staking.totalShares() == 0) {
            ownerAmount += stakerAmount;
            stakerAmount = 0;
        } else if (stakerAmount != 0) {
            ERC20(Currency.unwrap(token)).safeTransfer(address(staking), stakerAmount);
            staking.creditReward(stakerAmount);
        }
        address admin = poolAdmins.adminOf(rawId);
        if (creatorAmount != 0) {
            otcDeck.deposit(rawId, admin, FlashOtcDeck.ShareClass.AdminFee, creatorAmount);
        }
        if (ownerAmount != 0) {
            otcDeck.deposit(rawId, owner, FlashOtcDeck.ShareClass.OwnerFee, ownerAmount);
        }
        emit TaxAllocated(id, stakerAmount, creatorAmount, ownerAmount);
    }

    function _allocateImpactQuote(PoolId id, PoolKey calldata key, uint256 amount) private {
        if (amount == 0) return;
        bytes32 rawId = PoolId.unwrap(id);
        Currency token = protocolTokenOfPool[id];
        Currency quote = key.currency0 == token ? key.currency1 : key.currency0;
        uint256 stakerAmount = amount * 6_900 / BPS;
        uint256 creatorAmount = amount * 2_170 / BPS;
        uint256 ownerAmount = amount - stakerAmount - creatorAmount;
        FlashPoolStaking staking = stakingFactory.stakingOf(rawId);
        if (address(staking) == address(0) || staking.totalShares() == 0) {
            ownerAmount += stakerAmount;
            stakerAmount = 0;
        } else {
            ERC20(Currency.unwrap(quote)).safeTransfer(address(staking), stakerAmount);
            staking.creditQuoteReward(stakerAmount);
        }
        address admin = poolAdmins.adminOf(rawId);
        if (creatorAmount != 0) {
            otcDeck.routeExternalQuote(rawId, admin, FlashOtcDeck.ShareClass.AdminFee, creatorAmount);
        }
        if (ownerAmount != 0) {
            otcDeck.routeExternalQuote(rawId, owner, FlashOtcDeck.ShareClass.OwnerFee, ownerAmount);
        }
        _flushPayout(id, admin, FlashOtcDeck.ShareClass.AdminFee);
        _flushPayout(id, owner, FlashOtcDeck.ShareClass.OwnerFee);
    }

    /// @dev Every user swap activates a bounded current-pool payout plus one
    /// sub-to-main hop. This lets each sub admin collect WETH generated by a
    /// later main-pool fill without an external keeper or an unbounded loop.
    function _activateChurn(PoolId id) private {
        bytes32 rawId = PoolId.unwrap(id);
        _flushPayout(id, owner, FlashOtcDeck.ShareClass.OwnerFee);
        _flushPayout(id, poolAdmins.adminOf(rawId), FlashOtcDeck.ShareClass.AdminFee);
    }

    function _flushPayout(PoolId id, address beneficiary, FlashOtcDeck.ShareClass class) private {
        if (beneficiary == address(0)) return;
        (address quote, uint256 amount) = otcDeck.consumePayout(PoolId.unwrap(id), beneficiary, class);
        if (amount == 0) return;
        ERC20 asset = ERC20(quote);
        if (class == FlashOtcDeck.ShareClass.OwnerFee) {
            asset.safeApprove(address(impactInterceptor), amount);
            impactInterceptor.routeTreasuryPayout(amount);
            asset.safeApprove(address(impactInterceptor), 0);
        } else {
            asset.safeTransfer(beneficiary, amount);
        }
    }

    function _settle(Currency currency, uint256 amount) private {
        poolManager.sync(currency);
        ERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), amount);
        poolManager.settle();
    }
}
