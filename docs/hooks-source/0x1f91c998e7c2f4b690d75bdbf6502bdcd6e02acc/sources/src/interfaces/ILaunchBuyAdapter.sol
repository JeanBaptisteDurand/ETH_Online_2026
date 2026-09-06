// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

/// @title ILaunchBuyAdapter
/// @notice Common immutable wiring and execution surface for one atomic launch-buy router binding.
interface ILaunchBuyAdapter {
    struct LaunchBuyRequest {
        address originalCreator;
        address launchToken;
        address quoteToken;
        PoolKey poolKey;
        address fundingToken;
        uint256 amountIn;
        uint256 minAmountOut;
        uint64 deadline;
        bytes routeData;
    }

    function factory() external view returns (address launchFactory);
    function launchHook() external view returns (address hookAddress);
    function poolManager() external view returns (address manager);
    function router() external view returns (address underlyingRouter);
    function swapCaller() external view returns (address callbackCaller);

    function executeLaunchBuy(LaunchBuyRequest calldata request) external payable returns (uint256 amountOut);
}
