// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "./base/BaseHook.sol";
import {FeeEscrow} from "./FeeEscrow.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {CurrencySettler} from "v4-core/test/utils/CurrencySettler.sol";

import {ILaunchBuyAdapter} from "./interfaces/ILaunchBuyAdapter.sol";

interface IWiredFactory {
    function hook() external view returns (address launchHook);
    function poolManager() external view returns (address manager);
}

/// @title LaunchHook
/// @notice The single shared Uniswap v4 hook for every launch in one deployment suite. It:
///         - gates pool creation to the launchpad factory (`beforeInitialize`),
///         - blocks all third-party liquidity adds/removes, and owns the one permanently-locked
///           single-sided position (no code path ever passes a negative liquidityDelta),
///         - on every swap takes a fee on the quote currency as an ERC-6909 claim minted to the
///           FeeEscrow, split through bounded per-pool fee components, plus a timestamp-anchored anti-snipe
///           surcharge routed to the pool's mandatory platform component.
/// @dev    One deployment, reused by all launches; per-pool economics are frozen at launch in `poolConfig`.
///         Deployed at a CREATE2-mined address whose low 14 bits equal `getHookPermissions()` (BaseHook
///         validates this in the constructor). Fee custody lives in the FeeEscrow, not here.
contract LaunchHook is BaseHook, Initializable {
    using CurrencySettler for Currency;
    using SafeCast for uint256;

    uint256 internal constant BPS = 10_000;
    /// @notice Hard ceiling on the admin-settable base fee (10%).
    uint16 public constant MAX_BASE_FEE_BPS = 1_000;
    /// @notice Hard ceiling on the total per-swap fee (base + anti-snipe), strictly below 100%.
    uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;
    uint256 public constant MAX_FEE_COMPONENTS = 20;
    uint256 public constant MAX_LAUNCH_BUY_ROUTE_DATA_LENGTH = 4_096;
    bytes32 internal constant CREATOR_COMPONENT_ID = bytes32("CREATOR");
    bytes32 internal constant PLATFORM_COMPONENT_ID = bytes32("PLATFORM");
    bytes32 internal constant REFERRER_COMPONENT_ID = bytes32("REFERRER");

    enum FeeRecipientKind {
        CREATOR,
        PLATFORM,
        REFERRER,
        FIXED
    }

    struct FeeComponent {
        bytes32 componentId;
        FeeRecipientKind recipientKind;
        address configuredRecipient;
        uint16 feeBps;
    }

    /// @notice Frozen per-pool economics, set by the factory at launch and never changed afterward.
    struct PoolConfig {
        bool initialized;
        bool tokenIsCurrency0;
        address currentCreator;
        address creatorFeeRecipient;
        uint16 baseFeeBps;
        uint16 antiSnipeStartTotalBps; // total fee at launchTime (e.g. 9900), decays to baseFeeBps
        uint32 antiSnipeWindowSeconds;
        uint48 launchTime;
    }

    struct HookDataEnvelope {
        address referrer;
        bytes32 comment;
    }

    enum LaunchBuyContextState {
        NONE,
        ARMED,
        EXECUTING,
        CONSUMED
    }

    struct LaunchBuyContext {
        LaunchBuyContextState state;
        PoolId poolId;
        address swapCaller;
    }

    /// @notice A resolved single-sided liquidity band, computed by the factory and seeded here.
    struct SeedPosition {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    /// @notice The address allowed to wire `factory`/`feeEscrow` exactly once (the deployer/deploy script).
    address public immutable deployer;

    address public factory;
    address public feeEscrow;
    address public launchBuyAdapter;
    bool public wired;

    mapping(PoolId poolId => PoolConfig configuration) public poolConfig;
    mapping(PoolId poolId => FeeComponent[] components) internal _poolFeeComponents;
    mapping(PoolId poolId => uint8 componentIndex) internal _platformComponentIndex;
    LaunchBuyContext internal _launchBuyContext;

    error NotDeployer();
    error NotFactory();
    error NotWired();
    error ZeroAddress();
    error BadWiring();
    error AlreadyRegistered();
    error LiquidityLocked();
    error NotSingleSided();
    error InvalidFeeConfig();
    error ExactOutputDisabledDuringAntiSnipe();
    error PartialFillUnsupported();
    error UnexpectedFeeCurrency();
    error LaunchBuyContextActive();
    error LaunchBuyContextMissing();
    error LaunchBuyContextMismatch(
        PoolId expectedPoolId, PoolId actualPoolId, address expectedSwapCaller, address actualSwapCaller
    );
    error LaunchBuyContextNotConsumed();
    error LaunchBuyMultipleSwaps();
    error InvalidLaunchBuyDirection();
    error LaunchBuyExactOutputUnsupported();
    error ZeroLaunchBuyOutput();
    error LaunchBuyAdapterNotConfigured();
    error InvalidLaunchBuyAdapter(address adapter);
    error InvalidLaunchBuyRequest();

    event Wired(address indexed factory, address indexed feeEscrow);
    event PoolRegistered(
        PoolId indexed poolId, address indexed originalCreator, address indexed creatorFeeRecipient, uint16 baseFeeBps
    );
    event CreatorRightsUpdated(
        PoolId indexed poolId,
        address indexed previousCreator,
        address indexed newCreator,
        address previousCreatorFeeRecipient,
        address newCreatorFeeRecipient
    );
    event FeeComponentCredited(
        PoolId indexed poolId, bytes32 indexed componentId, address indexed recipient, address currency, uint256 amount
    );
    event Seeded(PoolId indexed poolId, uint256 tokenAmountSeeded);
    event Trade(
        PoolId indexed poolId,
        address indexed executor,
        address indexed referrer,
        address feeCurrency,
        uint256 totalFeeAmount,
        bytes32 comment
    );

    constructor(IPoolManager poolManagerAddress, address hookDeployer) BaseHook(poolManagerAddress) {
        address manager = address(poolManagerAddress);
        if (
            manager == address(0) || manager.code.length == 0 || hookDeployer == address(0)
                || hookDeployer == address(this) || hookDeployer == manager
        ) revert BadWiring();
        deployer = hookDeployer;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
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

    /// @notice One-time wiring of the factory + fee escrow (breaks the deploy cycle: hook is deployed first).
    /// @dev    Guarded by OpenZeppelin's `initializer` modifier (set-once, the standard initialization pattern)
    ///         on top of the deployer-only authorization check, so it can never be re-run. To also close the
    ///         deploy-time window between deployment and wiring, production deploys SHOULD perform the
    ///         deployment and this call atomically (single deployer transaction / contract); see DEPLOY_BASE.md.
    function initialize(address factoryAddress, address feeEscrowAddress) external initializer {
        if (msg.sender != deployer) revert NotDeployer();
        if (factoryAddress == address(0) || feeEscrowAddress == address(0)) revert ZeroAddress();
        // The hook is the single shared, un-re-wireable instance, so a mis-wire bricks every launch with no
        // recovery. Bind both sides: the factory and escrow must already point back at this exact hook (and
        // the escrow at the same PoolManager) or wiring fails closed instead of silently.
        if (factoryAddress.code.length == 0 || feeEscrowAddress.code.length == 0) revert BadWiring();
        if (IWiredFactory(factoryAddress).hook() != address(this)) revert BadWiring();
        if (IWiredFactory(factoryAddress).poolManager() != address(poolManager)) revert BadWiring();
        if (FeeEscrow(feeEscrowAddress).hook() != address(this)) revert BadWiring();
        if (address(FeeEscrow(feeEscrowAddress).poolManager()) != address(poolManager)) revert BadWiring();
        factory = factoryAddress;
        feeEscrow = feeEscrowAddress;
        wired = true;
        emit Wired(factoryAddress, feeEscrowAddress);
    }

    // ---- factory-only setup ----

    function registerPool(
        PoolKey calldata poolKey,
        PoolConfig calldata poolConfiguration,
        FeeComponent[] calldata frozenFeeComponents
    ) external {
        if (msg.sender != factory) revert NotFactory();
        uint8 platformIndex = _validateFeeConfiguration(poolConfiguration, frozenFeeComponents);
        PoolId poolId = poolKey.toId();
        if (poolConfig[poolId].initialized) revert AlreadyRegistered();
        PoolConfig memory frozenConfiguration = poolConfiguration;
        frozenConfiguration.initialized = true;
        poolConfig[poolId] = frozenConfiguration;
        _platformComponentIndex[poolId] = platformIndex;
        for (uint256 i = 0; i < frozenFeeComponents.length; i++) {
            _poolFeeComponents[poolId].push(frozenFeeComponents[i]);
        }
        emit PoolRegistered(
            poolId,
            frozenConfiguration.currentCreator,
            frozenConfiguration.creatorFeeRecipient,
            frozenConfiguration.baseFeeBps
        );
    }

    function updateCreatorRights(PoolId poolId, address newCreator, address newCreatorFeeRecipient) external {
        if (msg.sender != factory) revert NotFactory();
        PoolConfig storage configuration = poolConfig[poolId];
        if (!configuration.initialized) revert InvalidFeeConfig();
        if (newCreator == address(0) || newCreatorFeeRecipient == address(0)) revert InvalidFeeConfig();
        address previousCreator = configuration.currentCreator;
        address previousCreatorFeeRecipient = configuration.creatorFeeRecipient;
        configuration.currentCreator = newCreator;
        configuration.creatorFeeRecipient = newCreatorFeeRecipient;
        emit CreatorRightsUpdated(
            poolId, previousCreator, newCreator, previousCreatorFeeRecipient, newCreatorFeeRecipient
        );
    }

    function poolFeeComponents(PoolId poolId) external view returns (FeeComponent[] memory components) {
        return _poolFeeComponents[poolId];
    }

    function setLaunchBuyAdapter(address newLaunchBuyAdapter) external {
        if (msg.sender != factory) revert NotFactory();
        if (_launchBuyContext.state != LaunchBuyContextState.NONE) revert LaunchBuyContextActive();
        if (newLaunchBuyAdapter != address(0)) _validateLaunchBuyAdapter(newLaunchBuyAdapter);
        launchBuyAdapter = newLaunchBuyAdapter;
    }

    function executeLaunchBuy(PoolId poolId, ILaunchBuyAdapter.LaunchBuyRequest calldata request)
        external
        payable
        returns (uint256 amountOut)
    {
        if (msg.sender != factory) revert NotFactory();
        address adapter = launchBuyAdapter;
        if (adapter == address(0)) revert LaunchBuyAdapterNotConfigured();
        if (
            PoolId.unwrap(request.poolKey.toId()) != PoolId.unwrap(poolId) || request.launchToken == address(0)
                || request.originalCreator == address(0) || request.amountIn == 0 || request.minAmountOut == 0
                || request.routeData.length == 0 || request.routeData.length > MAX_LAUNCH_BUY_ROUTE_DATA_LENGTH
        ) revert InvalidLaunchBuyRequest();

        PoolConfig storage configuration = poolConfig[poolId];
        if (!configuration.initialized || configuration.currentCreator != request.originalCreator) {
            revert InvalidLaunchBuyRequest();
        }
        if (_launchBuyContext.state != LaunchBuyContextState.NONE) revert LaunchBuyContextActive();

        address swapCaller = ILaunchBuyAdapter(adapter).swapCaller();
        _launchBuyContext =
            LaunchBuyContext({state: LaunchBuyContextState.ARMED, poolId: poolId, swapCaller: swapCaller});
        uint256 creatorBalanceBefore = IERC20(request.launchToken).balanceOf(request.originalCreator);
        amountOut = ILaunchBuyAdapter(adapter).executeLaunchBuy{value: msg.value}(request);
        LaunchBuyContext memory context = _launchBuyContext;
        if (context.state != LaunchBuyContextState.CONSUMED) revert LaunchBuyContextNotConsumed();

        uint256 creatorBalanceAfter = IERC20(request.launchToken).balanceOf(request.originalCreator);
        if (
            amountOut < request.minAmountOut || creatorBalanceAfter < creatorBalanceBefore
                || creatorBalanceAfter - creatorBalanceBefore != amountOut
        ) revert InvalidLaunchBuyRequest();
        delete _launchBuyContext;
    }

    function _validateLaunchBuyAdapter(address adapter) internal view {
        if (
            adapter.code.length == 0 || _isReservedLaunchBuyDependency(adapter)
                || ILaunchBuyAdapter(adapter).factory() != factory
                || ILaunchBuyAdapter(adapter).launchHook() != address(this)
                || ILaunchBuyAdapter(adapter).poolManager() != address(poolManager)
        ) revert InvalidLaunchBuyAdapter(adapter);

        address reportedRouter = ILaunchBuyAdapter(adapter).router();
        address reportedSwapCaller = ILaunchBuyAdapter(adapter).swapCaller();
        if (
            reportedRouter.code.length == 0 || reportedSwapCaller.code.length == 0
                || _isReservedLaunchBuyDependency(reportedRouter) || _isReservedLaunchBuyDependency(reportedSwapCaller)
        ) revert InvalidLaunchBuyAdapter(adapter);
    }

    function _isReservedLaunchBuyDependency(address account) internal view returns (bool) {
        return account == factory || account == address(this) || account == address(poolManager) || account == feeEscrow;
    }

    /// @notice Seed the launch token as single-sided liquidity owned by this hook (permanent: there is no
    ///         path that ever removes it). Each band's quote-side delta is asserted zero, the on-chain
    ///         guarantee that the seed is token-only.
    function seedLiquidity(PoolKey calldata key, SeedPosition[] calldata positions, bool tokenIsCurrency0) external {
        if (msg.sender != factory) revert NotFactory();
        poolManager.unlock(abi.encode(key, positions, tokenIsCurrency0));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        // Only ever reached as the callback to this hook's own `seedLiquidity` unlock (the PoolManager calls
        // back the unlock caller), so this guard fully gates it.
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, SeedPosition[] memory positions, bool tokenIsCurrency0) =
            abi.decode(data, (PoolKey, SeedPosition[], bool));

        Currency tokenCurrency = tokenIsCurrency0 ? key.currency0 : key.currency1;
        uint256 tokenOwed;
        for (uint256 i = 0; i < positions.length; i++) {
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: positions[i].tickLower,
                    tickUpper: positions[i].tickUpper,
                    liquidityDelta: int256(uint256(positions[i].liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            int128 quoteDelta = tokenIsCurrency0 ? delta.amount1() : delta.amount0();
            if (quoteDelta != 0) revert NotSingleSided();
            int128 tokenDelta = tokenIsCurrency0 ? delta.amount0() : delta.amount1();
            // adding liquidity owes the token (negative delta from the caller's perspective)
            if (tokenDelta > 0) revert NotSingleSided();
            // forge-lint: disable-next-line(unsafe-typecast) tokenDelta is checked < 0, so -tokenDelta fits uint128
            tokenOwed += uint256(uint128(-tokenDelta));
        }
        tokenCurrency.settle(poolManager, address(this), tokenOwed, false);
        emit Seeded(key.toId(), tokenOwed);
        return "";
    }

    // ---- hook callbacks ----

    function _beforeInitialize(address sender, PoolKey calldata, uint160) internal view override returns (bytes4) {
        if (!wired) revert NotWired();
        if (sender != factory) revert NotFactory();
        return IHooks.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        // The hook's own genesis seed is a self-call and skips this callback; everyone else is blocked.
        revert LiquidityLocked();
    }

    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal pure override returns (bytes4) {
        revert LiquidityLocked();
    }

    function _beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        PoolConfig memory cfg = poolConfig[poolId];
        (Currency quoteCurrency, bool quoteIsSpecified) = _quoteCurrencyAndSpecified(key, params, cfg);
        bool activeLaunchBuy = _launchBuyContext.state != LaunchBuyContextState.NONE;
        if (activeLaunchBuy) {
            _matchLaunchBuyContextBeforeSwap(poolId, sender, params, quoteIsSpecified, cfg.initialized);
        } else {
            if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            if (params.amountSpecified > 0 && _isSurchargeWindowActive(cfg)) {
                revert ExactOutputDisabledDuringAntiSnipe();
            }
        }

        uint256 totalFeeBps = activeLaunchBuy ? cfg.baseFeeBps : _totalFeeBps(cfg);
        if (!quoteIsSpecified) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        bool exactOutput = params.amountSpecified > 0;
        uint256 totalFee = _feeAmount(_specifiedMagnitude(params.amountSpecified), totalFeeBps, exactOutput);
        if (totalFee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        PoolConfig memory cfg = poolConfig[poolId];
        (Currency quoteCurrency, bool quoteIsSpecified) = _quoteCurrencyAndSpecified(key, params, cfg);
        bool activeLaunchBuy = _launchBuyContext.state != LaunchBuyContextState.NONE;
        if (activeLaunchBuy) {
            _matchLaunchBuyContextAfterSwap(poolId, sender, params, quoteIsSpecified, cfg.initialized);
        } else {
            if (!cfg.initialized) return (IHooks.afterSwap.selector, int128(0));
            if (params.amountSpecified > 0 && _isSurchargeWindowActive(cfg)) {
                revert ExactOutputDisabledDuringAntiSnipe();
            }
        }

        uint256 totalFeeBps = activeLaunchBuy ? cfg.baseFeeBps : _totalFeeBps(cfg);
        bool exactOutput = params.amountSpecified > 0;

        if (quoteIsSpecified) {
            uint256 specifiedMagnitude = _specifiedMagnitude(params.amountSpecified);
            // Must match the fee charged in _beforeSwap; both paths use the same params and transaction timestamp.
            uint256 specifiedFee = _feeAmount(specifiedMagnitude, totalFeeBps, exactOutput);
            if (specifiedFee != 0) {
                _creditFeeComponents(
                    cfg, quoteCurrency, specifiedMagnitude, specifiedFee, exactOutput, hookData, poolId, sender
                );
            }
            if (activeLaunchBuy) {
                _requireFullSpecifiedFill(params, delta, specifiedFee);
                _consumeLaunchBuyContextAfterSwap(cfg, delta);
            } else if (specifiedFee != 0) {
                _requireFullSpecifiedFill(params, delta, specifiedFee);
            }
            return (IHooks.afterSwap.selector, int128(0));
        }

        (Currency feeCurrency, uint256 unspecifiedMagnitude) = _unspecifiedCurrencyAndMagnitude(key, params, delta);
        if (Currency.unwrap(feeCurrency) != Currency.unwrap(quoteCurrency)) revert UnexpectedFeeCurrency();
        if (unspecifiedMagnitude == 0) return (IHooks.afterSwap.selector, int128(0));

        uint256 totalFee =
            _chargeFee(cfg, quoteCurrency, unspecifiedMagnitude, totalFeeBps, exactOutput, hookData, poolId, sender);
        if (totalFee == 0) return (IHooks.afterSwap.selector, int128(0));

        return (IHooks.afterSwap.selector, totalFee.toInt128());
    }

    // ---- fee internals ----

    function _chargeFee(
        PoolConfig memory cfg,
        Currency feeCurrency,
        uint256 magnitude,
        uint256 totalFeeBps,
        bool exactOutput,
        bytes calldata hookData,
        PoolId poolId,
        address sender
    ) internal returns (uint256 totalFee) {
        totalFee = _feeAmount(magnitude, totalFeeBps, exactOutput);
        if (totalFee == 0) return 0;

        poolManager.mint(feeEscrow, feeCurrency.toId(), totalFee);
        _creditFeeComponents(cfg, feeCurrency, magnitude, totalFee, exactOutput, hookData, poolId, sender);
    }

    function _creditFeeComponents(
        PoolConfig memory cfg,
        Currency feeCurrency,
        uint256 magnitude,
        uint256 totalFee,
        bool exactOutput,
        bytes calldata hookData,
        PoolId poolId,
        address sender
    ) internal {
        address currencyAddr = Currency.unwrap(feeCurrency);
        uint256 baseFee = _feeAmount(magnitude, cfg.baseFeeBps, exactOutput); // <= totalFee
        (address referrer, bytes32 comment) = _parseHookData(hookData);
        FeeEscrow escrow = FeeEscrow(feeEscrow);
        FeeComponent[] storage components = _poolFeeComponents[poolId];
        uint256 platformIndex = _platformComponentIndex[poolId];
        bool validReferrer = _isValidReferrer(referrer, sender, cfg);
        uint256 credited;

        for (uint256 i = 0; i < components.length; i++) {
            if (i == platformIndex) continue;
            FeeComponent storage component = components[i];
            address recipient;
            if (component.recipientKind == FeeRecipientKind.CREATOR) {
                recipient = cfg.creatorFeeRecipient;
            } else if (component.recipientKind == FeeRecipientKind.REFERRER) {
                if (!validReferrer) continue;
                recipient = referrer;
            } else {
                recipient = component.configuredRecipient;
            }

            uint256 amount = Math.mulDiv(baseFee, component.feeBps, cfg.baseFeeBps);
            if (amount == 0) continue;
            credited += amount;
            escrow.credit(recipient, currencyAddr, amount);
            emit FeeComponentCredited(poolId, component.componentId, recipient, currencyAddr, amount);
        }

        FeeComponent storage platformComponent = components[platformIndex];
        uint256 remainder = totalFee - credited;
        escrow.credit(platformComponent.configuredRecipient, currencyAddr, remainder);
        emit FeeComponentCredited(
            poolId, platformComponent.componentId, platformComponent.configuredRecipient, currencyAddr, remainder
        );

        emit Trade(poolId, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);
    }

    function _isValidReferrer(address referrer, address sender, PoolConfig memory cfg) internal view returns (bool) {
        if (
            referrer == address(0) || referrer == sender || referrer == cfg.currentCreator
                || referrer == cfg.creatorFeeRecipient || referrer == address(this) || referrer == factory
                || referrer == feeEscrow || referrer == address(poolManager)
        ) return false;
        return true;
    }

    function _feeAmount(uint256 magnitude, uint256 feeBps, bool exactOutput) internal pure returns (uint256) {
        if (feeBps == 0) return 0;
        if (!exactOutput) return Math.mulDiv(magnitude, feeBps, BPS);
        return Math.mulDiv(magnitude, feeBps, BPS - feeBps, Math.Rounding.Ceil);
    }

    function _quoteCurrencyAndSpecified(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        PoolConfig memory cfg
    ) internal pure returns (Currency quoteCurrency, bool quoteIsSpecified) {
        quoteCurrency = cfg.tokenIsCurrency0 ? key.currency1 : key.currency0;
        bool exactIn = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = exactIn ? params.zeroForOne : !params.zeroForOne;
        Currency specifiedCurrency = specifiedIsCurrency0 ? key.currency0 : key.currency1;
        quoteIsSpecified = Currency.unwrap(specifiedCurrency) == Currency.unwrap(quoteCurrency);
    }

    function _specifiedMagnitude(int256 amountSpecified) internal pure returns (uint256) {
        if (amountSpecified < 0) return uint256(-(amountSpecified + 1)) + 1;
        // forge-lint: disable-next-line(unsafe-typecast) non-negative int256 always fits in uint256
        return uint256(amountSpecified);
    }

    function _requireFullSpecifiedFill(
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        uint256 specifiedFee
    ) internal pure {
        bool exactIn = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = exactIn ? params.zeroForOne : !params.zeroForOne;
        int128 actualSpecified = specifiedIsCurrency0 ? delta.amount0() : delta.amount1();
        // forge-lint: disable-next-line(unsafe-typecast) beforeSwap already requires this fee to fit int128
        int256 expectedSpecified = params.amountSpecified + int256(specifiedFee);
        if (int256(actualSpecified) != expectedSpecified) revert PartialFillUnsupported();
    }

    /// @notice Total fee in bps for the current time: base + a linearly-decaying anti-snipe surcharge over
    ///         the first `antiSnipeWindowSeconds` after launch, capped at `MAX_TOTAL_FEE_BPS`.
    function _totalFeeBps(PoolConfig memory cfg) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - cfg.launchTime;
        if (elapsed >= cfg.antiSnipeWindowSeconds) return cfg.baseFeeBps;
        uint256 maxSurcharge = uint256(cfg.antiSnipeStartTotalBps) - cfg.baseFeeBps;
        uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;
        uint256 total = uint256(cfg.baseFeeBps) + surcharge;
        return total > MAX_TOTAL_FEE_BPS ? MAX_TOTAL_FEE_BPS : total;
    }

    function _isSurchargeWindowActive(PoolConfig memory cfg) internal view returns (bool) {
        if (cfg.antiSnipeStartTotalBps == cfg.baseFeeBps) return false;
        if (block.timestamp <= cfg.launchTime) return true;
        return block.timestamp - cfg.launchTime < cfg.antiSnipeWindowSeconds;
    }

    /// @notice The unspecified currency of the swap and the absolute amount that moved in it.
    function _unspecifiedCurrencyAndMagnitude(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta
    ) internal pure returns (Currency currency, uint256 magnitude) {
        bool exactIn = params.amountSpecified < 0;
        // exact-in: unspecified = output; exact-out: unspecified = input.
        bool unspecifiedIsCurrency1 = exactIn ? params.zeroForOne : !params.zeroForOne;
        int128 d;
        if (unspecifiedIsCurrency1) {
            currency = key.currency1;
            d = delta.amount1();
        } else {
            currency = key.currency0;
            d = delta.amount0();
        }
        // forge-lint: disable-next-line(unsafe-typecast) canonical v4 abs(int128); correct across the full range
        magnitude = d < 0 ? uint256(uint128(-d)) : uint256(uint128(d));
    }

    /// @notice Referrals + a short comment ride in the swap's hookData (a B20 memo cannot: a v4 swap is a
    ///         settle/take, not a `transferWithMemo`). Data is decoded defensively from fixed offsets.
    function _parseHookData(bytes calldata hookData) internal pure returns (address referrer, bytes32 comment) {
        HookDataEnvelope memory envelope = _decodeHookData(hookData);
        return (envelope.referrer, envelope.comment);
    }

    function _decodeHookData(bytes calldata hookData) internal pure returns (HookDataEnvelope memory envelope) {
        if (hookData.length >= 32) {
            uint256 referrerWord = uint256(bytes32(hookData[:32]));
            // forge-lint: disable-next-line(unsafe-typecast) legacy hook data intentionally reads the low address word.
            envelope.referrer = address(uint160(referrerWord));
        }
        if (hookData.length >= 64) {
            envelope.comment = bytes32(hookData[32:64]);
        }
    }

    function _matchLaunchBuyContextBeforeSwap(
        PoolId poolId,
        address sender,
        IPoolManager.SwapParams calldata params,
        bool quoteIsSpecified,
        bool poolInitialized
    ) internal {
        LaunchBuyContext storage context = _launchBuyContext;
        if (context.state != LaunchBuyContextState.ARMED) revert LaunchBuyMultipleSwaps();
        if (PoolId.unwrap(context.poolId) != PoolId.unwrap(poolId) || context.swapCaller != sender) {
            revert LaunchBuyContextMismatch(context.poolId, poolId, context.swapCaller, sender);
        }
        if (params.amountSpecified >= 0) revert LaunchBuyExactOutputUnsupported();
        if (!poolInitialized || !quoteIsSpecified) revert InvalidLaunchBuyDirection();
        context.state = LaunchBuyContextState.EXECUTING;
    }

    function _matchLaunchBuyContextAfterSwap(
        PoolId poolId,
        address sender,
        IPoolManager.SwapParams calldata params,
        bool quoteIsSpecified,
        bool poolInitialized
    ) internal view {
        LaunchBuyContext storage context = _launchBuyContext;
        if (context.state != LaunchBuyContextState.EXECUTING) revert LaunchBuyContextMissing();
        if (PoolId.unwrap(context.poolId) != PoolId.unwrap(poolId) || context.swapCaller != sender) {
            revert LaunchBuyContextMismatch(context.poolId, poolId, context.swapCaller, sender);
        }
        if (params.amountSpecified >= 0) revert LaunchBuyExactOutputUnsupported();
        if (!poolInitialized || !quoteIsSpecified) revert InvalidLaunchBuyDirection();
    }

    function _consumeLaunchBuyContextAfterSwap(PoolConfig memory cfg, BalanceDelta delta) internal {
        int128 tokenOutput = cfg.tokenIsCurrency0 ? delta.amount0() : delta.amount1();
        if (tokenOutput <= 0) revert ZeroLaunchBuyOutput();
        _launchBuyContext.state = LaunchBuyContextState.CONSUMED;
    }

    function _validateFeeConfiguration(PoolConfig calldata cfg, FeeComponent[] calldata components)
        internal
        view
        returns (uint8 platformIndex)
    {
        if (cfg.baseFeeBps > MAX_BASE_FEE_BPS) revert InvalidFeeConfig();
        if (cfg.antiSnipeStartTotalBps < cfg.baseFeeBps || cfg.antiSnipeStartTotalBps > MAX_TOTAL_FEE_BPS) {
            revert InvalidFeeConfig();
        }
        if (cfg.antiSnipeWindowSeconds == 0) revert InvalidFeeConfig();
        if (cfg.currentCreator == address(0) || cfg.creatorFeeRecipient == address(0)) revert InvalidFeeConfig();

        uint256 n = components.length;
        if (cfg.baseFeeBps == 0 || n < 3 || n > MAX_FEE_COMPONENTS) revert InvalidFeeConfig();
        uint256 totalBps;
        bool creatorFound;
        bool platformFound;
        bool referrerFound;
        bytes32 previousId;
        for (uint256 i = 0; i < n; i++) {
            FeeComponent calldata component = components[i];
            if (component.componentId == bytes32(0) || component.componentId <= previousId || component.feeBps == 0) {
                revert InvalidFeeConfig();
            }
            if (component.recipientKind == FeeRecipientKind.CREATOR) {
                if (
                    creatorFound || component.componentId != CREATOR_COMPONENT_ID
                        || component.configuredRecipient != address(0)
                ) {
                    revert InvalidFeeConfig();
                }
                creatorFound = true;
            } else if (component.recipientKind == FeeRecipientKind.PLATFORM) {
                if (platformFound || component.componentId != PLATFORM_COMPONENT_ID) revert InvalidFeeConfig();
                _validateConfiguredFeeRecipient(component.configuredRecipient);
                platformFound = true;
                // forge-lint: disable-next-line(unsafe-typecast) component count is capped at 20
                platformIndex = uint8(i);
            } else if (component.recipientKind == FeeRecipientKind.REFERRER) {
                if (
                    referrerFound || component.componentId != REFERRER_COMPONENT_ID
                        || component.configuredRecipient != address(0)
                ) {
                    revert InvalidFeeConfig();
                }
                referrerFound = true;
            } else {
                if (
                    component.componentId == CREATOR_COMPONENT_ID || component.componentId == PLATFORM_COMPONENT_ID
                        || component.componentId == REFERRER_COMPONENT_ID
                ) revert InvalidFeeConfig();
                _validateConfiguredFeeRecipient(component.configuredRecipient);
            }
            totalBps += component.feeBps;
            previousId = component.componentId;
        }
        if (totalBps != cfg.baseFeeBps || !creatorFound || !platformFound || !referrerFound) {
            revert InvalidFeeConfig();
        }
    }

    function _validateConfiguredFeeRecipient(address configuredRecipient) internal view {
        if (
            configuredRecipient == address(0) || configuredRecipient == address(this) || configuredRecipient == factory
                || configuredRecipient == feeEscrow || configuredRecipient == address(poolManager)
        ) revert InvalidFeeConfig();
    }
}
