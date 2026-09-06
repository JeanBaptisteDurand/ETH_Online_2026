// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from '@solady/auth/Ownable.sol';

import {EnumerableSet} from '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';

import {INotifier} from '@flaunch-interfaces/INotifier.sol';
import {ISubscriber} from '@flaunch-interfaces/ISubscriber.sol';

/**
 * Notifier is used to opt in to sending updates to external contracts about position modifications
 * against a managed pool.
 */
contract Notifier is INotifier, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// The maximum number of subscribers that can be registered at once. This bounds the
    /// `notifySubscribers` loop so it cannot grow unbounded and exhaust the gas available to
    /// every state-changing protocol op that routes through it.
    uint public constant MAX_SUBSCRIBERS = 100;

    /// The maximum number of revert-reason bytes copied out of (and logged for) a failing
    /// subscriber. Without a cap a subscriber can size its revert payload from `gasleft()`, and the
    /// caller pays for it twice — quadratic memory expansion on the `returndatacopy`, then 8 gas
    /// per byte to log it — out of the 1/64 of gas EIP-150 leaves the caller. That is enough to
    /// exhaust ANY gas budget and so halt every swap, launch and liquidity change on the pool. A
    /// short prefix is all a `NotifyFailed` consumer needs to identify the failure.
    uint internal constant MAX_REVERT_REASON_BYTES = 256;

    /// Store a list of subscribed contracts
    EnumerableSet.AddressSet internal subscribers;

    /// Store the {PositionManager} that created this contract
    address internal _positionManager;

    /**
     * Registers the caller as the contract owner.
     *
     * @param _protocolOwner The initial EOA owner of the contract
     */
    constructor(
        address _protocolOwner
    ) {
        _positionManager = msg.sender;

        // Grant ownership permissions to the caller
        _initializeOwner(_protocolOwner);
    }

    /**
     * Subscribes a contract to receive updates regarding pool modifications.
     *
     * @param _subscriber The address of the contract being subscribed
     * @param _data Any data passed to subscription call
     */
    function subscribe(
        address _subscriber,
        bytes calldata _data
    ) public onlyOwner {
        // Ensure we cannot exceed our upper bound of subscribers, keeping the
        // `notifySubscribers` loop gas-bounded. Allow idempotent re-subscriptions.
        if (!subscribers.contains(_subscriber) && subscribers.length() >= MAX_SUBSCRIBERS) {
            revert TooManySubscribers();
        }

        // Add the subscriber to our array, which returns true if address is not already
        // present in our EnumerableSet.
        if (subscribers.add(_subscriber)) {
            // Check if we receive a success response. If not, we cannot subscribe the address
            if (!ISubscriber(_subscriber).subscribe(_data)) {
                revert SubscriptionReverted();
            }

            emit Subscription(_subscriber);
        }
    }

    /**
     * Removes a subscriber based on the index they were stored at.
     *
     * @param _subscriber The address of the subscriber to unsubscribe
     */
    function unsubscribe(
        address _subscriber
    ) public onlyOwner {
        // If we have referenced an empty index, prevent futher processing
        if (!subscribers.contains(_subscriber)) {
            return;
        }

        // Delete our subscriber by the index
        subscribers.remove(_subscriber);

        // Unsubscribe our subscriber, catching the revert in case the contract has become corrupted
        try ISubscriber(_subscriber).unsubscribe() {} catch {}
        emit Unsubscription(_subscriber);
    }

    /**
     * Send our pool modification notification to all subscribers.
     *
     * @param _poolId The PoolId that was modified
     */
    function notifySubscribers(
        PoolId _poolId,
        bytes4 _key,
        bytes calldata _data
    ) public {
        // Ensure that the {PositionManager} sent this notification
        require(msg.sender == _positionManager);

        // Encode the notification once; every subscriber receives identical calldata
        bytes memory payload = abi.encodeCall(ISubscriber.notify, (_poolId, _key, _data));

        // Iterate over all subscribers to pass on data
        uint subscribersLength = subscribers.length();
        for (uint i; i < subscribersLength; ++i) {
            // Catch any revert so a single misbehaving subscriber cannot brick the protocol op
            // (swap/launch/liquidity) that triggered this notification. Successful notifications
            // are unaffected.
            address subscriber = subscribers.at(i);

            (bool success, bytes memory reason) = _notify(subscriber, payload);
            if (!success) {
                emit NotifyFailed(subscriber, reason);
            }
        }
    }

    /**
     * Delivers one notification, capturing at most {MAX_REVERT_REASON_BYTES} of any revert reason.
     *
     * @dev A Solidity `try/catch (bytes memory reason)` compiles to an UNBOUNDED `returndatacopy`,
     * which is precisely the primitive this contract must not hand to a subscriber: the notify
     * happens inside `afterInitialize` / `afterSwap` / `afterAddLiquidity` /
     * `afterRemoveLiquidity`, so a subscriber returning megabytes of revert data can burn the
     * caller's remaining gas and revert every one of those operations for the whole
     * {PositionManager}. The call is therefore made in assembly so the copy — and with it the
     * memory-expansion cost and the 8-gas-per-byte log cost — is bounded by a constant, regardless
     * of how much the subscriber returns.
     *
     * @param _subscriber The subscriber being notified
     * @param _payload The pre-encoded `notify` calldata
     *
     * @return success_ Whether the subscriber accepted the notification
     * @return reason_ The (truncated) revert reason when it did not
     */
    function _notify(
        address _subscriber,
        bytes memory _payload
    ) internal returns (bool success_, bytes memory reason_) {
        // A raw `call` to an address with no code succeeds, whereas the high-level call this
        // replaces reverted. Preserve that behaviour so a self-destructed subscriber is still
        // reported as a failure rather than silently treated as notified.
        if (_subscriber.code.length == 0) {
            return (false, '');
        }

        uint maxReasonBytes = MAX_REVERT_REASON_BYTES;

        assembly {
            success_ := call(gas(), _subscriber, 0, add(_payload, 0x20), mload(_payload), 0, 0)

            // Copy at most `maxReasonBytes` of the returndata, leaving the rest uncharged for
            let size := returndatasize()
            if gt(size, maxReasonBytes) { size := maxReasonBytes }

            // Allocate the truncated reason at the free memory pointer and advance it
            reason_ := mload(0x40)
            mstore(reason_, size)
            returndatacopy(add(reason_, 0x20), 0, size)
            mstore(0x40, add(add(reason_, 0x20), and(add(size, 0x1f), not(0x1f))))
        }
    }
}
