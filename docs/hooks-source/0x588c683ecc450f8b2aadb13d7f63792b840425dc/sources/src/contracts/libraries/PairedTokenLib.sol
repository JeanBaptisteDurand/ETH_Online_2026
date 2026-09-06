// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeTransferLib} from '@solady/utils/SafeTransferLib.sol';

import {Currency, CurrencyLibrary} from '@uniswap/v4-core/src/types/Currency.sol';

import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';
import {IWrappedToken} from '@flaunch-interfaces/IWrappedToken.sol';

/**
 * The standardised movement library for paired tokens: one home for pulling, paying,
 * wrapping, unwrapping, allowances and refunds across every paired-token shape (raw native
 * ETH, native wrappers, ERC20 wrappers and plain ERC20s), so shape-conditional branches do
 * not proliferate across the escrows, hooks and treasury actions. Keeping this logic in an
 * internal library also keeps it off the near-EIP-170-limit hooks.
 *
 * The caller must hold `_amount` of the wrapped token before calling {payout}.
 */
library PairedTokenLib {
    using CurrencyLibrary for Currency;

    /// Thrown when a treasury action is asked to settle more of a native paired leg than the
    /// {MemecoinTreasury} actually forwarded as call value.
    error InsufficientNativeValue();

    /**
     * The calling contract's own balance of `_currency`, excluding native ETH that arrived as
     * `msg.value` in the current call.
     *
     * @dev Treasury actions bracket their work with a before/after balance delta so they forward
     * back only what THIS call moved, never a residual belonging to another pool. A native paired
     * leg breaks that pattern, because `msg.value` is already credited to `address(this).balance`
     * before the function body runs: an unadjusted "before" snapshot would make the unspent ETH
     * look like a decrease, and it would be stranded rather than refunded. Subtracting the
     * forwarded value restores the invariant, so the same `after > before` refund works for both
     * an ERC20 and a native leg.
     *
     * @param _currency The currency to read
     * @param _value The native value forwarded into the current call (`msg.value`)
     *
     * @return balance_ The balance held prior to the forwarded value
     */
    function balanceExcludingValue(
        Currency _currency,
        uint _value
    ) internal view returns (uint balance_) {
        balance_ = _currency.balanceOfSelf();
        if (_currency.isAddressZero()) {
            balance_ -= _value;
        }
    }

    /**
     * Pulls `_amount` of `_currency` into the calling contract from `_payer`.
     *
     * @dev Every paired token is either a direct token or a wrapper that unwraps 1:1, so an ERC20
     * pull either moves `_amount` or reverts inside `safeTransferFrom` — there is no partial
     * outcome to measure. This used to bracket the transfer with a balance snapshot and report the
     * delta, and a `pullFromExact` variant reverted when that delta came up short; both existed
     * only for fee-on-transfer tokens, which the protocol does not admit.
     *
     * A native leg follows push semantics — the value must already have been forwarded as
     * `msg.value` (it cannot be approved or pulled), so all this asserts is that the forwarded
     * value covers the request. That check is about the CALLER's funding, not the token's
     * behaviour, so it stays.
     *
     * @param _currency The currency to pull
     * @param _payer The address to pull an ERC20 leg from
     * @param _amount The amount requested
     * @param _value The native value forwarded into the current call (`msg.value`)
     */
    function pullFrom(
        Currency _currency,
        address _payer,
        uint _amount,
        uint _value
    ) internal {
        if (_amount == 0) {
            return;
        }

        if (_currency.isAddressZero()) {
            if (_value < _amount) {
                revert InsufficientNativeValue();
            }
            return;
        }

        SafeTransferLib.safeTransferFrom(Currency.unwrap(_currency), _payer, address(this), _amount);
    }

    /**
     * Pulls `_amount` of `_currency` into the calling contract from `_payer`, reporting the amount
     * actually credited.
     *
     * @dev For an ARBITRARY token only. An imported memecoin is never screened for transfer fees,
     * so a pool can legitimately exist whose memecoin takes a cut on every transfer, and quoting
     * the requested amount would settle the shortfall out of balances held for OTHER pools.
     *
     * Paired tokens do NOT belong here: they are 1:1 by policy and use {pullFrom}, which does not
     * pay for a measurement that can never differ.
     *
     * @param _currency The currency to pull
     * @param _payer The address to pull from
     * @param _amount The amount requested
     * @param _value The native value forwarded into the current call (`msg.value`)
     *
     * @return credited_ The amount actually credited to the caller
     */
    function pullFromMeasured(
        Currency _currency,
        address _payer,
        uint _amount,
        uint _value
    ) internal returns (uint credited_) {
        if (_amount == 0) {
            return 0;
        }

        if (_currency.isAddressZero()) {
            if (_value < _amount) {
                revert InsufficientNativeValue();
            }
            return _amount;
        }

        uint balanceBefore = _currency.balanceOfSelf();
        SafeTransferLib.safeTransferFrom(Currency.unwrap(_currency), _payer, address(this), _amount);
        credited_ = _currency.balanceOfSelf() - balanceBefore;
    }

    /**
     * Pays `_amount` of the paired token `_token` to `_recipient`, applying the token's unwrap
     * policy from the registry:
     *
     * - native wrapper (flETH): unwrap to ETH and forward raw ETH.
     * - ERC20 wrapper (flUSDC): unwrap to the `underlying` ERC20 (USDC) and forward it.
     * - anything else (plain ERC20, raw native ETH, unregistered token): forward as-is.
     *
     * The unwrap is unconditional policy dispatch: the registry decides what each token unwraps
     * to, and a caller that wants to forward a token untouched uses {pay} instead.
     *
     * @dev Every registerable wrapper wraps 1:1 -- a native wrapper against ETH, and an ERC20
     * wrapper against an underlying whose decimals the registry pins equal to its own -- so the
     * unwrapped amount IS `_amount`. This used to bracket the withdraw with a balance snapshot and
     * forward the measured delta instead, purely to stay safe for a wrapper that was not 1:1. That
     * is not a shape the protocol admits, so the measurement bought nothing and cost two
     * `balanceOf` calls on every unwrapping payout.
     *
     * @param _registry The {PairedTokenRegistry} holding each token's unwrap policy
     * @param _token The wrapped paired token held by the caller
     * @param _recipient The recipient of the payout
     * @param _amount The amount of the wrapped token to pay out
     */
    function payout(
        IPairedTokenRegistry _registry,
        address _token,
        address _recipient,
        uint _amount
    ) internal {
        if (_amount == 0) {
            return;
        }

        IPairedTokenRegistry.PairedToken memory cfg = _registry.tokenConfig(_token);

        // Native-ETH wrapper (flETH): unwrap and forward the ETH. A registered wrapper unwraps
        // 1:1, so the withdraw delivers exactly `_amount` and there is nothing to measure.
        if (cfg.tokenType == IPairedTokenRegistry.PairedTokenType.NativeWrapper) {
            IWrappedToken(_token).withdraw(_amount);
            CurrencyLibrary.ADDRESS_ZERO.transfer(_recipient, _amount);
            return;
        }

        // ERC20-backed wrapper (flUSDC): unwrap to the underlying token (USDC) and forward it. The
        // registry pins `wrapper.decimals() == underlying.decimals()`, so the unwrap is 1:1 and
        // the amount delivered is exactly `_amount`.
        if (cfg.tokenType == IPairedTokenRegistry.PairedTokenType.Erc20Wrapper && cfg.underlying != address(0)) {
            IWrappedToken(_token).withdraw(_amount);
            Currency.wrap(cfg.underlying).transfer(_recipient, _amount);
            return;
        }

        // Unregistered / non-wrapper token (e.g. a memecoin referral fee), a plain ERC20 or raw
        // native ETH: forward as-is via the uniform currency transfer.
        Currency.wrap(_token).transfer(_recipient, _amount);
    }

    /**
     * The asset a {payout} of `_token` would actually deliver. The single source of truth for
     * every consumer that needs to KNOW the delivered asset (event fields, claim gating)
     * without moving it — mirroring {payout}'s dispatch exactly, so the two can never diverge.
     *
     * @param _registry The {PairedTokenRegistry} holding each token's unwrap policy
     * @param _token The paired token being paid out
     *
     * @return asset_ The asset the recipient would receive (`address(0)` = native ETH)
     */
    function payoutAsset(
        IPairedTokenRegistry _registry,
        address _token
    ) internal view returns (address asset_) {
        IPairedTokenRegistry.PairedToken memory cfg = _registry.tokenConfig(_token);

        if (cfg.tokenType == IPairedTokenRegistry.PairedTokenType.NativeWrapper) {
            return address(0);
        }

        if (cfg.tokenType == IPairedTokenRegistry.PairedTokenType.Erc20Wrapper && cfg.underlying != address(0)) {
            return cfg.underlying;
        }

        return _token;
    }

    /**
     * Whether a paired token of this shape is funded from ETH at launch (settled from
     * `msg.value`, wrapping if needed) rather than pulled from the payer with an allowance.
     * The single source of dispatch truth for the premine funding mode, shared by
     * {FlaunchLibrary} and {FlaunchZap} so they can never disagree.
     *
     * @param _tokenType The paired token's shape
     *
     * @return True for raw native ETH and native wrappers; false for every ERC20 shape
     */
    function isEthFunded(
        IPairedTokenRegistry.PairedTokenType _tokenType
    ) internal pure returns (bool) {
        return _tokenType == IPairedTokenRegistry.PairedTokenType.NativeEth
            || _tokenType == IPairedTokenRegistry.PairedTokenType.NativeWrapper;
    }

    /**
     * Pays `_amount` of `_currency` to `_recipient` with no unwrap — the uniform send for
     * native ETH and any ERC20. Reverts on failure; use {tryPay} for hostile recipients.
     *
     * @param _currency The currency to pay
     * @param _recipient The recipient of the payment
     * @param _amount The amount to pay
     */
    function pay(
        Currency _currency,
        address _recipient,
        uint _amount
    ) internal {
        if (_amount == 0) {
            return;
        }

        _currency.transfer(_recipient, _amount);
    }

    /**
     * Best-effort, gas-capped, non-reverting payment for recipients that may be hostile (a
     * reverting `receive()`, a gas-griefing fallback). The caller decides what to do with a
     * failed payment (escrow it, skip it) — funds are never lost, just not delivered.
     *
     * @param _currency The currency to pay
     * @param _recipient The recipient of the payment
     * @param _amount The amount to pay
     * @param _gasCap The maximum gas forwarded to the recipient / token call
     *
     * @return success_ Whether the payment was delivered
     */
    function tryPay(
        Currency _currency,
        address _recipient,
        uint _amount,
        uint _gasCap
    ) internal returns (bool success_) {
        if (_amount == 0) {
            return true;
        }

        if (_currency.isAddressZero()) {
            assembly ("memory-safe") {
                success_ := call(_gasCap, _recipient, _amount, 0, 0, 0, 0)
            }
            return success_;
        }

        // A codeless token cannot deliver anything; the raw call below would report success
        address token = Currency.unwrap(_currency);
        if (token.code.length == 0) {
            return false;
        }

        (bool ok, bytes memory data) = token.call{gas: _gasCap}(
            abi.encodeWithSignature('transfer(address,uint256)', _recipient, _amount)
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    /**
     * Wraps `_ethValue` of the caller's ETH into `_wrapper`.
     *
     * @dev A registered wrapper wraps 1:1, so the caller is credited exactly `_ethValue`. The
     * balance snapshot this used to take existed only for a fee-charging wrapper.
     *
     * @param _wrapper The native wrapper (e.g. flETH) to deposit into
     * @param _ethValue The ETH value to wrap
     */
    function wrap(
        address _wrapper,
        uint _ethValue
    ) internal {
        IWrappedToken(_wrapper).deposit{value: _ethValue}(0);
    }

    /**
     * Refunds the caller's `_currency` balance above `_balanceBefore` to `_recipient` — the
     * "snapshot / act / refund the delta" bracket used by swaps, premines and treasury
     * actions, expressed once.
     *
     * @param _currency The currency to refund
     * @param _balanceBefore The balance snapshot taken before acting (see {balanceExcludingValue})
     * @param _recipient The recipient of the refund
     *
     * @return refunded_ The amount refunded
     */
    function refundUnspentValue(
        Currency _currency,
        uint _balanceBefore,
        address _recipient
    ) internal returns (uint refunded_) {
        uint balance = _currency.balanceOfSelf();
        if (balance > _balanceBefore) {
            refunded_ = balance - _balanceBefore;
            _currency.transfer(_recipient, refunded_);
        }
    }

    /**
     * Grants `_spender` an allowance of `_amount` over the caller's `_token`, tolerating
     * non-standard ERC20s (USDT-style approval resets). A no-op for native ETH, which has no
     * allowance concept.
     *
     * @param _token The token to approve (`address(0)` = native ETH, no-op)
     * @param _spender The spender to approve
     * @param _amount The allowance to grant
     */
    function ensureAllowance(
        address _token,
        address _spender,
        uint _amount
    ) internal {
        if (_token == address(0)) {
            return;
        }

        SafeTransferLib.safeApproveWithRetry(_token, _spender, _amount);
    }

    /**
     * Clears `_spender`'s allowance over the caller's `_token`. A no-op for native ETH.
     *
     * @param _token The token to revoke (`address(0)` = native ETH, no-op)
     * @param _spender The spender to revoke
     */
    function revokeAllowance(
        address _token,
        address _spender
    ) internal {
        if (_token == address(0)) {
            return;
        }

        SafeTransferLib.safeApprove(_token, _spender, 0);
    }
}
