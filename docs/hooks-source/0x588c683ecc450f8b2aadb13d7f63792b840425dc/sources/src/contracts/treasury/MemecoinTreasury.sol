// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from '@solady/utils/Initializable.sol';
import {ReentrancyGuard} from '@solady/utils/ReentrancyGuard.sol';

import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolIdLibrary} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

import {PairedTokenLib} from '@flaunch/libraries/PairedTokenLib.sol';
import {PositionManager} from '@flaunch/PositionManager.sol';
import {TreasuryActionManager} from '@flaunch/treasury/ActionManager.sol';
import {MemecoinFinder} from '@flaunch/types/MemecoinFinder.sol';

import {IFeeEscrow} from '@flaunch-interfaces/IFeeEscrow.sol';
import {IMemecoinTreasury} from '@flaunch-interfaces/IMemecoinTreasury.sol';
import {ITreasuryAction} from '@flaunch-interfaces/ITreasuryAction.sol';

/**
 * Allows approved actions to be executed by the `PoolCreator` for their specific pool, using
 * tokens in their {MemecoinTreasury}.
 */
contract MemecoinTreasury is IMemecoinTreasury, Initializable, ReentrancyGuard {
    using MemecoinFinder for PoolKey;
    using PoolIdLibrary for PoolKey;

    /// The token this pool's memecoin is paired against (flETH, flUSDC, `address(0)` for a raw
    /// native-ETH pool, ...), on either hook type. Retains the historical `flETH` name for ABI
    /// stability; read it through {pairedToken} for clarity.
    address public flETH;

    /// The {TreasuryActionManager} contract that stores approved actions
    TreasuryActionManager public actionManager;

    /// The {PositionManager} that fees will be claimed from
    PositionManager public positionManager;

    /// The `PoolKey` that is attached to this {MemecoinTreasury}
    PoolKey public poolKey;

    /**
     * Sets the Flaunch {PositionManager} and the pool's paired token, and initializes with
     * the `PoolKey`.
     *
     * @param _positionManager The Flaunch {PositionManager} that launched this pool
     * @param _actionManager The {TreasuryActionManager} contract address
     * @param _flETH The token this pool's memecoin is paired against (see {flETH}; the
     * parameter retains the historical name for ABI stability)
     * @param _poolKey The pool that is being actioned against
     */
    function initialize(
        address payable _positionManager,
        address _actionManager,
        address _flETH,
        PoolKey memory _poolKey
    ) public initializer {
        actionManager = TreasuryActionManager(_actionManager);
        flETH = _flETH;
        poolKey = _poolKey;
        positionManager = PositionManager(_positionManager);
    }

    /**
     * Executes an approved {ITreasuryAction}.
     *
     * @dev Only to `PoolCreator` can make this call, otherwise reverted with `Unauthorized`
     *
     * @dev [VPT-3] Each pool leg is handed to the action in the form it can actually be moved in.
     * An ERC20 leg keeps the historical "approve max, the action pulls what it needs, reset after"
     * semantics. A raw native-ETH (`address(0)`) leg has no allowance to grant (the allowance
     * helpers no-op on it), so the native equivalent is to PUSH the treasury's whole ETH balance
     * to the action as call value and require it to hand back whatever it does not spend. Without
     * this, every route that pays a native pool's treasury (a {BidWall} close, a BidWall
     * reposition, the escrowed treasury fee) would accumulate in an immutable clone with no way out.
     *
     * @param _action The {ITreasuryAction} address to execute
     * @param _data Additional data that the {ITreasuryAction} may require
     */
    function executeAction(
        address _action,
        bytes memory _data
    ) public nonReentrant {
        // Ensure the action is approved
        if (!actionManager.approvedActions(_action)) {
            revert ActionNotApproved();
        }

        // Make sure the caller is the owner of the corresponding ERC721
        address poolCreator = _resolveCreator();
        if (poolCreator != msg.sender) {
            revert Unauthorized();
        }

        address token0 = Currency.unwrap(poolKey.currency0);
        address token1 = Currency.unwrap(poolKey.currency1);

        // Approve the ERC20 leg(s) to be used before execution. {PairedTokenLib.ensureAllowance}
        // tolerates an imported ERC20 with a non-standard `approve` (missing return value, or
        // requiring a reset-to-zero before re-approving) and no-ops a native leg, which has no
        // allowance to grant.
        bool nativeLeg = (token0 == address(0) || token1 == address(0));
        PairedTokenLib.ensureAllowance(token0, _action, type(uint).max);
        PairedTokenLib.ensureAllowance(token1, _action, type(uint).max);

        // Claim fees before executing, keeping as fleth to ensure full treasury balances. This MUST
        // run before the native balance is snapshotted below, or the just-claimed ETH is not
        // forwarded to the action and stays behind.
        claimFees();

        // The native mirror of the max ERC20 approval: hand the action the treasury's whole ETH
        // balance and let it take only what it needs. Zero for a fully-ERC20 pool, which keeps the
        // flETH and flUSDC paths byte-for-byte identical to a plain `execute()` call.
        uint nativeValue = nativeLeg ? address(this).balance : 0;

        // Snapshot the action's ETH so we can prove it kept none of what we forwarded. A per-call
        // delta (rather than an absolute balance) is used because actions are shared across pools
        // and may legitimately custody unrelated funds.
        uint actionNativeBefore = _action.balance;

        // Call the execute function on the action contract
        ITreasuryAction(_action).execute{value: nativeValue}(poolKey, _data);
        emit ActionExecuted(_action, poolKey, _data);

        // Unapprove the ERC20 leg(s) after execution; a native leg is again a no-op
        PairedTokenLib.revokeAllowance(token0, _action);
        PairedTokenLib.revokeAllowance(token1, _action);

        // The action must have spent or returned every wei; retained ETH would be a fresh sink in a
        // contract the creator does not control.
        if (_action.balance > actionNativeBefore) {
            revert UnreturnedNativeValue();
        }
    }

    /**
     * Resolves the creator (owner of the corresponding ERC721) that is authorized to execute
     * actions against this treasury. The native {MemecoinTreasury} resolves this directly from
     * the memecoin's `creator()`; the {AnyMemecoinTreasury} overrides this to resolve through
     * the Any manager, as an imported ERC20 may not implement `creator()`.
     *
     * @return The address authorized to execute actions on this treasury
     */
    function _resolveCreator() internal view virtual returns (address) {
        return poolKey.memecoin(flETH).creator();
    }

    /**
     * The token this pool's memecoin is paired against. Alias of {flETH} (which stores the
     * pool's paired token) exposed under a clearer name for treasury actions.
     *
     * @return The pool's paired token
     */
    function pairedToken() external view returns (address) {
        return flETH;
    }

    /**
     * Claims any pending fees allocated to the {MemecoinTreasury}. We do not unwrap the paired
     * token in our claim call to ensure that we keep two persisted tokens as per the {PoolKey}.
     *
     * @dev [VPT-1] The escrow is multi-token, so we name the pool's paired token ({flETH} stores
     * it for either hook type) and resolve the pool's authoritative {FeeEscrow} snapshot rather
     * than assuming a global escrow.
     *
     * @dev This call does not require protection and can be called by anyone
     */
    function claimFees() public {
        IFeeEscrow(_resolveTreasuryFeeEscrow()).withdrawFees(flETH, address(this), false);
    }

    /**
     * Resolves the {FeeEscrow} this pool's fees actually sit in: the pool's launch-time snapshot
     * escrow, read from the hook that launched it. Both hook types ({PositionManager} and
     * {AnyPositionManager}) expose `pairedTokenFeeEscrow`, and a treasury's pool is launched by
     * construction — `initialize` is only ever called from the hook's launch flow — so the getter
     * can be called directly rather than probing for its existence.
     *
     * @dev The call is deliberately UNCAUGHT: `pairedTokenFeeEscrow` reverts
     * `MissingPairedTokenEscrow` for a launched pool whose snapshot escrow is zero. Swallowing
     * that revert would fail OPEN and route funds into an escrow they were never deposited to —
     * exactly what the revert exists to prevent.
     *
     * @return escrow_ The {FeeEscrow} holding this pool's escrowed fees
     */
    function _resolveTreasuryFeeEscrow() internal view returns (address escrow_) {
        return positionManager.pairedTokenFeeEscrow(poolKey.toId());
    }

    /**
     * Allows the contract to receive ETH when withdrawn from the flETH token, when a raw native-ETH
     * pool routes value here (a {BidWall} close / reposition, a native {FeeEscrow} claim), and when
     * an action pushes back the unspent portion of the value forwarded by {executeAction}.
     */
    receive() external payable {}
}
