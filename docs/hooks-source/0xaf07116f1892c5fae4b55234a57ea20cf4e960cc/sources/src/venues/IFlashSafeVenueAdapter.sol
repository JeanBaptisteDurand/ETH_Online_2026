// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Non-reverting quote capability required for adapters used by the
/// live FLASH planner. Unavailable liquidity and unsupported curve families
/// are ordinary data states and must return `available == false`.
interface IFlashSafeVenueAdapter {
    function safeQuoteVersion() external pure returns (bytes4);

    function tryQuoteExactInput(address pool, address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (bool available, uint256 amountOut);

    function tryQuoteExactOutput(address pool, address tokenIn, address tokenOut, uint256 amountOut)
        external
        view
        returns (bool available, uint256 amountIn);

    function tryConstantProductModel(address pool, address tokenIn, address tokenOut)
        external
        view
        returns (
            bool available,
            uint256 reserveIn,
            uint256 reserveOut,
            uint16 feeBps,
            bytes32 stateHash
        );
}
