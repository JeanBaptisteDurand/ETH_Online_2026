// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

interface IMemecoinTreasury {
    error ActionNotApproved();
    error Unauthorized();

    /// Thrown when an executed action retains some of the native ETH the treasury forwarded to it
    /// as call value. Actions are handed the treasury's whole ETH balance (the native equivalent of
    /// the max ERC20 approval) and must push back whatever they did not spend.
    error UnreturnedNativeValue();

    event ActionExecuted(address indexed _action, PoolKey _poolKey, bytes _data);

    function initialize(
        address payable _positionManager,
        address _actionManager,
        address _flETH,
        PoolKey memory _poolKey
    ) external;
    function executeAction(
        address _action,
        bytes memory _data
    ) external;
    function claimFees() external;

    /**
     * The token this pool's memecoin is paired against (flETH, flUSDC, `address(0)` for a raw
     * native-ETH pool, ...), on either hook type. Treasury actions resolve the pool's paired
     * token from here rather than assuming a global native token, so they work for every pool.
     *
     * @return The pool's paired token
     */
    function pairedToken() external view returns (address);
}
