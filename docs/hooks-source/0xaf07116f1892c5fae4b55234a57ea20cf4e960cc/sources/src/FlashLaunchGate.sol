// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IFlashTokenWhitelist {
    function whitelistedTokenHash(address token) external view returns (bytes32);
}

/// @title FlashLaunchGate
/// @notice Launch policy kept outside the hook so launchers can be audited and
///         replaced without adding routing code to the swap callback.
/// @dev A "permissionless" launch still has to pass through an approved safe
///      launcher. The irreversible switch changes who may USE those launchers;
///      it never permits arbitrary token contracts or arbitrary callers to
///      initialize a FLASH main pool directly.
contract FlashLaunchGate {
    error NotOwner();
    error NotHook();
    error ZeroAddress();
    error HookAlreadySet();
    error UnsafeLauncher();
    error LauncherClosed();
    error ProxyTokenForbidden();

    /// @notice Permanent governance identity, matching the immutable hook
    /// owner. Only the treasury revenue destination is rotatable.
    address public immutable owner;
    address public hook;
    bool public permissionlessMainLaunch;

    mapping(address launcher => bool) public safeLauncher;
    mapping(address creator => bool) public launchAllowlist;

    event HookSet(address indexed hook);
    event SafeLauncherSet(address indexed launcher, bool allowed);
    event CreatorAllowlistSet(address indexed creator, bool allowed);
    event PermissionlessMainLaunchEnabled();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setHookOnce(address newHook) external onlyOwner {
        if (newHook == address(0)) revert ZeroAddress();
        if (hook != address(0)) revert HookAlreadySet();
        hook = newHook;
        emit HookSet(newHook);
    }

    function setSafeLauncher(address launcher, bool allowed) external onlyOwner {
        if (launcher == address(0)) revert ZeroAddress();
        safeLauncher[launcher] = allowed;
        emit SafeLauncherSet(launcher, allowed);
    }

    function setLaunchAllowlist(address creator, bool allowed) external onlyOwner {
        if (creator == address(0)) revert ZeroAddress();
        launchAllowlist[creator] = allowed;
        emit CreatorAllowlistSet(creator, allowed);
    }

    /// @notice One-way decentralization switch. There is intentionally no
    ///         disable function.
    function enablePermissionlessMainLaunch() external onlyOwner {
        permissionlessMainLaunch = true;
        emit PermissionlessMainLaunchEnabled();
    }

    /// @notice Called by the hook during initialization.
    /// @param initializeCaller The direct PoolManager initialize caller. This
    ///        must be an approved launcher; tx.origin is deliberately unused,
    ///        making the policy safe for smart accounts and EIP-7702 accounts.
    /// @param creator The beneficiary authenticated by that audited launcher.
    function validateMainLaunch(address initializeCaller, address creator) external view {
        if (msg.sender != hook) revert NotHook();
        if (!safeLauncher[initializeCaller]) revert UnsafeLauncher();
        if (!permissionlessMainLaunch && creator != owner && !launchAllowlist[creator]) {
            revert LauncherClosed();
        }
    }

    /// @notice Rejects delegated token implementations at pool launch unless
    /// the protocol owner approved that exact token address and runtime hash.
    /// B20/canonical tokens are stateless non-proxies by construction; this is
    /// defense-in-depth plus the deliberate case-by-case path for trusted
    /// system proxies, including renounced proxies where appropriate.
    function validateTokenCode(address token0, address token1) external view {
        if (msg.sender != hook) revert NotHook();
        _validateTokenCode(token0);
        _validateTokenCode(token1);
    }

    function _validateTokenCode(address token) private view {
        if (token == address(0)) return;
        if (IFlashTokenWhitelist(hook).whitelistedTokenHash(token) == token.codehash) return;
        if (_containsDelegationOpcode(token)) revert ProxyTokenForbidden();
    }

    /// @dev PUSH payloads are skipped, so a literal 0xf4/0xf2 byte is not
    /// mistaken for an executable delegation opcode. Audited runtimes with a
    /// delegation byte in metadata use the exact-token whitelist exception.
    function _containsDelegationOpcode(address token) private view returns (bool) {
        bytes memory runtime = token.code;
        uint256 length = runtime.length;
        for (uint256 i; i < length;) {
            uint8 opcode = uint8(runtime[i]);
            if (opcode == 0xf4 || opcode == 0xf2) return true;
            unchecked {
                i += opcode >= 0x60 && opcode <= 0x7f ? uint256(opcode) - 0x5e : 1;
            }
        }
        return false;
    }
}
