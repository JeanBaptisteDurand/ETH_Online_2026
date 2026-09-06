// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice A packed representation of swap runtime data in a single 256-bit slot
/// @dev Layout: [unused 48 bits][dynamicFee 24 bits][preSwapTick 24 bits][sender 160 bits]
type PackedRuntime is bytes32;

/// @title PackedRuntimeLib
/// @notice Library for packing and unpacking swap runtime data into a single storage slot
library PackedRuntimeLib {
  // Bit layout constants for packing/unpacking
  uint256 private constant TICK_OFFSET = 160;
  uint256 private constant FEE_OFFSET = 184;

  /// @notice Pack runtime data into a single bytes32 value
  /// @param fee The dynamic swap fee (24 bits)
  /// @param tick The tick before the swap (24 bits, stored as int24)
  /// @param sender_ The address that initiated the swap (160 bits)
  /// @return packed The packed runtime data
  function pack(uint24 fee, int24 tick, address sender_) internal pure returns (PackedRuntime packed) {
    // forge-lint: disable-start(unsafe-typecast) -- casting is safe by construction: int24 → uint24, addresses fit in uint160
    bytes32 data = bytes32(uint256(uint160(sender_))) | bytes32(uint256(uint24(tick)) << TICK_OFFSET)
      | bytes32(uint256(fee) << FEE_OFFSET);
    // forge-lint: disable-end
    packed = PackedRuntime.wrap(data);
  }

  /// @notice Extract the dynamic fee from packed runtime data
  /// @param packed The packed runtime data
  /// @return The dynamic fee (24 bits)
  function dynamicFee(PackedRuntime packed) internal pure returns (uint24) {
    return uint24(uint256(PackedRuntime.unwrap(packed)) >> FEE_OFFSET);
  }

  /// @notice Extract the pre-swap tick from packed runtime data
  /// @param packed The packed runtime data
  /// @return The pre-swap tick (int24)
  function preSwapTick(PackedRuntime packed) internal pure returns (int24) {
    return int24(uint24(uint256(PackedRuntime.unwrap(packed)) >> TICK_OFFSET));
  }

  /// @notice Extract the sender address from packed runtime data
  /// @param packed The packed runtime data
  /// @return The sender address (160 bits)
  function sender(PackedRuntime packed) internal pure returns (address) {
    return address(uint160(uint256(PackedRuntime.unwrap(packed))));
  }

  /// @notice Unpack all runtime data at once
  /// @param packed The packed runtime data
  /// @return fee The dynamic fee
  /// @return tick The pre-swap tick
  /// @return sender_ The sender address
  function unpack(PackedRuntime packed) internal pure returns (uint24 fee, int24 tick, address sender_) {
    bytes32 data = PackedRuntime.unwrap(packed);
    uint256 value = uint256(data);
    // forge-lint: disable-start(unsafe-typecast) -- casting is safe: values are masked and within bounds
    fee = uint24(value >> FEE_OFFSET);
    tick = int24(uint24(value >> TICK_OFFSET));
    sender_ = address(uint160(value));
    // forge-lint: disable-end
  }
}
