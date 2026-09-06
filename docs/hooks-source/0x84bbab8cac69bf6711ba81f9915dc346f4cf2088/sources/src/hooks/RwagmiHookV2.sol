// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRwagmiHook} from "../interfaces/IRwagmiHook.sol";
import {IRwagmiHookV2} from "../interfaces/IRwagmiHookV2.sol";
import {IRwagmiMevModule} from "../interfaces/IRwagmiMevModule.sol";
import {RwagmiDynamicFee} from "./lib/RwagmiDynamicFee.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title RwagmiHookV2
/// @notice Launch hook with v1 initialization gating, mandatory launch-auction
///         support, and optional dynamic LP fee overrides.
contract RwagmiHookV2 is IHooks, IRwagmiHookV2 {
    using PoolIdLibrary for PoolKey;
    using RwagmiDynamicFee for RwagmiDynamicFee.State;
    using StateLibrary for IPoolManager;

    uint256 public constant MAX_MEV_MODULE_DELAY = 2 minutes;

    struct PoolData {
        bool dynamicFee;
        RwagmiDynamicFee.Config dynamicFeeConfig;
    }

    struct PoolState {
        bool b20IsCurrency0;
        bool dynamicFee;
        bool mevInitialized;
        bool mevDisabled;
        uint64 mevEnabledAt;
        int24 lastObservedTick;
    }

    IPoolManager private immutable _poolManager;
    address private immutable _launcher;

    mapping(PoolId => PoolInfo) private _poolInfo;
    mapping(PoolId => PoolState) private _poolState;
    mapping(PoolId => RwagmiDynamicFee.State) private _dynamicFeeState;

    error ZeroAddress();
    error MevPaymentRequiresExactInput();
    error MevPaymentCurrencyMismatch(address expected, address actual);
    error MevPaymentExceedsInput(uint256 payment, uint256 amountIn);
    error MevPaymentTooLarge(uint256 payment);

    constructor(IPoolManager poolManager_, address launcher_) {
        if (address(poolManager_) == address(0) || launcher_ == address(0)) revert ZeroAddress();
        _poolManager = poolManager_;
        _launcher = launcher_;
    }

    modifier onlyLauncher() {
        if (msg.sender != _launcher) revert OnlyLauncher();
        _;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(_poolManager)) revert OnlyPoolManager();
        _;
    }

    function poolManager() external view returns (IPoolManager) {
        return _poolManager;
    }

    function launcher() external view returns (address) {
        return _launcher;
    }

    function poolInfoForId(PoolId poolId) external view returns (PoolInfo memory) {
        return _poolInfo[poolId];
    }

    function poolStateForId(PoolId poolId) external view returns (PoolState memory) {
        return _poolState[poolId];
    }

    function initializePool(
        address token,
        address pairedToken,
        uint24 lpFee,
        int24 tickIfToken0IsB20,
        int24 tickSpacing,
        address locker,
        address mevModule,
        bytes calldata poolData
    ) external onlyLauncher returns (PoolKey memory key, PoolId poolId, int24 startingTick) {
        if (token == pairedToken) revert IdenticalCurrencies();

        PoolData memory mode = _decodePoolData(poolData);
        if (mode.dynamicFee) {
            lpFee = LPFeeLibrary.DYNAMIC_FEE_FLAG;
        }

        bool b20IsCurrency0 = uint160(token) < uint160(pairedToken);
        (Currency currency0, Currency currency1) = b20IsCurrency0
            ? (Currency.wrap(token), Currency.wrap(pairedToken))
            : (Currency.wrap(pairedToken), Currency.wrap(token));

        startingTick = b20IsCurrency0 ? tickIfToken0IsB20 : -tickIfToken0IsB20;

        key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(this))
        });
        poolId = key.toId();

        if (_poolInfo[poolId].initialized) revert PoolAlreadyInitialized();
        _poolInfo[poolId] = PoolInfo({
            token: token,
            pairedToken: pairedToken,
            locker: locker,
            mevModule: mevModule,
            initialized: true
        });
        _poolState[poolId] = PoolState({
            b20IsCurrency0: b20IsCurrency0,
            dynamicFee: mode.dynamicFee,
            mevInitialized: false,
            mevDisabled: mevModule == address(0),
            mevEnabledAt: 0,
            lastObservedTick: startingTick
        });
        if (mode.dynamicFee) {
            _dynamicFeeState[poolId].initialize(mode.dynamicFeeConfig, startingTick);
        }

        _poolManager.initialize(key, TickMath.getSqrtPriceAtTick(startingTick));

        emit PoolInitialized(poolId, token, pairedToken, locker, startingTick);
    }

    function initializeMevModule(PoolKey calldata poolKey, bytes calldata mevModuleData)
        external
        onlyLauncher
    {
        PoolId poolId = poolKey.toId();
        PoolInfo memory info = _poolInfo[poolId];
        if (!info.initialized) revert PoolNotInitialized();

        PoolState storage state = _poolState[poolId];
        if (state.mevInitialized) revert MevModuleAlreadyInitialized();
        state.mevInitialized = true;
        state.mevDisabled = info.mevModule == address(0);
        state.mevEnabledAt = uint64(block.timestamp);

        if (info.mevModule != address(0)) {
            IRwagmiMevModule(info.mevModule).initialize(poolKey, mevModuleData);
        }

        emit MevModuleInitialized(poolKey, info.mevModule);
    }

    // --- hook permissions ---

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function validateHookAddress() external view {
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    // --- IHooks callbacks ---

    function beforeInitialize(address sender, PoolKey calldata, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != address(this)) revert OnlyViaHook();
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        PoolInfo memory info = _poolInfo[poolId];
        if (!info.initialized) revert PoolNotInitialized();
        PoolState storage state = _poolState[poolId];

        uint24 feeOverride = 0;
        if (state.dynamicFee) {
            (, int24 observedTick,,) = _poolManager.getSlot0(poolId);
            state.lastObservedTick = observedTick;
            feeOverride =
                _dynamicFeeState[poolId].compute(observedTick) | LPFeeLibrary.OVERRIDE_FEE_FLAG;
        }

        BeforeSwapDelta mevDelta = _runMevModule(sender, key, params, hookData, info, state);

        return (IHooks.beforeSwap.selector, mevDelta, feeOverride);
    }

    function _runMevModule(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData,
        PoolInfo memory info,
        PoolState storage state
    ) private returns (BeforeSwapDelta mevDelta) {
        if (state.mevDisabled || !state.mevInitialized || info.mevModule == address(0)) {
            return BeforeSwapDeltaLibrary.ZERO_DELTA;
        }

        if (block.timestamp > uint256(state.mevEnabledAt) + MAX_MEV_MODULE_DELAY) {
            state.mevDisabled = true;
            emit MevModuleDisabled(key, info.mevModule);
            return BeforeSwapDeltaLibrary.ZERO_DELTA;
        }

        state.mevDisabled = true;
        IRwagmiMevModule mevModule = IRwagmiMevModule(info.mevModule);
        (bool disable, address paymentCurrency, uint256 paymentAmount) =
            mevModule.beforeSwap(sender, key, params, state.b20IsCurrency0, hookData);
        if (disable) {
            emit MevModuleDisabled(key, info.mevModule);
        } else {
            state.mevDisabled = false;
        }
        if (paymentAmount == 0) return BeforeSwapDeltaLibrary.ZERO_DELTA;

        return _takeMevPayment(key, params, info.locker, paymentCurrency, paymentAmount);
    }

    function _takeMevPayment(
        PoolKey calldata key,
        SwapParams calldata params,
        address recipient,
        address paymentCurrency,
        uint256 paymentAmount
    ) private returns (BeforeSwapDelta) {
        if (params.amountSpecified >= 0) {
            revert MevPaymentRequiresExactInput();
        }

        Currency specifiedCurrency = params.zeroForOne ? key.currency0 : key.currency1;
        address actualCurrency = Currency.unwrap(specifiedCurrency);
        if (actualCurrency != paymentCurrency) {
            revert MevPaymentCurrencyMismatch(paymentCurrency, actualCurrency);
        }

        uint256 amountIn = uint256(-params.amountSpecified);
        if (paymentAmount >= amountIn) revert MevPaymentExceedsInput(paymentAmount, amountIn);

        _poolManager.take(specifiedCurrency, recipient, paymentAmount);
        return toBeforeSwapDelta(_toPositiveInt128(paymentAmount), 0);
    }

    function _toPositiveInt128(uint256 value) private pure returns (int128) {
        if (value > type(uint128).max / 2) revert MevPaymentTooLarge(value);
        return int128(uint128(value));
    }

    function _decodePoolData(bytes calldata data) private pure returns (PoolData memory poolData) {
        if (data.length == 0) return poolData;
        poolData = abi.decode(data, (PoolData));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IRwagmiHookV2).interfaceId
            || interfaceId == type(IRwagmiHook).interfaceId
            || interfaceId == type(IERC165).interfaceId;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
