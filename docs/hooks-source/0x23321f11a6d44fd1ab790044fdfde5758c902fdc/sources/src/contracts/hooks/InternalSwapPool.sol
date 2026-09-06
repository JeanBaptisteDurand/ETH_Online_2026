// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Currency, CurrencyLibrary} from '@uniswap/v4-core/src/types/Currency.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolId, PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {StateLibrary} from '@uniswap/v4-core/src/libraries/StateLibrary.sol';
import {SwapMath} from '@uniswap/v4-core/src/libraries/SwapMath.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';

import {CurrencySettler} from '@flaunch/libraries/CurrencySettler.sol';


/**
 * This frontruns Uniswap to sell undesired token amounts from our fees into desired tokens
 * ahead of our fee distribution. This acts as a partial orderbook to remove impact against
 * our pool.
 */
abstract contract InternalSwapPool {

    using CurrencyLibrary for Currency;
    using CurrencySettler for Currency;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    /// Emitted when a pool has been allocated fees on either side of the position
    event PoolFeesReceived(PoolId indexed _poolId, uint _amount0, uint _amount1);

    /// Emitted when a pool fees have been distributed to stakers
    event PoolFeesDistributed(PoolId indexed _poolId, uint _donateAmount, uint _creatorAmount, uint _bidWallAmount, uint _governanceAmount, uint _protocolAmount);

    /// Emitted when pool fees have been internally swapped
    event PoolFeesSwapped(PoolId indexed _poolId, bool zeroForOne, uint _amount0, uint _amount1);

    /**
     * Contains amounts for both the currency0 and currency1 values of a UV4 Pool.
     */
    struct ClaimableFees {
        uint amount0;
        uint amount1;
    }

    /// Maps the amount of claimable tokens that are available to be `distributed`
    /// for a `PoolId`.
    mapping (PoolId _poolId => ClaimableFees _fees) internal _poolFees;

    /**
     * Provides the {ClaimableFees} for a pool key.
     *
     * @param _poolKey The PoolKey to check
     *
     * @return The {ClaimableFees} for the PoolKey
     */
    function poolFees(PoolKey memory _poolKey) public view returns (ClaimableFees memory) {
        return _poolFees[_poolKey.toId()];
    }

    /**
     * Allows for fees to be deposited against a pool to be distributed.
     *
     * @dev Our `amount0` must always refer to the amount of the native token provided. The
     * `amount1` will always be the underlying {Memecoin}. The internal logic of
     * this function will rearrange them to match the `PoolKey` if needed.
     *
     * @param _poolKey The PoolKey to deposit against
     * @param _amount0 The amount of eth equivalent to deposit
     * @param _amount1 The amount of underlying token to deposit
     */
    function _depositFees(PoolKey memory _poolKey, uint _amount0, uint _amount1) internal {
        PoolId _poolId = _poolKey.toId();

        _poolFees[_poolId].amount0 += _amount0;
        _poolFees[_poolId].amount1 += _amount1;

        emit PoolFeesReceived(_poolId, _amount0, _amount1);
    }

    /**
     * Check if we have any token1 fee tokens that we can use to fill the swap before it hits
     * the Uniswap pool. This prevents the pool from being affected and reduced gas costs.
     *
     * This frontruns UniSwap to sell undesired token amounts from our fees into desired tokens
     * ahead of our fee distribution. This acts as a partial orderbook to remove impact against
     * our pool.
     *
     * @param _poolManager The Uniswap V4 {PoolManager} contract
     * @param _key The PoolKey that is being swapped against
     * @param _params The swap parameters
     * @param _nativeIsZero If our native token is `currency0`
     *
     * @return ethIn_ The ETH taken for the swap
     * @return tokenOut_ The tokens given for the swap
     */
    function _internalSwap(
        IPoolManager _poolManager,
        PoolKey calldata _key,
        IPoolManager.SwapParams memory _params,
        bool _nativeIsZero
    ) internal returns (
        uint ethIn_,
        uint tokenOut_
    ) {
        PoolId poolId = _key.toId();

        // Load our PoolFees as storage as we will manipulate them later if we trigger
        ClaimableFees storage pendingPoolFees = _poolFees[poolId];
        if (pendingPoolFees.amount1 == 0) {
            return (ethIn_, tokenOut_);
        }

        // We only want to process our internal swap if we are buying non-ETH tokens with ETH. This
        // will allow us to correctly calculate the amount of token to replace.
        if (_nativeIsZero != _params.zeroForOne) {
            return (ethIn_, tokenOut_);
        }

        // Get the current price for our pool
        (uint160 sqrtPriceX96,,,) = _poolManager.getSlot0(poolId);

        // Since we have a positive amountSpecified, we can determine the maximum
        // amount that we can transact from our pool fees.
        if (_params.amountSpecified >= 0) {
            // Take the max value of either the pool fees or the amount specified to swap for
            uint amountSpecified = (uint(_params.amountSpecified) > pendingPoolFees.amount1)
                ? pendingPoolFees.amount1
                : uint(_params.amountSpecified);

            // Capture the amount of desired token required at the current pool state to
            // purchase the amount of token speicified, capped by the pool fees available.
            (, ethIn_, tokenOut_, ) = SwapMath.computeSwapStep({
                sqrtPriceCurrentX96: sqrtPriceX96,
                sqrtPriceTargetX96: _params.sqrtPriceLimitX96,
                liquidity: _poolManager.getLiquidity(poolId),
                amountRemaining: int(amountSpecified),
                feePips: 0
            });
        }
        // As we have a negative amountSpecified, this means that we are spending any amount
        // of token to get a specific amount of undesired token.
        else {
            // To calculate the amount of tokens that we can receive, we first pass in the amount
            // of ETH that we are requesting to spend. We need to invert the `sqrtPriceTargetX96`
            // as our swap step computation is essentially calculating the opposite direction.
            (, tokenOut_, ethIn_, ) = SwapMath.computeSwapStep({
                sqrtPriceCurrentX96: sqrtPriceX96,
                sqrtPriceTargetX96: _params.zeroForOne ? TickMath.MAX_SQRT_PRICE - 1 : TickMath.MIN_SQRT_PRICE + 1,
                liquidity: _poolManager.getLiquidity(poolId),
                amountRemaining: int(-_params.amountSpecified),
                feePips: 0
            });

            // If we cannot fulfill the full amount of the internal orderbook, then we want to
            // calculate the percentage of which we can utilize.
            if (tokenOut_ > pendingPoolFees.amount1) {
                ethIn_ = (pendingPoolFees.amount1 * ethIn_) / tokenOut_;
                tokenOut_ = pendingPoolFees.amount1;
            }
        }

        // If nothing has happened, we can exit
        if (ethIn_ == 0 && tokenOut_ == 0) {
            return (ethIn_, tokenOut_);
        }

        // Reduce the amount of fees that have been extracted from the pool and converted
        // into ETH fees.
        pendingPoolFees.amount0 += ethIn_;
        pendingPoolFees.amount1 -= tokenOut_;

        // Take the required ETH tokens from the {PoolManager} to settle the currency change. The
        // `tokensOut_` are settled externally to this call.
        _poolManager.take(!_nativeIsZero ? _key.currency1 : _key.currency0, address(this), ethIn_);
        (!_nativeIsZero ? _key.currency0 : _key.currency1).settle(_poolManager, address(this), tokenOut_, false);

        // Capture the swap cost that we captured from our drip
        emit PoolFeesSwapped(poolId, _params.zeroForOne, ethIn_, tokenOut_);
    }

}
