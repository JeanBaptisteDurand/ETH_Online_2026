// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/hooks/interfaces/IClankerHookV2.sol
// ZNS Launchpad. Renamed type only. mevModuleOperational kept NON-view (it mutates). Pool-extension
// surface is retained in this ABI but unused/removed in the ZNS hook implementation (Phase 1a).
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IZNSHook} from "./IZNSHook.sol";

interface IZNSHookV2 is IZNSHook {
    error OnlyThis();
    error MevModuleNotOperational();
    error Unauthorized();

    event MevModuleSetFee(PoolId poolId, uint24 fee);

    // NOTE: PoolInitializationData / PoolSwapData encodings are hook-internal and defined in the
    // ZnsHook implementation (Step 6), aligned to the real decode logic — not frozen in the ABI here.

    function mevModuleSetFee(PoolKey calldata poolKey, uint24 fee) external;

    function mevModuleOperational(PoolId poolId) external returns (bool);
    function mevModuleEnabled(PoolId poolId) external view returns (bool);
    function poolCreationTimestamp(PoolId poolId) external view returns (uint256);
    function MAX_MEV_MODULE_DELAY() external view returns (uint256);
    function MAX_LP_FEE() external view returns (uint24);
    function MAX_MEV_LP_FEE() external view returns (uint24);
}
