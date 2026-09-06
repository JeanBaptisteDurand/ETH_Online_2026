// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/hooks/ClankerHookV2.sol
// ZNS Launchpad — MATERIALLY MODIFIED base hook. Changes vs upstream:
//  - PROTOCOL FEE REMOVED (v2): PROTOCOL_FEE_FIXED is 0 — revenue is the 20% treasury slot of the
//    LP-fee split, not a separate protocol fee. The 4-case beforeSwap/afterSwap skim is guarded so it
//    is a true no-op at fee=0 (beforeSwap returns a zero delta; afterSwap leaves the delta untouched).
//  - POOL-EXTENSION SUBSYSTEM REMOVED entirely (allowlist, _runPoolExtension*, extension init/swap hooks).
//  - 3-arg constructor (poolManager, factory, weth); re-adds Ownable.
//  - TWAP observation buffer REMOVED (v2): it only existed to feed the now-deleted buyback.
//  Internal fee/tick identifiers (clankerIsToken0/tickIfToken0IsClanker) kept verbatim (open-decision #1).
//  NOTE: getHookPermissions, constructor arity, and inheritance list are FROZEN pre-mining (Step 14).
pragma solidity ^0.8.26;

import {IZNSLpLocker} from "../interfaces/IZNSLpLocker.sol";
import {IZNSMevModule} from "../interfaces/IZNSMevModule.sol";
import {IZNSHook} from "./interfaces/IZNSHook.sol";
import {IZNSHookV2} from "./interfaces/IZNSHookV2.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks, IHooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta, sub, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";

abstract contract ZnsHook is BaseHook, Ownable, IZNSHookV2 {
    using TickMath for int24;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;
    using StateLibrary for *;

    uint24 public constant MAX_LP_FEE = 100_000; // LP fee capped at 10%
    uint24 public constant MAX_MEV_LP_FEE = 800_000; // Max MEV LP fee at 80%
    int128 public constant FEE_DENOMINATOR = 1_000_000; // Uniswap 100% fee

    // ZNS v2: protocol fee REMOVED — revenue is the 20% treasury slot of the LP-fee split.
    uint24 public constant PROTOCOL_FEE_FIXED = 0;

    uint24 public protocolFee;

    address public immutable factory;
    address public immutable weth;

    mapping(PoolId => bool) public clankerIsToken0;
    mapping(PoolId => address) public locker;

    // mev module pool variables
    uint256 public constant MAX_MEV_MODULE_DELAY = 2 minutes;
    mapping(PoolId => address) public mevModule;
    mapping(PoolId => bool) public mevModuleEnabled;
    mapping(PoolId => uint256) public poolCreationTimestamp;

    // poolData/swapData encodings (reduced after pool-extension removal)
    struct PoolInitializationData {
        bytes feeData;
    }

    struct PoolSwapData {
        bytes mevModuleSwapData;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) {
            revert OnlyFactory();
        }
        _;
    }

    constructor(address _poolManager, address _factory, address _weth)
        BaseHook(IPoolManager(_poolManager))
        Ownable(msg.sender)
    {
        factory = _factory;
        weth = _weth;
    }

    // function for inheriting hooks to set fees in _beforeSwap hook
    function _setFee(PoolKey calldata poolKey, IPoolManager.SwapParams calldata swapParams)
        internal
        virtual
    {
        return;
    }

    // ZNS: protocol fee is FIXED (decoupled). Both _setFee and mevModuleSetFee route through here, so the
    // MEV-window LP fee never inflates the protocol fee. Arg intentionally ignored.
    function _setProtocolFee(uint24) internal virtual {
        protocolFee = PROTOCOL_FEE_FIXED;
    }

    // function for inheriting hooks to set process data during initialization flow
    function _initializeFeeData(PoolKey memory poolKey, bytes memory feeData) internal virtual {
        return;
    }

    // function for the factory to initialize a pool
    function initializePool(
        address clanker,
        address pairedToken,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        address _locker,
        address _mevModule,
        bytes calldata poolData
    ) public onlyFactory returns (PoolKey memory) {
        // initialize the pool
        PoolKey memory poolKey =
            _initializePool(clanker, pairedToken, tickIfToken0IsClanker, tickSpacing, poolData);

        // set the locker config
        locker[poolKey.toId()] = _locker;

        // set the mev module
        mevModule[poolKey.toId()] = _mevModule;

        emit PoolCreatedFactory({
            pairedToken: pairedToken,
            clanker: clanker,
            poolId: poolKey.toId(),
            tickIfToken0IsClanker: tickIfToken0IsClanker,
            tickSpacing: tickSpacing,
            locker: _locker,
            mevModule: _mevModule
        });

        return poolKey;
    }

    // function to let anyone initialize a pool (no lp-locker auto-claim or mev module)
    function initializePoolOpen(
        address clanker,
        address pairedToken,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        bytes calldata poolData
    ) public returns (PoolKey memory) {
        // weth should not be the clanker token: our hook fee only collects on the paired token
        if (clanker == weth) {
            revert WethCannotBeClanker();
        }

        PoolKey memory poolKey =
            _initializePool(clanker, pairedToken, tickIfToken0IsClanker, tickSpacing, poolData);

        emit PoolCreatedOpen(
            pairedToken, clanker, poolKey.toId(), tickIfToken0IsClanker, tickSpacing
        );

        return poolKey;
    }

    // common actions for initializing a pool
    function _initializePool(
        address clanker,
        address pairedToken,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        bytes calldata poolData
    ) internal virtual returns (PoolKey memory) {
        // ensure that the pool is not an ETH pool
        if (pairedToken == address(0) || clanker == address(0)) {
            revert ETHPoolNotAllowed();
        }

        // determine if clanker is token0
        bool token0IsClanker = clanker < pairedToken;

        // create the pool key
        PoolKey memory _poolKey = PoolKey({
            currency0: Currency.wrap(token0IsClanker ? clanker : pairedToken),
            currency1: Currency.wrap(token0IsClanker ? pairedToken : clanker),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(this))
        });

        // Set the storage helpers
        clankerIsToken0[_poolKey.toId()] = token0IsClanker;

        // initialize the pool
        int24 startingTick = token0IsClanker ? tickIfToken0IsClanker : -tickIfToken0IsClanker;
        uint160 initialPrice = startingTick.getSqrtPriceAtTick();
        poolManager.initialize(_poolKey, initialPrice);

        // set the pool creation timestamp
        poolCreationTimestamp[_poolKey.toId()] = block.timestamp;

        // decode the pool data and initialize fee data
        PoolInitializationData memory poolInitializationData =
            abi.decode(poolData, (PoolInitializationData));
        _initializeFeeData(_poolKey, poolInitializationData.feeData);

        return _poolKey;
    }

    // enable the mev module once the pool's deployment is complete
    function initializeMevModule(PoolKey calldata poolKey, bytes calldata mevModuleData)
        external
        onlyFactory
    {
        // initialize the mev module
        IZNSMevModule(mevModule[poolKey.toId()]).initialize(poolKey, mevModuleData);

        // enable the mev module
        mevModuleEnabled[poolKey.toId()] = true;
    }

    // checks if a mev module is operational and turns it off if needed
    function mevModuleOperational(PoolId poolId) public returns (bool) {
        if (!mevModuleEnabled[poolId]) {
            return false;
        } else if (block.timestamp >= poolCreationTimestamp[poolId] + MAX_MEV_MODULE_DELAY) {
            // mev module has expired
            mevModuleEnabled[poolId] = false;
            emit MevModuleDisabled(poolId);
            return false;
        }

        // mev module is operational
        return true;
    }

    // function to allow the mev module to change the fee for a swap
    function mevModuleSetFee(PoolKey calldata poolKey, uint24 fee) external {
        // only the assigned mev module for a poolkey can update the fee
        if (mevModule[poolKey.toId()] != msg.sender) {
            revert Unauthorized();
        }

        // skip if the mev module is not operational
        if (!mevModuleOperational(poolKey.toId())) {
            return;
        }

        // skip if the mev module is trying to set the fee higher than the max MEV fee
        if (fee > MAX_MEV_LP_FEE) {
            return;
        }

        // only update if the requested fee is higher than the pool's normal fee behavior
        (,,, uint24 currentLpFee) = StateLibrary.getSlot0(poolManager, poolKey.toId());
        if (fee <= currentLpFee) {
            return;
        }

        // update the LP fee for the swap; protocol fee stays FIXED (decoupled override)
        IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);
        _setProtocolFee(fee);

        emit MevModuleSetFee(poolKey.toId(), fee);
    }

    function _runMevModule(
        PoolKey calldata poolKey,
        IPoolManager.SwapParams calldata swapParams,
        bytes calldata swapData
    ) internal {
        if (mevModuleOperational(poolKey.toId())) {
            // decode the swap data for the mev module
            PoolSwapData memory poolSwapData;
            if (swapData.length > 0) {
                poolSwapData = abi.decode(swapData, (PoolSwapData));
            } else {
                poolSwapData = PoolSwapData({mevModuleSwapData: new bytes(0)});
            }

            // if the mev module is enabled call it
            bool disableMevModule = IZNSMevModule(mevModule[poolKey.toId()]).beforeSwap(
                poolKey, swapParams, clankerIsToken0[poolKey.toId()], poolSwapData.mevModuleSwapData
            );

            // disable the mevModule if the module requests it
            if (disableMevModule) {
                mevModuleEnabled[poolKey.toId()] = false;
                emit MevModuleDisabled(poolKey.toId());
            }
        }
    }

    function _lpLockerFeeClaim(PoolKey calldata poolKey) internal {
        // if this wasn't initialized to claim fees, skip the claim
        if (locker[poolKey.toId()] == address(0)) {
            return;
        }

        // determine the token
        address token = clankerIsToken0[poolKey.toId()]
            ? Currency.unwrap(poolKey.currency0)
            : Currency.unwrap(poolKey.currency1);

        // trigger the fee claim
        IZNSLpLocker(locker[poolKey.toId()]).collectRewardsWithoutUnlock(token);
    }

    function _hookFeeClaim(PoolKey calldata poolKey) internal {
        // determine the fee token
        Currency feeCurrency =
            clankerIsToken0[poolKey.toId()] ? poolKey.currency1 : poolKey.currency0;

        // get the fees stored from the previous swap in the pool manager
        uint256 fee = poolManager.balanceOf(address(this), feeCurrency.toId());

        if (fee == 0) {
            return;
        }

        // burn the fee
        poolManager.burn(address(this), feeCurrency.toId(), fee);

        // take the fee
        poolManager.take(feeCurrency, factory, fee);

        emit ClaimProtocolFees(Currency.unwrap(feeCurrency), fee);
    }

    function _beforeSwap(
        address,
        PoolKey calldata poolKey,
        IPoolManager.SwapParams calldata swapParams,
        bytes calldata swapData
    ) internal virtual override returns (bytes4, BeforeSwapDelta delta, uint24) {
        // set the fee for this swap
        _setFee(poolKey, swapParams);

        // trigger hook fee claim
        _hookFeeClaim(poolKey);

        // trigger the LP locker fee claim
        _lpLockerFeeClaim(poolKey);

        // run the mev module, can update the fee for the swap
        _runMevModule(poolKey, swapParams, swapData);

        // variables to determine how to collect protocol fee
        bool token0IsClanker = clankerIsToken0[poolKey.toId()];
        bool swappingForClanker = swapParams.zeroForOne != token0IsClanker;
        bool isExactInput = swapParams.amountSpecified < 0;

        // ZNS v2: protocol fee is 0, so the skim is a true no-op — beforeSwap returns a zero delta.
        if (protocolFee != 0) {
            // case: specified amount paired in, unspecified amount clanker out
            if (isExactInput && swappingForClanker) {
                uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee);
                int128 fee = int128(swapParams.amountSpecified * -int128(scaledProtocolFee) / 1e18);

                delta = toBeforeSwapDelta(fee, 0);
                poolManager.mint(
                    address(this),
                    token0IsClanker ? poolKey.currency1.toId() : poolKey.currency0.toId(),
                    uint256(int256(fee))
                );
            }

            // case: specified amount paired out, unspecified amount clanker in
            if (!isExactInput && !swappingForClanker) {
                uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 - protocolFee);
                int128 fee = int128(swapParams.amountSpecified * int128(scaledProtocolFee) / 1e18);
                delta = toBeforeSwapDelta(fee, 0);

                poolManager.mint(
                    address(this),
                    token0IsClanker ? poolKey.currency1.toId() : poolKey.currency0.toId(),
                    uint256(int256(fee))
                );
            }
        }

        return (BaseHook.beforeSwap.selector, delta, 0);
    }

    function _afterSwap(
        address,
        PoolKey calldata poolKey,
        IPoolManager.SwapParams calldata swapParams,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128 unspecifiedDelta) {
        // variables to determine how to collect protocol fee
        bool token0IsClanker = clankerIsToken0[poolKey.toId()];
        bool swappingForClanker = swapParams.zeroForOne != token0IsClanker;
        bool isExactInput = swapParams.amountSpecified < 0;

        // ZNS v2: protocol fee is 0, so afterSwap leaves the delta untouched (true no-op).
        if (protocolFee != 0) {
            // case: specified amount clanker in, unspecified amount paired out
            if (isExactInput && !swappingForClanker) {
                int128 amountOut = token0IsClanker ? delta.amount1() : delta.amount0();
                unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR;
                poolManager.mint(
                    address(this),
                    token0IsClanker ? poolKey.currency1.toId() : poolKey.currency0.toId(),
                    uint256(int256(unspecifiedDelta))
                );

                if (delta.amount0() > 0) {
                    delta = sub(delta, toBalanceDelta(unspecifiedDelta, 0));
                } else {
                    delta = sub(delta, toBalanceDelta(0, unspecifiedDelta));
                }
            }

            // case: specified amount clanker out, unspecified amount paired in
            if (!isExactInput && swappingForClanker) {
                int128 amountIn = token0IsClanker ? delta.amount1() : delta.amount0();
                unspecifiedDelta = amountIn * -int24(protocolFee) / FEE_DENOMINATOR;
                poolManager.mint(
                    address(this),
                    token0IsClanker ? poolKey.currency1.toId() : poolKey.currency0.toId(),
                    uint256(int256(unspecifiedDelta))
                );

                if (delta.amount0() < 0) {
                    delta = sub(delta, toBalanceDelta(unspecifiedDelta, 0));
                } else {
                    delta = sub(delta, toBalanceDelta(0, unspecifiedDelta));
                }
            }

            // adjust deltas when the protocol fee was taken in beforeSwap
            if (isExactInput && swappingForClanker || !isExactInput && !swappingForClanker) {
                if (clankerIsToken0[poolKey.toId()]) {
                    delta = toBalanceDelta(delta.amount0(), int128(swapParams.amountSpecified));
                } else {
                    delta = toBalanceDelta(int128(swapParams.amountSpecified), delta.amount1());
                }
            }
        }

        return (BaseHook.afterSwap.selector, unspecifiedDelta);
    }

    // prevent initializations that don't start via our initializePool functions
    function _beforeInitialize(address, PoolKey calldata, uint160)
        internal
        virtual
        override
        returns (bytes4)
    {
        revert UnsupportedInitializePath();
    }

    // prevent liquidity adds during mev module operation
    function _beforeAddLiquidity(
        address,
        PoolKey calldata poolKey,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal virtual override returns (bytes4) {
        if (mevModuleOperational(poolKey.toId())) {
            revert MevModuleEnabled();
        }

        return BaseHook.beforeAddLiquidity.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IZNSHook).interfaceId
            || interfaceId == type(IZNSHookV2).interfaceId;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
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
}
