// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PackedRuntime, PackedRuntimeLib } from "./PackedRuntime.sol";

/// @title HookRuntime
/// @notice Library for storing and loading swap runtime data in transient storage using EIP-1153
/// @dev Uses PackedRuntime to efficiently pack all runtime data into a single 256-bit slot
library HookRuntime {
  using PackedRuntimeLib for PackedRuntime;

  /// @notice Swap runtime data structure
  struct Runtime {
    uint24 dynamicFee;
    int24 preSwapTick;
    address sender;
  }

  /// @notice Store runtime data in transient storage
  /// @dev Packs all data into a single tstore operation for gas efficiency
  /// @param poolId The pool identifier to use as storage key
  /// @param runtime The runtime data to store
  function store(PoolId poolId, Runtime memory runtime) internal {
    PackedRuntime packed = PackedRuntimeLib.pack(runtime.dynamicFee, runtime.preSwapTick, runtime.sender);
    assembly {
      tstore(poolId, packed)
    }
  }

  /// @notice Load runtime data from transient storage
  /// @dev Unpacks data from a single tload operation
  /// @param poolId The pool identifier to use as storage key
  /// @return runtime The unpacked runtime data
  function load(PoolId poolId) internal view returns (Runtime memory runtime) {
    PackedRuntime packed;
    assembly {
      packed := tload(poolId)
    }
    (runtime.dynamicFee, runtime.preSwapTick, runtime.sender) = packed.unpack();
  }
}
