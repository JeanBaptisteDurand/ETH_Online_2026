// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

interface ITreasuryAction {
    event ActionExecuted(PoolKey _poolKey, int _token0, int _token1);

    /**
     * Executes the action against the calling {MemecoinTreasury}'s pool.
     *
     * @dev This is `payable` so a raw native-ETH (`address(0)`) paired pool can settle its paired
     * leg by push/value: an ERC20 leg is approved on the treasury and pulled with `transferFrom`,
     * but native ETH cannot be approved, so the treasury forwards its whole ETH balance as call
     * value instead. Actions MUST return any unspent ETH to `msg.sender` before returning — the
     * treasury asserts this. The selector is unchanged by the mutability change.
     *
     * @param _poolKey The pool the treasury is acting against
     * @param _data Additional data the action may require
     */
    function execute(
        PoolKey memory _poolKey,
        bytes memory _data
    ) external payable;
}
