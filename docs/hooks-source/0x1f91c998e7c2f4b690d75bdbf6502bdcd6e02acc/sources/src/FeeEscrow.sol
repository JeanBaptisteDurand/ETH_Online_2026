// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FeeEscrow
/// @notice Pull-based ledger of trade fees. The launch hook takes each fee as an ERC-6909 claim minted to
///         this contract (balance-safe: no real transfer happens mid-swap) and records the per-recipient
///         split here. On `claimFor` or `claimTo`, this contract redeems the claim to real tokens.
///         Keeping fee custody in this minimal contract (not the hook or factory) shrinks the fund-holding
///         surface, and the pull model means one reverting recipient can never block distribution.
/// @dev    `currency == address(0)` denotes native currency (Uniswap v4's native sentinel). The only writer is
///         the hook; redemption is the only PoolManager interaction and nets to zero (burn 6909, take real).
contract FeeEscrow is IUnlockCallback, ReentrancyGuard {
    IPoolManager public immutable poolManager;

    /// @notice The only address allowed to credit balances: the launch hook.
    address public immutable hook;

    /// @notice recipient => currency (address(0) = native currency) => claimable balance.
    mapping(address recipient => mapping(address currency => uint256 claimableAmount)) public owed;

    error NotHook();
    error NotPoolManager();
    error NothingToClaim();
    error ZeroAddress();
    error ZeroDestination();

    event Credited(address indexed recipient, address indexed currency, uint256 amount);
    event Claimed(address indexed recipient, address indexed currency, address indexed destination, uint256 amount);

    constructor(IPoolManager poolManagerAddress, address launchHook) {
        if (
            address(poolManagerAddress) == address(0) || address(poolManagerAddress).code.length == 0
                || launchHook == address(0) || launchHook.code.length == 0
        ) revert ZeroAddress();
        poolManager = poolManagerAddress;
        hook = launchHook;
    }

    /// @notice Record a recipient's share. The matching ERC-6909 claim must already have been minted here by
    ///         the hook in the same transaction, so the redeemable balance always covers the sum of `owed`.
    function credit(address recipient, address currency, uint256 amount) external {
        if (msg.sender != hook) revert NotHook();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) return;
        owed[recipient][currency] += amount;
        emit Credited(recipient, currency, amount);
    }

    /// @notice Redeem and pay out everything owed to `recipient` in `currency`. Permissionless to trigger,
    ///         but funds always go to `recipient`. CEI: the balance is zeroed before the redemption.
    function claimFor(address recipient, address currency) external nonReentrant {
        _redeemTo(recipient, currency, recipient);
    }

    /// @notice Redeem the caller's own balance to a chosen address. Escape hatch for a recipient that cannot
    ///         receive a currency directly (e.g. a contract with no payable `receive` on a native-currency pool):
    ///         only the recipient can redirect its own balance, so this adds no new authority.
    function claimTo(address currency, address destination) external nonReentrant {
        if (destination == address(0)) revert ZeroDestination();
        _redeemTo(msg.sender, currency, destination);
    }

    /// @dev The single redemption path: zero the owner's balance (CEI), then unlock to pay `destination`.
    function _redeemTo(address balanceOwner, address currency, address destination) internal {
        uint256 amount = owed[balanceOwner][currency];
        if (amount == 0) revert NothingToClaim();
        owed[balanceOwner][currency] = 0;
        poolManager.unlock(abi.encode(destination, currency, amount));
        emit Claimed(balanceOwner, currency, destination, amount);
    }

    /// @notice Only reachable as the callback to this contract's own `unlock` (the PoolManager calls back the
    ///         address that called `unlock`), so `onlyPoolManager` fully gates it. Burns our ERC-6909 claim
    ///         (a positive currency delta) and takes the real tokens out to the recipient (netting to zero).
    function unlockCallback(bytes calldata callbackData) external returns (bytes memory result) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (address destination, address currencyAddress, uint256 amount) =
            abi.decode(callbackData, (address, address, uint256));
        Currency currency = Currency.wrap(currencyAddress);
        poolManager.burn(address(this), currency.toId(), amount);
        poolManager.take(currency, destination, amount);
        return "";
    }
}
