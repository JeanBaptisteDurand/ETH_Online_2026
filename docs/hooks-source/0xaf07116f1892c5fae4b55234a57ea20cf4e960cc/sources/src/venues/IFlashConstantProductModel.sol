// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Optional fleet-optimization capability for constant-product venues.
/// Adapters that implement this interface allow FLASH to allocate with local
/// curve math rather than repeatedly invoking the venue quoter.
interface IFlashConstantProductModel {
    function constantProductModel(address pool, address tokenIn, address tokenOut)
        external
        view
        returns (uint256 reserveIn, uint256 reserveOut, uint16 feeBps, bytes32 stateHash);
}

