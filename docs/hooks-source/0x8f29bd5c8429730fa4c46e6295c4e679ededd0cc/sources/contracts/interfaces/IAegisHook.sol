// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import { IDynamicFeeManager } from "./dfm/IDynamicFeeManager.sol";
import { IAegisEngine } from "./IAegisEngine.sol";
import { IOracleManager } from "./IOracleManager.sol";
import { ILimitOrderManager } from "./ILimitOrderManager.sol";

/// @title IAegisHook
/// @notice Uniswap V4 hook interface for Aegis protocol with dynamic fees, oracle integration, and automatic fee reinvestment
/// @dev Extends IHooks with additional functionality for fee management and oracle coordination
interface IAegisHook is IHooks {
  // - - - Events - - -

  /// @notice Emitted when hook fees are collected from a swap
  /// @param poolId The pool identifier where the fee was collected
  /// @param sender The address that initiated the swap
  /// @param feeAmount0 The amount of currency0 collected as hook fee
  /// @param feeAmount1 The amount of currency1 collected as hook fee
  event HookFee(PoolId indexed poolId, address indexed sender, uint128 feeAmount0, uint128 feeAmount1);

  /// @notice Emitted when accumulated hook fees are reinvested into the pool as liquidity
  /// @param poolId The pool identifier where fees were reinvested
  /// @param sender The address that triggered the reinvestment (typically address(0) for automatic reinvestment)
  /// @param feeAmount0 The amount of currency0 reinvested
  /// @param feeAmount1 The amount of currency1 reinvested
  event HookFeeReinvested(PoolId indexed poolId, address indexed sender, uint128 feeAmount0, uint128 feeAmount1);

  /// @notice Emitted when the hook fee percentage is updated for a pool
  /// @param poolId The pool identifier
  /// @param hookFeePpm The new hook fee in parts per million
  event HookFeePpmUpdated(PoolId indexed poolId, uint256 hookFeePpm);

  /// @notice Emitted when an external call to ORACLE_MANAGER or DYNAMIC_FEE_MANAGER fails
  /// @param poolId The pool identifier where the failure occurred
  /// @param externalContract The address of the external contract that failed
  /// @param functionId id for the function that failed
  /// @param errorData The error data returned from the failed call
  event ExternalCallFailed(PoolId indexed poolId, address indexed externalContract, string functionId, bytes errorData);

  /// @notice Emitted when market shares (sL tokens) are withdrawn by the owner
  /// @param poolId The pool identifier for which shares were withdrawn
  /// @param recipient The address receiving the shares
  /// @param amount The amount of shares withdrawn
  event SharesWithdrawn(PoolId indexed poolId, address indexed recipient, uint256 amount);

  // - - - Constants & Immutables - - -

  // forge-lint: disable-start(mixed-case-function)
  /// @notice Minimum liquidity required to trigger automatic fee reinvestment
  function MIN_REINVEST_LIQUIDITY() external view returns (uint128);

  /// @notice The dynamic fee manager responsible for computing swap fees
  function DYNAMIC_FEE_MANAGER() external view returns (IDynamicFeeManager);

  /// @notice The oracle manager responsible for TWAP and price observations
  function ORACLE_MANAGER() external view returns (IOracleManager);

  /// @notice The Aegis Engine core contract that manages vaults and lending markets
  function AEGIS_ENGINE() external view returns (IAegisEngine);

  /// @notice The limit order manager responsible for filling tick-aligned limit orders
  function LIMIT_ORDER_MANAGER() external view returns (ILimitOrderManager);
  // forge-lint: disable-end(mixed-case-function)

  // - - - Admin Functions - - -

  /// @notice Pause or unpause the hook's fee reinvestment functionality
  /// @dev Only callable by owner. When paused, fees accumulate but are not automatically reinvested
  /// @param doPause True to pause, false to unpause
  function pause(bool doPause) external;

  /// @notice Set the hook fee percentage for a specific pool
  /// @dev Only callable by owner. Fee is taken as a percentage of the swap fee
  /// @param poolId The pool identifier
  /// @param hookFeePpm The hook fee in parts per million (1_000_000 = 100%)
  function setHookFeePpm(PoolId poolId, uint24 hookFeePpm) external;

  /// @notice Withdraw market shares (sL tokens) accumulated from fee reinvestment
  /// @dev Only callable by owner. Shares are ERC-6909 tokens held by the hook contract.
  /// @param poolId The pool identifier for which to withdraw shares
  /// @param to The recipient address
  /// @param amount The amount of shares to withdraw
  function withdrawMarketShares(PoolId poolId, address to, uint256 amount) external;

  // - - - View Functions - - -

  /// @notice Get the hook fee percentage for a specific pool
  /// @param poolId The pool identifier
  /// @return The hook fee in parts per million
  function hookFeePpm(PoolId poolId) external view returns (uint24);

  /// @notice Get the pending fees accumulated for a specific pool
  /// @dev These fees are eligible for reinvestment once thresholds are met
  /// @param poolId The pool identifier
  /// @return amount0 The pending amount of currency0
  /// @return amount1 The pending amount of currency1
  function pendingFees(PoolId poolId) external view returns (uint128 amount0, uint128 amount1);
}
