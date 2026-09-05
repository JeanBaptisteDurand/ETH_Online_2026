// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {FlashHook} from "./FlashHook.sol";

/// @title Flash
/// @notice Production entry point for the FLASH protocol's Uniswap v4 hook.
contract Flash is FlashHook {
    constructor(IPoolManager manager, address initialOwner) FlashHook(manager, initialOwner) {}
}
