// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/types/BeforeSwapDelta.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/types/BalanceDelta.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {SeatFeeLib} from "./SeatFeeLib.sol";

interface ISeatWethHookToken {
    function isLaunched() external view returns (bool);
}

interface IERC20WethHook {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title SeatWethHook
/// @notice The only authorized trading pool: SEAT/WETH. It preserves
/// the 3% economic carve in WETH, leaves conversion outside swap callbacks,
/// and exposes three destination-locked pots with no arbitrary sweep. Any
/// router/aggregator may swap against this pool — the fee is a permanent
/// flat 3% for everyone, so there is nothing to gate by caller identity.
contract SeatWethHook {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;

    uint160 internal constant FLAGS = 0x30CC;

    address public immutable poolManager;
    address public immutable weth;
    ISeatWethHookToken public immutable seat;

    address public owner;
    address public creator;
    address public reflectionSink;
    address public lpSink;
    bool public sinksSealed;
    bool public paused;

    PoolId public registeredPool;
    bool public poolRegistered;
    bool public wethIsCurrency0;

    uint256 public reflectionPot;
    uint256 public lpPot;
    uint256 private _lock = 1;

    event PoolRegistered(PoolId indexed poolId, bool wethIsCurrency0);
    event SinksSealed(address indexed reflections, address indexed lp, address creator);
    event FeeTaken(
        PoolId indexed poolId, uint256 feeBps, uint256 total, uint256 toReflections, uint256 toLp, uint256 toCreator
    );
    event PotPulled(uint8 indexed pot, address indexed sink, uint256 amount);
    event Paused(bool paused);

    error NotPoolManager();
    error NotOwner();
    error NotSink();
    error BadHookAddress();
    error NotDynamicFee();
    error PoolNotRegistered();
    error PoolAlreadyRegistered();
    error InvalidPool();
    error TradingNotOpen();
    error FeeOverflow();
    error AlreadySealed();
    error NotSealed();
    error Paused_();
    error ZeroAddress();
    error InsufficientPot();
    error Reentrancy();
    error TokenTransferFailed();

    modifier onlyPoolManager() {
        if (msg.sender != poolManager) revert NotPoolManager();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address poolManager_, address seat_, address weth_, address owner_) {
        if (uint160(address(this)) & 0x3FFF != FLAGS) revert BadHookAddress();
        if (poolManager_ == address(0) || seat_ == address(0) || weth_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        poolManager = poolManager_;
        seat = ISeatWethHookToken(seat_);
        weth = weth_;
        owner = owner_;
    }

    // ── one-time configuration ──────────────────────────────────────

    function registerPool(PoolKey calldata key) external onlyOwner {
        if (poolRegistered) revert PoolAlreadyRegistered();
        if (key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert NotDynamicFee();
        if (address(key.hooks) != address(this)) revert InvalidPool();

        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        address token = address(seat);
        bool valid = (currency0 == weth && currency1 == token) || (currency0 == token && currency1 == weth);
        if (!valid) revert InvalidPool();

        registeredPool = key.toId();
        wethIsCurrency0 = currency0 == weth;
        poolRegistered = true;
        emit PoolRegistered(registeredPool, wethIsCurrency0);
    }

    function configureAndSealSinks(address reflectionSink_, address lpSink_, address creator_) external onlyOwner {
        if (sinksSealed) revert AlreadySealed();
        if (reflectionSink_ == address(0) || lpSink_ == address(0) || creator_ == address(0)) {
            revert ZeroAddress();
        }
        reflectionSink = reflectionSink_;
        lpSink = lpSink_;
        creator = creator_;
        sinksSealed = true;
        emit SinksSealed(reflectionSink_, lpSink_, creator_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ── hook entrypoints ────────────────────────────────────────────

    function beforeInitialize(address, PoolKey calldata key, uint160) external view onlyPoolManager returns (bytes4) {
        _requirePool(key);
        if (key.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG) revert NotDynamicFee();
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata key, uint160, int24)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        _requirePool(key);
        return IHooks.afterInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _requireLivePool(key);
        uint24 lpOverride = LPFeeLibrary.OVERRIDE_FEE_FLAG;

        if (!_wethIsSpecified(params)) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, lpOverride);
        }

        uint256 specified =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        uint256 total = _skimForSwap(key, params, specified);
        if (total == 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, lpOverride);
        }
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(_toInt128(total), 0), lpOverride);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        _requireLivePool(key);
        if (_wethIsSpecified(params)) return (IHooks.afterSwap.selector, 0);

        int128 wethDelta = wethIsCurrency0 ? delta.amount0() : delta.amount1();
        uint256 absoluteWeth = wethDelta < 0 ? uint256(uint128(-wethDelta)) : uint256(uint128(wethDelta));
        uint256 total = _skimForSwap(key, params, absoluteWeth);
        if (total == 0) return (IHooks.afterSwap.selector, 0);
        return (IHooks.afterSwap.selector, _toInt128(total));
    }

    // ── WETH fee accounting ─────────────────────────────────────────

    function _skimForSwap(PoolKey calldata key, SwapParams calldata params, uint256 wethAmount)
        internal
        returns (uint256)
    {
        bool feeOnGross = params.amountSpecified < 0;
        return _skim(key.toId(), key, wethAmount, feeOnGross);
    }

    function _skim(PoolId id, PoolKey calldata key, uint256 wethAmount, bool feeOnGross)
        internal
        returns (uint256 total)
    {
        total = feeOnGross
            ? SeatFeeLib.feeFromGross(wethAmount, SeatFeeLib.FLOOR_FEE_BPS)
            : SeatFeeLib.feeFromNet(wethAmount, SeatFeeLib.FLOOR_FEE_BPS);
        if (total == 0) return 0;

        (uint256 toReflections, uint256 toLp, uint256 toCreator) = SeatFeeLib.carve(total);

        uint256 retained = toReflections + toLp;
        Currency wethCurrency = wethIsCurrency0 ? key.currency0 : key.currency1;
        if (retained != 0) {
            IPoolManager(poolManager).take(wethCurrency, address(this), retained);
            reflectionPot += toReflections;
            lpPot += toLp;
        }
        if (toCreator != 0) {
            IPoolManager(poolManager).take(wethCurrency, creator, toCreator);
        }

        emit FeeTaken(id, SeatFeeLib.FLOOR_FEE_BPS, total, toReflections, toLp, toCreator);
    }

    function pullReflections(uint256 amount) external nonReentrant {
        if (msg.sender != reflectionSink) revert NotSink();
        if (reflectionPot < amount) revert InsufficientPot();
        reflectionPot -= amount;
        _safeTransferWeth(msg.sender, amount);
        emit PotPulled(0, msg.sender, amount);
    }

    function pullLp(uint256 amount) external nonReentrant {
        if (msg.sender != lpSink) revert NotSink();
        if (lpPot < amount) revert InsufficientPot();
        lpPot -= amount;
        _safeTransferWeth(msg.sender, amount);
        emit PotPulled(1, msg.sender, amount);
    }

    // ── views / helpers ─────────────────────────────────────────────

    function _requirePool(PoolKey calldata key) internal view {
        if (!poolRegistered || PoolId.unwrap(key.toId()) != PoolId.unwrap(registeredPool)) {
            revert PoolNotRegistered();
        }
    }

    function _requireLivePool(PoolKey calldata key) internal view {
        _requirePool(key);
        if (!sinksSealed) revert NotSealed();
        if (paused) revert Paused_();
        if (!seat.isLaunched()) revert TradingNotOpen();
    }

    function _wethIsSpecified(SwapParams calldata params) internal view returns (bool) {
        bool exactIn = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = exactIn ? params.zeroForOne : !params.zeroForOne;
        return specifiedIsCurrency0 == wethIsCurrency0;
    }

    function _toInt128(uint256 value) internal pure returns (int128) {
        if (value > uint128(type(int128).max)) revert FeeOverflow();
        return int128(uint128(value));
    }

    function _safeTransferWeth(address to, uint256 amount) internal {
        (bool ok, bytes memory data) = weth.call(abi.encodeCall(IERC20WethHook.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
