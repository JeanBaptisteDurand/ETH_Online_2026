// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRwagmiHook} from "./IRwagmiHook.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @title IRwagmiHookV2
/// @notice RWAGMI hook extension for launch-auction activation.
interface IRwagmiHookV2 is IRwagmiHook {
    event MevModuleInitialized(PoolKey poolKey, address indexed mevModule);
    event MevModuleDisabled(PoolKey poolKey, address indexed mevModule);

    error PoolNotInitialized();
    error MevModuleAlreadyInitialized();

    function initializeMevModule(PoolKey calldata poolKey, bytes calldata mevModuleData) external;
}
