// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

interface IFeeCalculator {

    function determineSwapFee(PoolKey memory _poolKey, IPoolManager.SwapParams memory _params, uint24 _baseFee) external view returns (uint24 swapFee_);

    function trackSwap(address _sender, PoolKey calldata _poolKey, IPoolManager.SwapParams calldata _params, BalanceDelta _delta, bytes calldata _hookData) external;

    function setFlaunchParams(PoolId _poolId, bytes calldata _params) external;

}
