// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IMsgSender} from "@uniswap/v4-periphery/src/interfaces/IMsgSender.sol";

interface ISignedRouteContext {
    function signedRouteContext() external view returns (address signer, bytes32 intent, bytes32 data);
}

interface IFlashProtocolOwner {
    function owner() external view returns (address);
}

/// @notice Pool-local administration. Existing deposits remain keyed to their
///         depositor; transferring admin changes only future fee attribution.
contract FlashPoolAdmin {
    error NotHook();
    error NotAdmin();
    error AlreadyInitialized();
    error ZeroAddress();
    error InvalidContextSource();
    error NotOwner();

    address public immutable hook;
    mapping(bytes32 poolId => address) public adminOf;
    mapping(address account => bool) public keeper;
    mapping(address source => bytes32 codehash) public contextCodehash;
    mapping(address source => bool signedContext) public signedContextSource;

    event PoolAdminInitialized(bytes32 indexed poolId, address indexed admin);
    event PoolAdminTransferred(bytes32 indexed poolId, address indexed oldAdmin, address indexed newAdmin);
    event ContextSourceSet(address indexed source, bytes32 indexed codehash, bool signedContext);
    event KeeperSet(address indexed account, bool allowed);

    constructor(address hook_) {
        if (hook_ == address(0)) revert ZeroAddress();
        hook = hook_;
    }

    /// @dev `initializeCaller` is the direct caller reported by PoolManager.
    ///      No tx.origin or EOA-only rule is used, preserving AA/EIP-7702.
    function initializeAdmin(bytes32 poolId, address initializeCaller) external {
        if (msg.sender != hook) revert NotHook();
        if (initializeCaller == address(0)) revert ZeroAddress();
        if (adminOf[poolId] != address(0)) revert AlreadyInitialized();
        adminOf[poolId] = initializeCaller;
        emit PoolAdminInitialized(poolId, initializeCaller);
    }

    function transferAdmin(bytes32 poolId, address newAdmin) external {
        address oldAdmin = adminOf[poolId];
        if (msg.sender != oldAdmin) revert NotAdmin();
        if (newAdmin == address(0)) revert ZeroAddress();
        adminOf[poolId] = newAdmin;
        emit PoolAdminTransferred(poolId, oldAdmin, newAdmin);
    }

    /// @notice Protocol keepers are independent from pool administration.
    /// Only the immutable hook's protocol owner can change this allowlist.
    function setKeeper(address account, bool allowed) external {
        if (msg.sender != IFlashProtocolOwner(hook).owner()) revert NotOwner();
        if (account == address(0)) revert ZeroAddress();
        keeper[account] = allowed;
        emit KeeperSet(account, allowed);
    }

    /// @notice Authorizes a v4 periphery contract only as a source of original
    ///         caller context. It does not authorize or exempt the contract's
    ///         swaps. The runtime codehash is pinned so a replaced contract
    ///         fails closed instead of inheriting identity authority.
    function setContextSource(address source, bool allowed, bool signedContext) external {
        if (msg.sender != hook) revert NotHook();
        if (source == address(0)) revert ZeroAddress();
        bytes32 hash;
        assembly ("memory-safe") {
            hash := extcodehash(source)
        }
        if (allowed && (hash == bytes32(0) || hash == keccak256(""))) revert InvalidContextSource();
        // Validate the explicitly selected ABI once during owner configuration.
        // Live swaps then make exactly one known-good call and never probe a
        // missing selector through try/catch.
        if (allowed) {
            if (signedContext) ISignedRouteContext(source).signedRouteContext();
            else IMsgSender(source).msgSender();
        }
        contextCodehash[source] = allowed ? hash : bytes32(0);
        signedContextSource[source] = allowed && signedContext;
        emit ContextSourceSet(source, allowed ? hash : bytes32(0), allowed && signedContext);
    }

    /// @notice Returns whether the actual v4 swap initiator is this pool's
    ///         current admin. Unknown direct PoolManager callers are compared
    ///         as themselves and can never spoof an approved router context.
    /// @dev The hook calls this only from an only-PoolManager callback. That,
    ///      plus the pinned callback `sender`, satisfies Universal Router's
    ///      signedRouteContext authentication requirement.
    function isAdminSwapper(bytes32 poolId, address sender) external view returns (bool) {
        if (msg.sender != hook) revert NotHook();
        return _resolve(sender) == adminOf[poolId];
    }

    /// @notice Resolves the authenticated original v4 initiator, then checks
    /// the owner-managed keeper allowlist. A router is never exempt globally.
    function isKeeperSwapper(address sender) external view returns (bool) {
        if (msg.sender != hook) revert NotHook();
        return keeper[_resolve(sender)];
    }

    function _resolve(address sender) private view returns (address actual) {
        actual = sender;
        bytes32 trustedHash = contextCodehash[sender];
        if (trustedHash != bytes32(0)) {
            bytes32 currentHash;
            assembly ("memory-safe") {
                currentHash := extcodehash(sender)
            }
            if (currentHash != trustedHash) return address(0);

            if (signedContextSource[sender]) {
                (address signer,,) = ISignedRouteContext(sender).signedRouteContext();
                actual = signer == address(0) ? IMsgSender(sender).msgSender() : signer;
            } else {
                actual = IMsgSender(sender).msgSender();
            }
        }
    }
}
