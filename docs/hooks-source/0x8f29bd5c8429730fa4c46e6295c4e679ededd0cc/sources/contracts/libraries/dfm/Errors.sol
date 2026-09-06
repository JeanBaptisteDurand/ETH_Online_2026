// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Errors
/// @notice Shared custom error definitions for the Aegis contracts
library Errors {
  // - - - Access control - - -
  error UnauthorizedCaller(address caller);

  // - - - Validation - - -
  error ZeroAddress();
  error NotInitialized();
  error AlreadyInitialized();
  error InvalidHookAuthorization(address expected, address actual);
  error InvalidFee();
  error InvalidSwapDelta();
  error ParameterOutOfRange(uint256 value, uint256 min, uint256 max);
}
