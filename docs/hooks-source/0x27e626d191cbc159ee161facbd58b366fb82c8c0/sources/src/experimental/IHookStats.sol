// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

/// @notice URC-3 hook statistics, transcribed from v4-periphery's
///         `src/interfaces/external/IHookStats.sol` rather than imported: the periphery copy
///         binds `PoolKey` to its own nested v4-core, which is a distinct Solidity type from
///         ours and breaks compilation. The SIGNATURES are identical, so `interfaceId` (an XOR
///         of selectors over canonical tuple types) is identical too -- `ReservesLens` resolves
///         this implementation exactly as it would the upstream interface.
interface IHookStats is IERC165 {
    /// @notice Total reserves managed by the hook for a pool.
    function getReserves(PoolKey calldata key) external view returns (uint256 amount0, uint256 amount1);

    /// @notice Hook-managed assets immediately available for swapping.
    function getEffectiveLiquidity(PoolKey calldata key) external view returns (uint256 amount0, uint256 amount1);

    /// @notice The hook whose statistics this contract reports.
    function hook() external view returns (address);
}
