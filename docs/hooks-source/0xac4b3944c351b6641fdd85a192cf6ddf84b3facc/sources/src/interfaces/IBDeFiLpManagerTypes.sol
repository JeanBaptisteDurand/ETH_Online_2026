// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolType, ExternalPoolType} from "@types/PoolInfo.sol";

/// @notice Shared events and errors for BDeFi LP manager contracts
interface IBDeFiLpManagerTypes {
    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/
    /// @notice One fee-fulfilment entry being relayed from one hook to another via
    /// `BDeFiLpManager.forwardToHookQueue`.
    struct FulfillmentForward {
        address receiver;
        uint256 amount;
        bool isLeaderboard;
        bool isGenesis;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/
    event PoolFunded(
        address indexed token,
        PoolId indexed poolId,
        PoolType poolType,
        uint256 ethAmount,
        uint256 parentTokenAmount,
        uint256 tokenAmount
    );

    event PoolInitialized(address indexed token, PoolId indexed poolId, PoolType poolType);
    event PoolIncreased(address indexed token, PoolId indexed poolId, PoolType poolType);
    event PoolRebalanced(address indexed token, PoolId indexed poolId, PoolType poolType);
    event InternalPoolAdded(address indexed token, address parentToken, PoolId indexed poolId, PoolType poolType);
    event ExternalPoolAdded(
        address indexed token,
        address parentToken,
        PoolId indexed poolId,
        ExternalPoolType poolType,
        address poolAddress
    );
    event ExternalPoolRemoved(address indexed token, PoolId indexed poolId, ExternalPoolType poolType);
    event PoolTradingFeesClaimed(
        address indexed token, PoolId indexed poolId, uint256 tokenFees, uint256 parentTokenFees
    );

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/
    error BDeFiLpManager__InsufficientPoolBalance(address token);
    error BDeFiLpManager__InvalidPool();
    error BDeFiLpManager__InvalidToken();
    error BDeFiLpManager__PoolIsInitialized();
    error BDeFiLpManager__PoolNotInitialized();
    error BDeFiLpManager__MinLaunchRequirementNotMet();
    error BDeFiLpManager__OpsModuleNotSet();
    error BDeFiLpManagerActions__OnlyDelegateCall();
}
