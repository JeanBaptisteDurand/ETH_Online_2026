// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Optional precision surface for verified FLASH venue adapters.
/// @dev Returns output at the current marginal price after fixed swap fees,
/// but before curve movement caused by `amountIn`.
interface IFlashImpactVenue {
    function trySpotQuoteExactInput(address pool, address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (bool available, uint256 amountOut);
}
