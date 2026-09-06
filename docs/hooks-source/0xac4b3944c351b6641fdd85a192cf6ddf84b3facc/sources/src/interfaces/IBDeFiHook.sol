// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {ITruncatedGeoOracle} from "./external/ITruncatedGeoOracle.sol";
import {IBDeFiLpManagerTypes} from "./IBDeFiLpManagerTypes.sol";

/// @title IBDeFiHook
/// @notice Interface for hook-based fee fulfillment and tax processing.
interface IBDeFiHook is ITruncatedGeoOracle {
    /*//////////////////////////////////////////////////////////////
                              STRUCTS
    //////////////////////////////////////////////////////////////*/
    /// @notice Queue item describing pending fee fulfillment entry.
    struct FeesQueueItem {
        /// @notice Fee amount
        uint256 amount;
        /// @notice Receiver associated with this fee entry
        address receiver;
        /// @notice True if entry belongs to leaderboard accounting
        bool isLeaderboard;
    }

    /// @notice Per-swap memory buffer for fulfilment entries destined for another hook,
    /// relayed as one batch after settlement. Empty `items` means same-hook processing.
    struct ForwardBuffer {
        address hook;
        uint256 count;
        uint256 total;
        IBDeFiLpManagerTypes.FulfillmentForward[] items;
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when fulfillment queue/genesis fees are fulfilled for a token.
    /// @param token Token address
    /// @param amount Fulfilled token amount
    event FeesFulfilled(address indexed token, uint256 amount);

    /// @notice Emitted when genesis-held fees are fulfilled for a token.
    /// @param token Token address
    /// @param amount Fulfilled token amount
    event GenesisFeesFulfilled(address indexed token, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when operator reimbursement exceeds configured max.
    /// @param maxReimbursement Maximum allowed reimbursement
    error BDeFiHook__MaxReimbursementExceeded(uint256 maxReimbursement);

    /// @notice Thrown when fulfillment accounting does not match requested amount.
    error BDeFiHook__InvalidFulfillmentAmount();

    /// @notice Thrown when a fulfilment entry is queued for an asset that has no fulfilment path.
    error BDeFiHook__InvalidFulfillmentToken();

    /// @notice Thrown when trading is attempted before token LP setup is fully initialized.
    error BDeFiHook__TokenNotFullyInitialized();

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Are all LPs for the token initialized
    function fullyInitialized(address token) external view returns (bool);

    /// @notice Last trade timestamps per token
    function lastTradedTs(address token) external view returns (uint256);

    /// @notice Total fees available for the protocol genesis (per token)
    function genesisFulfillmentAmounts(address token) external view returns (uint256);

    /// @notice Claimable ETH per receiver (when queue item is not for leaderboard)
    function claimableEth(address receiver) external view returns (uint256);

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Claims accumulated ETH fees for caller.
    function claimFees() external;

    /// @notice Pushes a receiver's accumulated ETH fees to that receiver.
    /// @dev Permissionless — funds only ever move to their owner.
    /// @param receiver Address whose claimable balance is paid out
    function claimFeesFor(address receiver) external;

    /*//////////////////////////////////////////////////////////////
                           OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Processes external token fulfillment by swapping token to ETH and distributing proceeds.
    /// @param token External token address to swap
    /// @param fulfilmentAmount Token amount to fulfill
    /// @param reimbursement ETH reimbursement for operator execution
    /// @param minAmountOutV4 Minimum output for V4 route
    /// @param minAmountOutV3 Minimum output for V3 route
    /// @param deadline Swap deadline timestamp
    function processExternalToken(
        address token,
        uint256 fulfilmentAmount,
        uint256 reimbursement,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 deadline
    ) external;

    /*//////////////////////////////////////////////////////////////
                           PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Updates last traded timestamp for token (used by CTO logic).
    /// @param token Token address
    function updateLastTradedTimestamp(address token) external;

    /// @notice Adds fee amount into fulfillment accounting for a token.
    /// @param token Token address whose fees are being queued/accounted
    /// @param receiver Receiver associated with this fee entry
    /// @param amount Fee amount to add
    /// @param isForLeaderboard True if amount belongs to leaderboard accounting
    /// @param isForGenesis True if amount should accrue to genesis instead of queue
    function addToFulfillmentQueue(
        address token,
        address receiver,
        uint256 amount,
        bool isForLeaderboard,
        bool isForGenesis
    ) external;

    /// @notice Pulls ETH from hook balance to leaderboard contract.
    /// @param amount ETH amount to transfer
    function pullEth(uint256 amount) external;

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Claims fees allocated to protocol genesis.
    /// @param token Token address to claim
    function claimGenesis(address token) external;

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns token fulfillment amount currently processable for a token.
    /// @param token Token address
    /// @return totalAmount Sum of genesis amount and queue amount up to processing limit
    function getTokenFulfillmentAmount(address token) external view returns (uint256 totalAmount);

    /// @notice Returns fulfillment queue snapshot for a token.
    /// @param token Token address
    /// @return queue Fulfillment queue entries
    function getTokenFulfillmentQueue(address token) external view returns (FeesQueueItem[] memory);

    /// @notice Returns configured hook operator address.
    /// @return hookOperator Operator address for hook operations
    function operator() external view returns (address);
}
