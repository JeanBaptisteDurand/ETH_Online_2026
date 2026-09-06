// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import "@types/PoolInfo.sol";

/// @title IBDeFiSwapHandler
/// @notice Interface for protocol swap execution and route management across internal and external token flows.
interface IBDeFiSwapHandler {
    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error BDeFiSwapHandler__IncorrectMsgValue();
    error BDeFiSwapHandler__RouteMissing();
    error BDeFiSwapHandler__InvalidParentType();
    error BDeFiSwapHandler__NotExternalToken();
    error BDeFiSwapHandler__InvalidPoolKey();

    /*//////////////////////////////////////////////////////////////
                              INITIALIZER
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the swap handler module.
    /// @param _bdefiCore Address of the core registry contract.
    /// @param _version Version identifier for this deployment.
    /// @param _uniswapUniversalRouter Address of the Uniswap Universal Router contract.
    /// @param _uniswapV3SwapRouter02 Address of the Uniswap V3 Swap Router 02 contract.
    function initialize(
        address _bdefiCore,
        uint16 _version,
        address _uniswapUniversalRouter,
        address _uniswapV3SwapRouter02
    ) external;

    /*//////////////////////////////////////////////////////////////
                             PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Swaps a token parent asset into a child token using the provided pool key.
    /// @param token Child token to receive.
    /// @param poolKey Pool key used for the swap leg.
    /// @param amountIn Amount of parent asset to swap.
    /// @param minAmountOut Minimum acceptable amount of child token.
    /// @param recipient Address that receives output tokens.
    /// @param deadline Swap deadline timestamp.
    /// @return amountOut Amount of child token received.
    function swapParentToToken(
        address token,
        PoolKey calldata poolKey,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    /// @notice Swaps native ETH into an internal BuilDeFi token and can route through the token origin.
    /// @param tokenAddress The internal token to receive.
    /// @param minAmountOutV4 Minimum acceptable output amount of tokenAddress.
    /// @param minAmountOutV3 Minimum acceptable output when swapping ETH to origin through V3.
    /// @param recipient Recipient of tokenAddress.
    /// @param deadline Swap deadline timestamp.
    /// @return amountOut Amount of tokenAddress received.
    function swapEthToInternalToken(
        address tokenAddress,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    /// @notice Swaps native ETH into an external token using the token configured external route.
    /// @param tokenAddress The external token to receive.
    /// @param amountIn Amount of ETH to swap.
    /// @param minAmountOutV4 Minimum acceptable output amount for V4 segment.
    /// @param minAmountOutV3 Minimum acceptable output amount for V3 segment.
    /// @param recipient Recipient of tokenAddress.
    /// @param deadline Swap deadline timestamp.
    /// @return amountOut Amount of tokenAddress received.
    function swapEthToExternalToken(
        address tokenAddress,
        uint256 amountIn,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    /// @notice Swaps an internal BDeFi token into native ETH and can route through the token origin.
    /// @param tokenAddress The internal token to sell for ETH.
    /// @param amountIn Amount of tokenAddress to swap.
    /// @param minAmountOutV4 Minimum acceptable output amount for V4 segment.
    /// @param minAmountOutV3 Minimum acceptable output amount for V3 segment.
    /// @param recipient The recipient of the resulting native ETH.
    /// @param deadline Swap deadline timestamp.
    /// @return amountOut Amount of native ETH received.
    function swapInternalTokenToEth(
        address tokenAddress,
        uint256 amountIn,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut);

    /// @notice Swaps an external token into native ETH using the token configured external route.
    /// @param tokenAddress The external token to sell for ETH.
    /// @param amountIn Amount of tokenAddress to swap.
    /// @param minAmountOutV4 Minimum acceptable output amount of native ETH.
    /// @param minAmountOutV3 Minimum acceptable output amount for V3 segment.
    /// @param recipient The recipient of the resulting native ETH.
    /// @param deadline Swap deadline timestamp.
    /// @return amountOut Amount of native ETH received.
    function swapExternalTokenToEth(
        address tokenAddress,
        uint256 amountIn,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut);

    /*//////////////////////////////////////////////////////////////
                           PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Builds and stores origin-to-token and token-to-origin routes for an internal token.
    /// @param token Internal token whose routes are recalculated and stored.
    function buildAndStoreTokenRoutes(address token) external;

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns stored route from origin asset into internal token.
    /// @param token Internal token address.
    /// @return route Computed route used to swap from origin asset into token.
    function getOriginToTokenRoute(address token) external view returns (ComputedRoute memory route);

    /// @notice Returns stored route from internal token back to origin asset.
    /// @param token Internal token address.
    /// @return route Computed route used to swap from token back to origin asset.
    function getTokenToOriginRoute(address token) external view returns (ComputedRoute memory route);
}
