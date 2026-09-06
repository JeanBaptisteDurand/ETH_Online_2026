// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/interfaces/IClankerHook.sol
// ZNS Launchpad. Renamed type only. NOTE: internal fee/tick identifiers (clankerFee/pairedFee/
// clankerIsToken0/tickIfToken0IsClanker) are intentionally retained verbatim to minimize the diff on
// the byte-for-byte 4-case fee math (per design open-decision #1).
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface IZNSHook {
    error ETHPoolNotAllowed();
    error OnlyFactory();
    error UnsupportedInitializePath();
    error PastCreationTimestamp();
    error MevModuleEnabled();
    error WethCannotBeClanker();

    event PoolCreatedOpen(
        address indexed pairedToken,
        address indexed clanker,
        PoolId poolId,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing
    );

    event PoolCreatedFactory(
        address indexed pairedToken,
        address indexed clanker,
        PoolId poolId,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        address locker,
        address mevModule
    );

    // note: is not emitted when a mev module expires
    event MevModuleDisabled(PoolId);
    event ClaimProtocolFees(address indexed token, uint256 amount);

    // initialize a pool on the hook for a token
    function initializePool(
        address clanker,
        address pairedToken,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        address locker,
        address mevModule,
        bytes calldata poolData
    ) external returns (PoolKey memory);

    // initialize a pool not via the factory
    function initializePoolOpen(
        address clanker,
        address pairedToken,
        int24 tickIfToken0IsClanker,
        int24 tickSpacing,
        bytes calldata poolData
    ) external returns (PoolKey memory);

    // turn a pool's mev module on if it exists
    function initializeMevModule(PoolKey calldata poolKey, bytes calldata mevModuleData) external;

    function mevModuleEnabled(PoolId poolId) external view returns (bool);
    function poolCreationTimestamp(PoolId poolId) external view returns (uint256);
    function MAX_MEV_MODULE_DELAY() external view returns (uint256);

    function supportsInterface(bytes4 interfaceId) external pure returns (bool);
}
