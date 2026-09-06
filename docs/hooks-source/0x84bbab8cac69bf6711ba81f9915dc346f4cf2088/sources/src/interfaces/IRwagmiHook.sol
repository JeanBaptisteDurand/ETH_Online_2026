// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @title IRwagmiHook
/// @notice Launch hook that initializes a v4 pool on behalf of the launcher and
///         records the locker / MEV module bound to each pool id.
interface IRwagmiHook {
    struct PoolInfo {
        address token;
        address pairedToken;
        address locker;
        address mevModule;
        bool initialized;
    }

    event PoolInitialized(
        PoolId indexed poolId,
        address indexed token,
        address pairedToken,
        address locker,
        int24 startingTick
    );

    error OnlyLauncher();
    error OnlyPoolManager();
    error OnlyViaHook();
    error HookNotImplemented();
    error PoolAlreadyInitialized();
    error IdenticalCurrencies();

    /// @notice Launcher-only. Sorts currencies, derives the starting sqrt price
    ///         from `tickIfToken0IsB20` (sign-flipped when the B20 sorts as
    ///         currency1), initializes the pool, and records pool metadata.
    function initializePool(
        address token,
        address pairedToken,
        uint24 lpFee,
        int24 tickIfToken0IsB20,
        int24 tickSpacing,
        address locker,
        address mevModule,
        bytes calldata poolData
    ) external returns (PoolKey memory key, PoolId poolId, int24 startingTick);

    function poolInfoForId(PoolId poolId) external view returns (PoolInfo memory);

    function poolManager() external view returns (IPoolManager);

    function launcher() external view returns (address);
}
