// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { IPositionManager } from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import { IAllowanceTransfer } from "permit2/src/interfaces/IAllowanceTransfer.sol";
import { IWETH9 } from "@uniswap/v4-periphery/src/interfaces/external/IWETH9.sol";

/// @title Aegis Dependencies Interface
/// @notice Stores chain-specific external dependencies for deterministic cross-chain deployment
/// @dev Deployed via CREATE2 for identical address across chains.
///      Anyone can deploy contracts, but AEGIS_INITIALIZER (EOA or GnosisSafe at same address
///      across chains) must call initialize() and becomes owner of all Aegis contracts.
interface IAegisDependencies {
  /// @notice Thrown when caller is not the authorized initializer
  error UnauthorizedInitializer();

  /// @notice Thrown when contract is already initialized
  error AlreadyInitialized();

  /// @notice Thrown when a zero address is provided
  error ZeroAddress();

  /// @notice Emitted when dependencies are initialized
  /// @param poolManager The Uniswap V4 PoolManager address
  /// @param positionManager The Uniswap V4 PositionManager address
  /// @param permit2 The Permit2 contract address
  /// @param weth9 The WETH9 contract address
  event Initialized(address indexed poolManager, address indexed positionManager, address permit2, address weth9);

  /// @notice Returns the privileged address that can call initialize() and owns all Aegis contracts
  /// @dev Can be an EOA or a GnosisSafe deployed at the same address across chains.
  ///      This address is hardcoded to enable deterministic CREATE2 deployment by anyone.
  // forge-lint: disable-next-line(mixed-case-function)
  function AEGIS_INITIALIZER() external pure returns (address);

  /// @notice Returns whether the contract has been initialized
  function initialized() external view returns (bool);

  /// @notice Returns the Uniswap V4 PoolManager
  function poolManager() external view returns (IPoolManager);

  /// @notice Returns the Uniswap V4 PositionManager
  function positionManager() external view returns (IPositionManager);

  /// @notice Returns the Permit2 contract
  function permit2() external view returns (IAllowanceTransfer);

  /// @notice Returns the WETH9 contract
  function weth9() external view returns (IWETH9);

  /// @notice Initialize with chain-specific addresses (one-time only)
  /// @dev Can only be called by AEGIS_INITIALIZER and only once
  /// @param _poolManager Uniswap V4 PoolManager address
  /// @param _positionManager Uniswap V4 PositionManager address
  /// @param _permit2 Permit2 contract address
  /// @param _weth9 WETH9 contract address
  function initialize(
    IPoolManager _poolManager,
    IPositionManager _positionManager,
    IAllowanceTransfer _permit2,
    IWETH9 _weth9
  ) external;
}
