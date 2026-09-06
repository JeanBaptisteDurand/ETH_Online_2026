// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from '@solady/auth/Ownable.sol';

import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';

import {PairedTokenLib} from '@flaunch/libraries/PairedTokenLib.sol';

import {IFeeEscrow} from '@flaunch-interfaces/IFeeEscrow.sol';
import {IIndexerSubscriber} from '@flaunch-interfaces/IIndexerSubscriber.sol';
import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';

/**
 * Escrow contract that receives fees from multiple PositionManagers, allowing each recipient to
 * withdraw them in a single transaction.
 *
 * A single instance escrows EVERY paired token: the token is named per allocation and balances
 * are held per (recipient, token). Deposits are self-securing regardless of the caller — a
 * native allocation must deliver its exact `msg.value`, and an ERC20 allocation is pulled from
 * the caller with the full amount moving or the transfer reverting (every approved paired token
 * is 1:1 by policy; nothing here measures for one that is not) — and balances are booked per
 * token, so one token's books can never be settled out of another token's holdings.
 *
 * That argument covers the DEPOSIT path only: the withdrawal path crosses tokens by
 * construction, because unwrapping a wrapper debits the balance of one asset and delivers a
 * DIFFERENT one. CEI is respected on the ledger — {_withdrawFees} zeroes the balance before
 * paying out — and the 1:1 delivery itself is a registry admission guarantee, not a runtime
 * assertion: {PairedTokenRegistry.approvePairedToken} only admits direct tokens and wrappers
 * that unwrap 1:1, and {PairedTokenLib.payout} quotes the debited amount without measuring
 * what the wrapper actually delivered.
 */
contract FeeEscrow is IFeeEscrow, Ownable {
    /// The paired-token registry used to resolve each token's unwrap policy on withdrawal.
    /// A constructor binding: an unwired (registry-less) escrow state is unconstructible, so no
    /// legacy fallback path exists.
    IPairedTokenRegistry public immutable pairedTokenRegistry;

    /// The {IndexerSubscriber} subscriber
    IIndexerSubscriber public indexer;

    /// Maps a user to the balance available to claim, per escrowed token
    mapping(address _recipient => mapping(address _token => uint _amount)) public balances;

    /// Maps the total fees that a PoolId has accrued, per escrowed token. The token key is
    /// load-bearing: `allocateFees` is permissionless, so a pool-only figure could be inflated
    /// for free with a worthless self-minted token. Keyed per token, junk lands under its own
    /// token and is invisible to any consumer reading the pool's actual paired token.
    mapping(PoolId _poolId => mapping(address _token => uint _amount)) public totalFeesAllocated;

    /**
     * Constructor to initialize the registry binding and the indexer.
     *
     * @param _pairedTokenRegistry The {PairedTokenRegistry} resolving unwrap policies
     * @param _indexer The {IndexerSubscriber} contract address
     */
    constructor(
        address _pairedTokenRegistry,
        address _indexer
    ) {
        if (_pairedTokenRegistry == address(0)) {
            revert RegistryZeroAddress();
        }
        if (_indexer == address(0)) {
            revert IndexerZeroAddress();
        }

        pairedTokenRegistry = IPairedTokenRegistry(_pairedTokenRegistry);
        indexer = IIndexerSubscriber(_indexer);

        _initializeOwner(msg.sender);
    }

    /**
     * Allows a deposit to be made against a user. The amount is stored within the
     * escrow contract to be claimed later.
     *
     * @param _poolId The PoolId that the deposit came from
     * @param _token The token being escrowed (`address(0)` for raw native ETH)
     * @param _recipient The recipient of the transferred token
     * @param _amount The amount of the token to be transferred
     */
    function allocateFees(
        PoolId _poolId,
        address _token,
        address _recipient,
        uint _amount
    ) external payable {
        // If we don't have fees to allocate, exit early. A native caller must not send value on
        // a no-op, or it would be trapped here.
        if (_amount == 0) {
            if (msg.value != 0) revert IncorrectNativeDeposit();
            return;
        }

        // Ensure we aren't trying to allocate fees to a zero address
        if (_recipient == address(0)) {
            revert RecipientZeroAddress();
        }

        // Secure the funds BEFORE any balance is credited. `_token` is caller-supplied, so the
        // pull below can execute arbitrary token code; crediting first would let a reentrant
        // token withdraw against a credit whose backing has not yet arrived.
        if (_token == address(0)) {
            // Native-ETH allocation: the fee arrives as `msg.value` with this call.
            if (msg.value != _amount) revert IncorrectNativeDeposit();
        } else {
            // ERC20 allocation: pull the fee from the caller; reject stray ETH. The recipient's
            // balance is credited with `_amount` below, which matches the holdings because every
            // approved paired token is 1:1 by policy: the pull moves the full amount or reverts
            // inside `safeTransferFrom`. The credited-delta check that used to assert this went
            // with the rest of the non-1:1 handling — a non-1:1 token would now quietly under-back
            // its own (recipient, token) key, and `approvePairedToken` is the gate that keeps such
            // a token out of every value-bearing flow.
            if (msg.value != 0) revert IncorrectNativeDeposit();
            PairedTokenLib.pullFrom(Currency.wrap(_token), msg.sender, _amount, 0);
        }

        // Increase the balance available for the recipient to claim
        balances[_recipient][_token] += _amount;

        // Increase the fee tracking for the PoolId, only if the recipient matches the PoolId
        // that has also been passed in. This will prevent users from being misallocated and
        // external contracts that depend on this figure from being misinformed.
        (address flaunch,,, uint tokenId) = indexer.poolIndex(_poolId);
        if (tokenId != 0 && IERC721(flaunch).ownerOf(tokenId) == _recipient) {
            totalFeesAllocated[_poolId][_token] += _amount;
        }

        emit Deposit(_poolId, _recipient, _token, _amount);
    }

    /**
     * Allows fees to be withdrawn from an escrowed fee position in a single token.
     *
     * @param _token The escrowed token to withdraw (`address(0)` for raw native ETH)
     * @param _recipient The recipient of the holder's withdraw
     * @param _unwrap If we want to unwrap the balance into the escrow token's underlying
     * asset (ETH for flETH, USDC for flUSDC)
     */
    function withdrawFees(
        address _token,
        address _recipient,
        bool _unwrap
    ) public {
        _withdrawFees(_token, _recipient, _unwrap);
    }

    /**
     * Allows fees to be withdrawn across multiple escrowed tokens in a single transaction.
     *
     * @dev Duplicate or zero-balance entries are harmless no-ops: each token's balance is zeroed
     * before its payout, so a repeated entry finds nothing left to claim.
     *
     * @param _tokens The escrowed tokens to withdraw (`address(0)` for raw native ETH)
     * @param _recipient The recipient of the holder's withdraws
     * @param _unwrap If we want to unwrap each balance into its token's underlying asset
     */
    function withdrawFees(
        address[] calldata _tokens,
        address _recipient,
        bool _unwrap
    ) external {
        for (uint i; i < _tokens.length; ++i) {
            _withdrawFees(_tokens[i], _recipient, _unwrap);
        }
    }

    /**
     * Withdraws the sender's full balance of a single escrowed token.
     *
     * @param _token The escrowed token to withdraw
     * @param _recipient The recipient of the withdraw
     * @param _unwrap If the balance should be unwrapped via the registry's policy
     */
    function _withdrawFees(
        address _token,
        address _recipient,
        bool _unwrap
    ) internal {
        // Get the amount of the token that is stored in escrow
        uint amount = balances[msg.sender][_token];

        // If there are no fees to withdraw, exit early
        if (amount == 0) {
            return;
        }

        // Reset our user's balance to prevent reentry
        balances[msg.sender][_token] = 0;

        if (_unwrap) {
            // Unwrap the token to its underlying asset (ETH for flETH, USDC for flUSDC) via the
            // registry's policy. The event carries both the escrow-token KEY (the balance that was
            // zeroed) and the delivered asset: {payoutAsset} mirrors the payout dispatch exactly,
            // so the latter always names what was actually delivered — including a plain or
            // never-registered ERC20 forwarded as-is, which is labelled with the token itself
            // rather than the native-ETH marker.
            PairedTokenLib.payout(pairedTokenRegistry, _token, _recipient, amount);
            emit Withdrawal(msg.sender, _recipient, _token, PairedTokenLib.payoutAsset(pairedTokenRegistry, _token), amount);
        }
        // Transfer the token without unwrapping. The library's uniform send handles an ERC20 and
        // raw native ETH (`_token == address(0)`) alike.
        else {
            PairedTokenLib.pay(Currency.wrap(_token), _recipient, amount);
            emit Withdrawal(msg.sender, _recipient, _token, _token, amount);
        }
    }

    /**
     * Allows the owner to update the {IndexerSubscriber}.
     *
     * @param _indexer The new {IndexerSubscriber} contract address
     */
    function setIndexer(
        address _indexer
    ) public onlyOwner {
        if (_indexer == address(0)) {
            revert IndexerZeroAddress();
        }

        indexer = IIndexerSubscriber(_indexer);
    }

    /**
     * Allows the contract to receive ETH: transiently when a native wrapper (e.g. flETH) is
     * unwrapped during a withdraw, and durably for raw native-ETH allocations, which the escrow
     * holds directly.
     */
    receive() external payable {}
}
