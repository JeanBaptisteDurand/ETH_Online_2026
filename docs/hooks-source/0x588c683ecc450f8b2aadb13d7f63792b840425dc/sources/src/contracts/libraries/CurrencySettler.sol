// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeTransferLib} from '@solady/utils/SafeTransferLib.sol';

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';

/**
 * Library used to interact with PoolManager.sol to settle any open deltas:
 * - To settle a positive delta (a credit to the user), a user may take or mint.
 * - To settle a negative delta (a debt on the user), a user make transfer or burn to pay off a debt.
 *
 * @dev Note that sync() is called before any erc-20 transfer in `settle`.
 */
library CurrencySettler {
    /// Thrown when a native settle names a payer other than the calling contract — there is no
    /// native `transferFrom`, so the ETH would silently come out of the caller's own balance
    error NativePayerMustBeSelf(address _payer);

    /**
     * Settle (pay) a currency to the PoolManager.
     *
     * @param currency Currency to settle
     * @param manager IPoolManager to settle to
     * @param payer Address of the payer, the token sender
     * @param amount Amount to send
     * @param burn If true, burn the ERC-6909 token, otherwise ERC20-transfer to the PoolManager
     */
    function settle(
        Currency currency,
        IPoolManager manager,
        address payer,
        uint amount,
        bool burn
    ) internal {
        // For native currencies or burns, calling sync is not required
        // short circuit for ERC-6909 burns to support ERC-6909-wrapped native tokens
        if (burn) {
            manager.burn(payer, currency.toId(), amount);
        } else if (currency.isAddressZero()) {
            // A native settle can only draw from the calling contract's OWN balance. An ERC20 leg
            // honours `payer` via `transferFrom`; the same call with a native leg would ignore it
            // and spend house ETH — parked BidWall deposits, another pool's pending fees — with no
            // revert. Force the divergence loud: callers must pass `address(this)` for a native
            // leg, making the funding source an explicit statement rather than an accident.
            if (payer != address(this)) {
                revert NativePayerMustBeSelf(payer);
            }
            manager.settle{value: amount}();
        } else {
            manager.sync(currency);

            // Moved off the high-level `IERC20Minimal` calls this used to make. Those ABI-decode a
            // `bool` return, so a token that returns NO data — mainnet USDT and a number of older
            // ERC20s — reverts the decode and takes the whole swap with it. That was unreachable
            // while every pool paired against a protocol wrapper, but the {PairedTokenRegistry} now
            // whitelists plain ERC20s ("USDC, DOGE, ..."), which puts an arbitrary token
            // on this path: settlement is how EVERY swap pays the {PoolManager}, so such a pairing
            // would be completely non-functional rather than merely degraded.
            //
            // solady's helpers accept an empty return and still revert on an explicit `false`, and
            // they cost slightly LESS bytecode than the high-level calls they replace.
            address token = Currency.unwrap(currency);
            if (payer != address(this)) {
                SafeTransferLib.safeTransferFrom(token, payer, address(manager), amount);
            } else {
                SafeTransferLib.safeTransfer(token, address(manager), amount);
            }

            manager.settle();
        }
    }

    /**
     * Take (receive) a currency from the PoolManager.
     *
     * @param currency Currency to take
     * @param manager IPoolManager to take from
     * @param recipient Address of the recipient, the token receiver
     * @param amount Amount to receive
     * @param claims If true, mint the ERC-6909 token, otherwise ERC20-transfer from the PoolManager to recipient
     */
    function take(
        Currency currency,
        IPoolManager manager,
        address recipient,
        uint amount,
        bool claims
    ) internal {
        claims ? manager.mint(recipient, currency.toId(), amount) : manager.take(currency, recipient, amount);
    }
}
