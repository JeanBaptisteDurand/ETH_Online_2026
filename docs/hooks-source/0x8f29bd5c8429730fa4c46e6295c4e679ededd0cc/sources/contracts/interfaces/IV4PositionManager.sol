// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

/// @notice this interface is common between the PositionManager and the LimitOrderManager
interface IV4PositionManager {
  /// @notice Executes a batch of limit-order actions while unlocking the pool manager.
  /// @param unlockData ABI-encoded `(bytes actions, bytes[] params)` payload understood by the action router.
  /// @param deadline Timestamp after which the call is no longer valid.
  function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;

  /// @notice Executes limit-order actions assuming the pool manager is already unlocked.
  /// @param actions Packed action identifiers.
  /// @param params ABI-encoded parameters aligned with each action.
  function modifyLiquiditiesWithoutUnlock(bytes calldata actions, bytes[] calldata params) external payable;
}
