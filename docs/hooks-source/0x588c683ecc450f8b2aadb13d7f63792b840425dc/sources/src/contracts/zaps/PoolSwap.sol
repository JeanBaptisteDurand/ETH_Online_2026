// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IMsgSender} from '@uniswap-periphery/interfaces/IMsgSender.sol';
import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {IUnlockCallback} from '@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol';
import {Hooks, IHooks} from '@uniswap/v4-core/src/libraries/Hooks.sol';
import {TransientStateLibrary} from '@uniswap/v4-core/src/libraries/TransientStateLibrary.sol';
import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency, CurrencyLibrary} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';

import {CurrencySettler} from '@flaunch/libraries/CurrencySettler.sol';

/**
 * Handles swaps against Uniswap V4 pools.
 *
 * @dev Copied from the `v4-core` `PoolSwapTest.sol` contract and simplified to suit Flaunch
 * requirements.
 */
contract PoolSwap is IUnlockCallback, IMsgSender {
    using CurrencySettler for Currency;
    using Hooks for IHooks;
    using TransientStateLibrary for IPoolManager;

    /// Transient slot holding the account that initiated the in-flight swap. Named after the
    /// Universal Router's `msgSender()` so hooks can resolve the original swapper through either
    /// router with one interface. bytes32(uint(keccak256('flaunch.PoolSwap.msgSender')) - 1)
    bytes32 internal constant MSG_SENDER_SLOT = 0x00a2dae0085533e0c869f805c5929b2637f2edeffc67a25b0e005b29cfd1bd0e;

    /**
     * Stores information to be passed back when unlocking the callback.
     *
     * @member sender The sender of the swap
     * @member key The poolKey being swapped against
     * @member params Swap parameters
     * @member hookData Arbitrary data passed to the pool's hook
     */
    struct CallbackData {
        address sender;
        PoolKey key;
        SwapParams params;
        bytes hookData;
    }

    /// The Uniswap V4 {PoolManager} contract
    IPoolManager public immutable manager;

    /**
     * Register our Uniswap V4 {PoolManager}.
     *
     * @param _manager The Uniswap V4 {PoolManager}
     */
    constructor(
        IPoolManager _manager
    ) {
        manager = _manager;
    }

    /**
     * Publishes the swap initiator for the duration of the wrapped call, then clears it. Carried
     * by exactly the overloads that call `manager.unlock` directly, so `msgSender()` answers for
     * precisely as long as the hook chain runs and never doubles up through internal delegation.
     */
    modifier setMsgSender() {
        // Save-and-restore rather than clear: a bare clear would let any future nested frame
        // (a second unlock bracket, or work performed after `manager.unlock` that re-enters a
        // swap overload) zero its PARENT's published initiator. Today the nesting is unreachable
        // — v4 reverts a nested unlock and the only post-unlock external call is the native
        // refund — but the invariant should not depend on that staying true. At the top level
        // `prior` is zero, so the slot still always ends empty for the transaction.
        //
        // Read the slot raw rather than through {msgSender}: that getter is virtual, and an
        // override must not be able to change (or break) the bracket's bookkeeping.
        address prior;
        assembly {
            prior := tload(MSG_SENDER_SLOT)
        }
        _storeMsgSender();
        _;
        _restoreMsgSender(prior);
    }

    /**
     * Actions a swap using the SwapParams provided against the PoolKey without a referrer.
     *
     * @param _key The PoolKey to swap against
     * @param _params The parameters for the swap
     *
     * @return The BalanceDelta of the swap
     */
    function swap(
        PoolKey memory _key,
        SwapParams memory _params
    ) public payable virtual returns (BalanceDelta) {
        // Delegates to the referrer overload, which carries the {setMsgSender} modifier
        return swap(_key, _params, address(0));
    }

    /**
     * Actions a swap using the SwapParams provided against the PoolKey with a referrer.
     *
     * @dev The {setMsgSender} modifier publishes the initiator to hooks for the unlock's duration
     *
     * @param _key The PoolKey to swap against
     * @param _params The parameters for the swap
     * @param _referrer The referrer of the swap
     *
     * @return delta_ The BalanceDelta of the swap
     */
    function swap(
        PoolKey memory _key,
        SwapParams memory _params,
        address _referrer
    ) public payable virtual setMsgSender returns (BalanceDelta delta_) {
        uint nativeBefore = _nativeBalanceExcludingValue();

        delta_ = abi.decode(
            manager.unlock(
                abi.encode(CallbackData(msg.sender, _key, _params, _referrer == address(0) ? bytes('') : abi.encode(_referrer)))
            ),
            (BalanceDelta)
        );

        _refundNative(nativeBefore);
    }

    /**
     * Actions a swap using the SwapParams provided against the PoolKey with hook data.
     *
     * @dev The {setMsgSender} modifier publishes the initiator to hooks for the unlock's duration
     *
     * @param _key The PoolKey to swap against
     * @param _params The parameters for the swap
     * @param _hookData Arbitrary data passed to the pool's hook
     *
     * @return delta_ The BalanceDelta of the swap
     */
    function swap(
        PoolKey memory _key,
        SwapParams memory _params,
        bytes memory _hookData
    ) public payable virtual setMsgSender returns (BalanceDelta delta_) {
        uint nativeBefore = _nativeBalanceExcludingValue();

        delta_ = abi.decode(manager.unlock(abi.encode(CallbackData(msg.sender, _key, _params, _hookData))), (BalanceDelta));

        _refundNative(nativeBefore);
    }

    /**
     * This contract's ETH holdings prior to the value forwarded into the current call, used as the
     * baseline for the post-swap refund.
     *
     * @return The ETH balance excluding `msg.value`
     */
    function _nativeBalanceExcludingValue() internal view returns (uint) {
        return address(this).balance - msg.value;
    }

    /**
     * Returns any ETH the swap did not settle to the caller.
     *
     * @dev A native-currency swap settles out of this contract's own balance (see
     * {CurrencySettler.settle}, which calls `manager.settle{value: amount}`), so a caller that
     * forwards more than the swap consumes would otherwise leave the excess here — where the NEXT
     * caller's settle would silently spend it. Refunding against a pre-call baseline returns only
     * the current caller's unspent value and never touches an unrelated residual.
     *
     * @param _nativeBefore The ETH balance held before `msg.value` arrived
     */
    function _refundNative(
        uint _nativeBefore
    ) internal {
        uint balance = address(this).balance;
        if (balance > _nativeBefore) {
            CurrencyLibrary.ADDRESS_ZERO.transfer(msg.sender, balance - _nativeBefore);
        }
    }

    /**
     * The account that initiated the swap currently executing inside the {PoolManager} unlock.
     * Outside that window the slot is empty and this returns the zero address, so a stale value
     * can never satisfy a hook's buyer binding (a zero router entry is never approved).
     *
     * @return sender_ The original caller of the in-flight swap, or zero at rest
     */
    function msgSender() public view virtual returns (address sender_) {
        assembly {
            sender_ := tload(MSG_SENDER_SLOT)
        }
    }

    /**
     * Records the swap initiator for the duration of the unlock round-trip. Transient storage
     * survives only the transaction, and {setMsgSender} restores the prior value before control
     * returns to the caller, so the value is readable exactly while this frame's hook chain runs.
     */
    function _storeMsgSender() internal {
        assembly {
            tstore(MSG_SENDER_SLOT, caller())
        }
    }

    function _restoreMsgSender(
        address _prior
    ) internal {
        assembly {
            tstore(MSG_SENDER_SLOT, _prior)
        }
    }

    /**
     * Performs the swap call using information from the CallbackData.
     */
    function unlockCallback(
        bytes calldata rawData
    ) external returns (bytes memory) {
        // Ensure that the {PoolManager} has sent the message
        require(msg.sender == address(manager));

        // Decode our CallbackData
        CallbackData memory data = abi.decode(rawData, (CallbackData));

        int deltaBefore0 = manager.currencyDelta(address(this), data.key.currency0);
        int deltaBefore1 = manager.currencyDelta(address(this), data.key.currency1);

        require(deltaBefore0 == 0, 'deltaBefore0 is not equal to 0');
        require(deltaBefore1 == 0, 'deltaBefore1 is not equal to 0');

        // Action the swap
        BalanceDelta delta = manager.swap({key: data.key, params: data.params, hookData: data.hookData});

        int deltaAfter0 = manager.currencyDelta(address(this), data.key.currency0);
        int deltaAfter1 = manager.currencyDelta(address(this), data.key.currency1);

        // Sense checking of the request for safety
        if (data.params.zeroForOne) {
            if (data.params.amountSpecified < 0) {
                // exact input, 0 for 1
                require(
                    deltaAfter0 >= data.params.amountSpecified, 'deltaAfter0 is not greater than or equal to data.params.amountSpecified'
                );
                require(delta.amount0() == deltaAfter0, 'delta.amount0() is not equal to deltaAfter0');
                require(deltaAfter1 >= 0, 'deltaAfter1 is not greater than or equal to 0');
            } else {
                // exact output, 0 for 1
                require(deltaAfter0 <= 0, 'deltaAfter0 is not less than or equal to zero');
                require(delta.amount1() == deltaAfter1, 'delta.amount1() is not equal to deltaAfter1');
                require(deltaAfter1 <= data.params.amountSpecified, 'deltaAfter1 is not less than or equal to data.params.amountSpecified');
            }
        } else {
            if (data.params.amountSpecified < 0) {
                // exact input, 1 for 0
                require(
                    deltaAfter1 >= data.params.amountSpecified, 'deltaAfter1 is not greater than or equal to data.params.amountSpecified'
                );
                require(delta.amount1() == deltaAfter1, 'delta.amount1() is not equal to deltaAfter1');
                require(deltaAfter0 >= 0, 'deltaAfter0 is not greater than or equal to 0');
            } else {
                // exact output, 1 for 0
                require(deltaAfter1 <= 0, 'deltaAfter1 is not less than or equal to 0');
                require(delta.amount0() == deltaAfter0, 'delta.amount0() is not equal to deltaAfter0');
                require(deltaAfter0 <= data.params.amountSpecified, 'deltaAfter0 is not less than or equal to data.params.amountSpecified');
            }
        }

        // A native leg settles out of this contract's own balance (the caller's forwarded
        // `msg.value`; the surplus is refunded after the unlock), so the payer is explicitly this
        // contract — {CurrencySettler} rejects anything else. An ERC20 leg pulls from the caller.
        if (deltaAfter0 < 0) {
            data.key.currency0.settle(manager, data.key.currency0.isAddressZero() ? address(this) : data.sender, uint(-deltaAfter0), false);
        }
        if (deltaAfter1 < 0) {
            data.key.currency1.settle(manager, data.key.currency1.isAddressZero() ? address(this) : data.sender, uint(-deltaAfter1), false);
        }
        if (deltaAfter0 > 0) {
            data.key.currency0.take(manager, data.sender, uint(deltaAfter0), false);
        }
        if (deltaAfter1 > 0) {
            data.key.currency1.take(manager, data.sender, uint(deltaAfter1), false);
        }

        return abi.encode(delta);
    }
}
