// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IFeeHook} from "./IFeeHook.sol";

/**
 * @title DynamicFeeHookV2
 * @notice Byte-for-byte identical to `DynamicFeeHook` (fee decay math, TWAP
 *         oracle, one-shot pool configuration) EXCEPT this version has no
 *         `PauseController` dependency at all — there is no code path
 *         anywhere in this contract that can halt, delay, or otherwise
 *         gate a swap. This mirrors Flaunch's architecture, where no
 *         owner/guardian can stop trading on a live pool.
 *
 *         V2 is an ADDITIVE deployment, not a migration: existing V1 pools
 *         (deployed against the original `DynamicFeeHook` + `PauseController`)
 *         are completely unaffected and keep behaving exactly as before.
 *         Only NEW launches choose to use V2.
 *
 *         See DynamicFeeHook.sol for the full design rationale of the fee
 *         decay and TWAP oracle mechanics, which are unchanged here.
 */
contract DynamicFeeHookV2 is IHooks, IFeeHook {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;
    using StateLibrary for IPoolManager;

    struct FeeConfig {
        uint32 startTimestamp;
        uint32 decayDuration; // seconds, 0 < duration <= 60 when anti-sniper enabled
        uint24 startFee; // pips, <= 900_000 (90%)
        uint24 endFee; // pips, one of 0 / 10_000 / 20_000 / 30_000
        bool configured;
    }

    /// @notice A running time-weighted price checkpoint for a pool.
    ///         `sqrtPriceCumulative` accumulates `sqrtPriceX96 * elapsedSeconds`
    ///         since the pool's very first recorded swap — the same
    ///         accumulator pattern Uniswap V2/V3 oracles use, including
    ///         relying on wraparound-safe (`unchecked`) arithmetic: only
    ///         the DIFFERENCE between two observations is ever read, and
    ///         that difference is correct modulo 2**256 even if the
    ///         accumulator itself has wrapped.
    struct Observation {
        uint32 timestamp;
        uint256 sqrtPriceCumulative;
    }

    /// @notice Minimum age (seconds) a checkpoint must have before its
    ///         paired-with-latest average is considered manipulation
    ///         resistant enough to use as a fee-conversion floor.
    uint32 public constant TWAP_WINDOW = 600; // 10 minutes

    IPoolManager public immutable poolManager;
    address public immutable factory;

    mapping(PoolId => FeeConfig) public configs;
    mapping(PoolId => Observation) public latestObservation;
    mapping(PoolId => Observation) public checkpointObservation;
    mapping(PoolId => Observation) public candidateObservation;
    mapping(PoolId => uint160) public lastSqrtPriceX96;

    event PoolConfigured(PoolId indexed id, uint24 startFee, uint24 endFee, uint32 decayDuration);

    error AlreadyConfigured();
    error BadConfig();
    error NotFactory();
    error NotPoolManager();
    error HookNotImplemented();

    constructor(IPoolManager _poolManager, address _factory) {
        poolManager = _poolManager;
        factory = _factory;
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /**
     * @notice One-shot pool configuration, factory-only, immutable after
     *         this call. If anti-sniper is disabled at launch, pass
     *         startFee == endFee and decayDuration == 0 so currentFee()
     *         always returns the flat creator fee.
     */
    function configurePool(PoolId id, uint24 startFee, uint24 endFee, uint32 decayDuration) external onlyFactory {
        if (configs[id].configured) revert AlreadyConfigured();
        if (endFee != 0 && endFee != 10_000 && endFee != 20_000 && endFee != 30_000) revert BadConfig();
        bool antiSniper = startFee != endFee || decayDuration != 0;
        if (antiSniper) {
            if (startFee > 900_000) revert BadConfig();
            if (decayDuration == 0 || decayDuration > 60) revert BadConfig();
        }

        configs[id] = FeeConfig({
            startTimestamp: uint32(block.timestamp),
            decayDuration: decayDuration,
            startFee: startFee,
            endFee: endFee,
            configured: true
        });

        emit PoolConfigured(id, startFee, endFee, decayDuration);
    }

    /// @notice Time-weighted average sqrtPriceX96 over a trailing window of
    ///         at least TWAP_WINDOW seconds, derived purely from this
    ///         pool's own swap history. Returns `available = false` until
    ///         the pool has accumulated enough swap history.
    function twapSqrtPriceX96(PoolId id) external view returns (uint160 avgSqrtPriceX96, bool available) {
        Observation memory latest = latestObservation[id];
        Observation memory ck = checkpointObservation[id];
        if (ck.timestamp == 0) {
            return (0, false); // no swap has ever touched this pool
        }
        uint32 nowTs = uint32(block.timestamp);
        if (nowTs == ck.timestamp) {
            return (0, false);
        }
        uint32 elapsed = nowTs - ck.timestamp;
        if (elapsed < TWAP_WINDOW) {
            return (0, false);
        }
        uint256 cumNow;
        uint256 diff;
        unchecked {
            cumNow = latest.sqrtPriceCumulative + uint256(lastSqrtPriceX96[id]) * (nowTs - latest.timestamp);
            diff = cumNow - ck.sqrtPriceCumulative;
        }
        avgSqrtPriceX96 = uint160(diff / elapsed);
        available = true;
    }

    /// @dev Called on every swap (after) to extend this pool's price
    ///      accumulator. Identical logic to DynamicFeeHook._recordObservation.
    function _recordObservation(PoolId id) internal {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        Observation memory latest = latestObservation[id];

        if (latest.timestamp == 0) {
            Observation memory seed = Observation({timestamp: uint32(block.timestamp), sqrtPriceCumulative: 0});
            latestObservation[id] = seed;
            checkpointObservation[id] = seed;
            candidateObservation[id] = seed;
            lastSqrtPriceX96[id] = sqrtPriceX96;
            return;
        }

        uint32 elapsed = uint32(block.timestamp) - latest.timestamp;
        if (elapsed == 0) {
            lastSqrtPriceX96[id] = sqrtPriceX96;
            return;
        }

        uint256 newCumulative;
        unchecked {
            newCumulative = latest.sqrtPriceCumulative + uint256(lastSqrtPriceX96[id]) * elapsed;
        }

        Observation memory newLatest = Observation({timestamp: uint32(block.timestamp), sqrtPriceCumulative: newCumulative});

        Observation memory cand = candidateObservation[id];
        if (uint32(block.timestamp) - cand.timestamp >= TWAP_WINDOW) {
            checkpointObservation[id] = cand;
            candidateObservation[id] = newLatest;
        }

        latestObservation[id] = newLatest;
        lastSqrtPriceX96[id] = sqrtPriceX96;
    }

    /// @notice Pure function of block.timestamp and stored config. Linear
    ///         decay from startFee to endFee over decayDuration seconds;
    ///         monotonically non-increasing over time for any single pool.
    function currentFee(PoolId id) public view returns (uint24) {
        FeeConfig memory c = configs[id];
        if (!c.configured) return 0;
        if (c.decayDuration == 0) return c.endFee;

        uint256 elapsed = block.timestamp - c.startTimestamp;
        if (elapsed >= c.decayDuration) return c.endFee;

        uint256 remaining = c.decayDuration - elapsed;
        int256 spread = int256(uint256(c.startFee)) - int256(uint256(c.endFee));
        int256 fee = int256(uint256(c.endFee)) + (spread * int256(remaining)) / int256(uint256(c.decayDuration));
        return uint24(uint256(fee));
    }

    // ------------------------------------------------------------------ //
    //  IHooks — only beforeSwap/afterSwap are reachable given this hook's  //
    //  address. NOTE: unlike DynamicFeeHook, beforeSwap has NO circuit     //
    //  breaker of any kind — nothing can revert a swap here except        //
    //  ordinary AMM conditions (e.g. slippage), by design.                //
    // ------------------------------------------------------------------ //

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        uint24 fee = currentFee(key.toId());
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
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

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
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

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        _recordObservation(key.toId());
        return (IHooks.afterSwap.selector, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
