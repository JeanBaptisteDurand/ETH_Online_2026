// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/**
 * @title IFeeHook
 * @notice The minimal surface `FeeManager` needs from whichever dynamic-fee
 *         hook is wired to a given pool — just the TWAP-based
 *         fee-conversion floor. Both `DynamicFeeHook` (V1, with
 *         PauseController) and `DynamicFeeHookV2` (no pause capability)
 *         implement this, so `FeeManager` (unchanged behavior otherwise)
 *         can be deployed against either generation without forking it.
 */
interface IFeeHook {
    function twapSqrtPriceX96(PoolId id) external view returns (uint160 avgSqrtPriceX96, bool available);
}
