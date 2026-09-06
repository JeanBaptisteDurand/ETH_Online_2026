// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title IRwagmiMevModule
/// @notice Swap-time launch MEV module called by the v2 RWAGMI hook.
interface IRwagmiMevModule {
    error PoolLocked();
    error OnlyHook();
    error NotAuctionBlock();
    error GasSignalNegative();

    function initialize(PoolKey calldata poolKey, bytes calldata initData) external;

    function beforeSwap(
        address sender,
        PoolKey calldata poolKey,
        SwapParams calldata sp,
        bool b20IsCurrency0,
        bytes calldata swapData
    ) external returns (bool disableMevModule, address paymentCurrency, uint256 paymentAmount);

    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
