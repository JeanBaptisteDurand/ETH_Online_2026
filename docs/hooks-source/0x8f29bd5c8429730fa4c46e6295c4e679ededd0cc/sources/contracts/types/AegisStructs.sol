// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Enumerates the supported NFT kinds a vault may custody.
enum NftKind {
  CL_V4,
  LO
}

/// @notice Lightweight reference to a custodied NFT.
/// @dev Packed into a single storage slot: uint8 kind + uint248 tokenId = 256 bits
struct NftRef {
  NftKind kind;
  uint248 tokenId;
}
