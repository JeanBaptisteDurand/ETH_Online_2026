// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { RuntimeStructs } from "../../libraries/dfm/RuntimeStructs.sol";

/// @title IDynamicFeeManager
/// @notice Interface for dynamic fee management with adaptive tick caps and auto-tuning
/// @dev Manages runtime state and computes dynamic fees based on policy configuration
interface IDynamicFeeManager {
  /// @notice Swap quote containing all fee components and state flags
  struct SwapQuote {
    uint24 activeFee; // The fee charged for this swap (PPM)
    uint24 baseFee; // Base fee component (PPM)
    uint24 surgeFee; // Surge fee component (PPM)
    uint24 maxTicksPerBlock; // Current adaptive tick cap
    bool manualOverride; // True if manual fee override is active
    bool perSwapMode; // True if per-swap cap mode, false if per-block
    bool inCapEvent; // True if currently in surge mode (cap event active)
  }

  // === Events ===

  /// @notice Emitted when a pool is initialized
  event PoolInitialized(PoolId indexed poolId);

  /// @notice Emitted when surge mode is toggled
  event CapToggled(PoolId indexed poolId, bool inSurgeMode);

  /// @notice Emitted when fee state changes
  event FeeStateChanged(PoolId indexed poolId, uint256 baseFee, uint256 surgeFee, bool inCapEvent);

  /// @notice Emitted when the adaptive tick cap is adjusted
  event MaxTicksPerBlockUpdated(PoolId indexed poolId, uint24 oldTickCap, uint24 newTickCap);

  /// @notice Emitted when auto-tuning is paused or unpaused
  event AutoTunePaused(PoolId indexed poolId, bool paused);

  // === Governance ===

  /// @notice Sets whether auto-tuning is paused for a pool
  /// @param poolId The pool identifier
  /// @param paused True to pause auto-tuning, false to unpause
  function setAutoTunePaused(PoolId poolId, bool paused) external;

  // === Hook Surface ===

  /// @notice Initializes dynamic fee management for a new pool
  /// @param key The pool key
  /// @param initialTick The initial tick (unused but required by hook interface)
  function initialize(PoolKey calldata key, int24 initialTick) external;

  /// @notice Prepares for a swap by computing the active fee
  /// @param key The pool key
  /// @param preSwapTick The tick before swap
  /// @return activeFee The fee to charge for this swap
  function prepareSwap(PoolKey calldata key, int24 preSwapTick) external returns (uint24 activeFee);

  /// @notice Finalizes a swap by updating state and detecting cap violations
  /// @param key The pool key
  /// @param preSwapTick The tick before swap
  /// @param postSwapTick The tick after swap
  /// @return tickWasCapped True if tick movement exceeded cap
  function finalizeSwap(PoolKey calldata key, int24 preSwapTick, int24 postSwapTick)
    external
    returns (bool tickWasCapped);

  // === View Functions ===

  /// @notice Returns the current adaptive tick cap for a pool
  /// @param poolId The pool identifier
  /// @return tickCap The current tick movement cap
  function currentTickCap(PoolId poolId) external view returns (uint24 tickCap);

  /// @notice Returns whether a pool is currently in surge mode
  /// @param poolId The pool identifier
  /// @return inSurgeMode True if surge mode is active
  function isInSurgeMode(PoolId poolId) external view returns (bool inSurgeMode);

  /// @notice Returns a complete fee quote for a pool
  /// @param poolId The pool identifier
  /// @return quote The assembled swap quote
  function feeQuote(PoolId poolId) external view returns (SwapQuote memory quote);

  /// @notice Returns the runtime state for a pool
  /// @param poolId The pool identifier
  /// @return state The runtime state snapshot
  function runtimeState(PoolId poolId) external view returns (RuntimeStructs.RuntimeState memory state);
}
