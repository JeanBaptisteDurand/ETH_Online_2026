// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Normalized exact-in/out boundary used by FLASH for external AMMs.
/// Quote functions are intentionally non-view: concentrated-liquidity adapters
/// quote by invoking pool swap math and reverting from its callback.
interface IFlashVenueAdapter {
    function supportsPool(address pool, address tokenIn, address tokenOut) external view returns (bool);
    function quoteExactInput(address pool, address tokenIn, address tokenOut, uint256 amountIn)
        external returns (uint256 amountOut);
    function quoteExactOutput(address pool, address tokenIn, address tokenOut, uint256 amountOut)
        external returns (uint256 amountIn);
    function swapExactInput(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
    function swapExactOutput(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 maxAmountIn,
        address recipient
    ) external returns (uint256 amountIn);
}
