// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IBonker} from "./IBonker.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IBonkerMevModule {
    error PoolLocked();
    error OnlyHook();

    // initialize the mev module
    function initialize(PoolKey calldata poolKey, bytes calldata mevModuleInitData) external;

    // before a swap, call the mev module
    function beforeSwap(
        PoolKey calldata poolKey,
        IPoolManager.SwapParams calldata swapParams,
        bool bonkerIsToken0,
        bytes calldata mevModuleSwapData
    ) external returns (bool disableMevModule);

    // implements the IBonkerMevModule interface
    function supportsInterface(bytes4 interfaceId) external pure returns (bool);
}
