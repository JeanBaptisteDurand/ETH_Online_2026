// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @notice Per-pool transient (EIP-1153) accumulator for the in-flight swap's hook fee.
/// @dev Strict invariant of the AegisHook deferred-accounting fix: the hook fee charged by the
///      CURRENT `_afterSwap` invocation is held here — NOT in `_pendingFees` — until after
///      `_tryReinvest` runs. That keeps the in-flight swap's own contribution out of the
///      pool of fees `_tryReinvest` is allowed to spend, which is necessary because the
///      underlying ERC20 backing the just-minted 6909 claim is not yet settled to PoolManager.
///
///      End-of-`_afterSwap` calls `consume` to read the accumulated delta AND clear the slot
///      atomically; the result is then folded into `_pendingFees` for consideration by the
///      next reinvest cycle.
///
///      SINGLE-ACTIVE-FRAME ASSUMPTION: this slot represents AT MOST ONE active swap frame
///      per pool at any time. Producer (`_chargeHookFee`) accumulates into the slot during
///      that frame's `_beforeSwap` / `_afterSwap`; consumer (`_afterSwap` end) drains and
///      clears it before that frame returns. The library does NOT implement stack-like
///      semantics: if a same-pool swap were to nest INSIDE the original swap's frame (e.g.,
///      a downstream callback initiating another swap on the same pool before the original's
///      `consume` runs), the nested frame's `add` would mix into the slot and its `consume`
///      would drain BOTH frames' fees — leaving the outer frame's `consume` reading zero and
///      its fee never flushing to `_pendingFees`.
///
///      Today this is safe because no AegisHook callback path (OracleManager, DynamicFeeManager,
///      LimitOrderManager) initiates a swap on the same pool. If that ever changes, this
///      library must be updated to either (a) gate against same-pool re-entry or (b) implement
///      a stack-like per-frame slot.
library CurrentSwapHookFeeCache {
  // bytes32(uint256(keccak256("Aegis.CurrentSwapHookFee")) - 1)
  bytes32 internal constant BASE_SLOT = 0xb23de3da0f71fd610efb091aa47680f79d3ffeda2078bc427b0f1ecd3c18ca48;

  function slot(PoolId id) internal pure returns (bytes32 slotKey) {
    slotKey = keccak256(abi.encodePacked(BASE_SLOT, PoolId.unwrap(id)));
  }

  /// @notice Accumulate `delta` into the per-pool transient slot.
  function add(PoolId id, BalanceDelta delta) internal {
    bytes32 slotKey = slot(id);
    int256 packed;
    assembly ("memory-safe") {
      packed := tload(slotKey)
    }
    BalanceDelta updated = BalanceDelta.wrap(packed) + delta;
    int256 newPacked = BalanceDelta.unwrap(updated);
    assembly ("memory-safe") {
      tstore(slotKey, newPacked)
    }
  }

  /// @notice Read the accumulated delta and clear the slot atomically.
  /// @return delta The accumulated `BalanceDelta`; `BalanceDelta.wrap(0)` if the slot was empty.
  function consume(PoolId id) internal returns (BalanceDelta delta) {
    bytes32 slotKey = slot(id);
    int256 packed;
    assembly ("memory-safe") {
      packed := tload(slotKey)
    }
    delta = BalanceDelta.wrap(packed);
    if (packed != 0) {
      assembly ("memory-safe") {
        tstore(slotKey, 0)
      }
    }
  }
}
