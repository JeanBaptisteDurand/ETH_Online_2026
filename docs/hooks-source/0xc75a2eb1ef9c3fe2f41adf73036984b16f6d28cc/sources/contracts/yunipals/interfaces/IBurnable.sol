// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal interface for tokens that expose a self-burn function.
///         YPAL (the base token) and YRarityToken both implement this.
/// @dev    YPAL.burn(amount) burns the caller's YPAL, permanently reducing total
///         supply — honest deflation (YPAL has no underlying asset).
interface IBurnable {
    function burn(uint256 amount) external;
}
