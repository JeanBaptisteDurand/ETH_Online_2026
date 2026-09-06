// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

interface IBidWall {
    error CallerIsNotCreator();
    error NotPositionManager();

    /// Thrown when the ETH sent with `deposit` does not match the fee for a native-ETH pool (or
    /// when value is sent for an ERC20 pool / a zero-fee deposit)
    error IncorrectNativeDeposit();

    /// Thrown when `retryRetainedMemecoin` is called for a pool with nothing retained
    error NoRetainedMemecoin();

    /// Emitted when a BidWall receives a deposit
    event BidWallDeposit(PoolId indexed _poolId, uint _added, uint _pending);

    /// Emitted when the BidWall is repositioned under an updated tick, or with additional ETH
    event BidWallRepositioned(PoolId indexed _poolId, uint _eth, int24 _tickLower, int24 _tickUpper);

    /// Emitted when non-ETH tokens received are transferrer to the memecoin treasury
    event BidWallRewardsTransferred(PoolId indexed _poolId, address _recipient, uint _tokens);

    /// Emitted when a memecoin rewards push could not be delivered and the tokens were retained
    /// for a later attempt. `_tokens` is the full amount now retained for the pool.
    event BidWallRewardsRetained(PoolId indexed _poolId, address _recipient, uint _tokens);

    /// Emitted when no valid single-sided position exists at the current price, so the deposit is
    /// held as pending fees and retried on the next reposition rather than reverting the swap
    event BidWallRepositionDeferred(PoolId indexed _poolId, uint _pendingETHFees, int24 _currentTick);

    /// Emitted when the BidWall is closed
    event BidWallClosed(PoolId indexed _poolId, address _recipient, uint _eth);

    /// Emitted when the BidWall is disabled or enabled
    event BidWallDisabledStateUpdated(PoolId indexed _poolId, bool _disabled);

    /// Emitted when the `_swapFeeThreshold` is updated
    event FixedSwapFeeThresholdUpdated(uint _newSwapFeeThreshold);

    /// Emitted when the `staleTimeWindow` is updated
    event StaleTimeWindowUpdated(uint _staleTimeWindow);

    /**
     * Stores the BidWall information for a specific pool.
     *
     * @member disabled If the BidWall is disabled for the pool
     * @member initialized If the BidWall has been initialized
     * @member tickLower The current lower tick of the BidWall
     * @member tickUpper The current upper tick of the BidWall
     * @member pendingETHFees The amount of ETH fees waiting to be put into the BidWall until threshold is crossed
     * @member cumulativeSwapFees The total amount of swap fees accumulated for the pool
     */
    struct PoolInfo {
        bool disabled;
        bool initialized;
        int24 tickLower;
        int24 tickUpper;
        uint pendingETHFees;
        uint cumulativeSwapFees;
    }

    function poolInfo(
        PoolId _poolId
    )
        external
        view
        returns (bool disabled, bool initialized, int24 tickLower, int24 tickUpper, uint pendingETHFees, uint cumulativeSwapFees);

    function lastPoolTransaction(
        PoolId _poolId
    ) external view returns (uint);

    function staleTimeWindow() external view returns (uint);

    function isBidWallEnabled(
        PoolId _poolId
    ) external view returns (bool);

    function deposit(
        PoolKey memory _poolKey,
        uint _ethSwapAmount,
        int24 _currentTick,
        bool _nativeIsZero
    ) external payable;

    function checkStalePosition(
        PoolKey memory _poolKey,
        int24 _currentTick,
        bool _nativeIsZero
    ) external;

    function setDisabledState(
        PoolKey memory _key,
        bool _disable
    ) external;

    function closeBidWall(
        PoolKey memory _key
    ) external;

    function retainedMemecoin(
        PoolId _poolId
    ) external view returns (uint);

    function retryRetainedMemecoin(
        PoolKey memory _key
    ) external;

    function position(
        PoolId _poolId
    ) external view returns (uint amount0_, uint amount1_, uint pendingEth_);

    function setSwapFeeThreshold(
        uint swapFeeThreshold
    ) external;

    function setStaleTimeWindow(
        uint _staleTimeWindow
    ) external;
}
