// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @dev Base canonical B20 factory/precompile query surface. Low-level calls
/// are used because this precompile is absent on non-Base chains.
interface IB20AdmissionFactory {
    function isB20(address token) external view returns (bool);
    function isB20Initialized(address token) external view returns (bool);
}

/// @title FlashRegistry - generalised main-token registry and fee linkage
/// @notice Implements the N-main-token model. A token becomes a MAIN token by
///         having an approved WETH/TOKEN pool; that launch gate IS the
///         whitelist and is the only permissioned step. Pairing against any
///         main token is permissionless once opened.
///
///         Built standalone first so the size cost of generality can be
///         measured before it is folded into the hook (see
///         `test/size/RegistrySize.t.sol`). The hook will inherit this.
///
/// @dev THE CENTRAL SAFETY PROPERTY: a pool's linkage is resolved ONCE at
///      creation and frozen. Nothing re-resolves it per swap. That removes the
///      failure mode where a mis-resolution routes one token's protocol fees
///      into another token's pending balance, because after creation there is
///      no resolution step left to get wrong.
contract FlashRegistry {
    // ------------------------------------------------------------------
    // errors
    // ------------------------------------------------------------------
    error NotOwner();
    error NotPoolManager();
    error MainPoolLaunchUnauthorized();
    error LaunchingClosed();
    error NoMainSide();
    error MainMainForbidden();
    error BadDecimals();
    error UnsupportedFeeTier();
    error AlreadyMain();
    error ZeroToken();
    error TokenNotVerified();
    error NotCanonicalLauncher();
    error RuntimeHashNotApproved();
    error TokenCodeChanged();
    error WrappedNativeUnset();
    error WrappedNativeAlreadySet();
    error SubTokenAlreadyLinked();
    error PairingCannotClose();

    // ------------------------------------------------------------------
    // state
    // ------------------------------------------------------------------
    /// @notice Permanent protocol authority. Pool/user accounting is keyed to
    /// this identity, so changing it after launch would fragment the stack.
    /// Revenue destinations remain rotatable through FlashHook.treasury().
    // Stored rather than Solidity `immutable` because the hook references the
    // authority in many paths and inlining a PUSH20 at every use exceeds its
    // EIP-170 budget. There is deliberately no mutation function.
    address public owner;
    IPoolManager public immutable poolManager;
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;

    /// @notice Wrapped native root used by every main pool on this chain.
    /// Set exactly once before the first pool is initialized.
    Currency public wrappedNative;

    /// @notice token => is it a main token (has an owner-created ETH pool)
    mapping(Currency => bool) public isMain;
    /// @notice token => its ETH/TOKEN pool id
    mapping(Currency => PoolId) public mainPoolOf;
    /// @notice main token => may anyone create <main>/TOKEN pools yet.
    ///         Per-main rather than global: the model is "anyone can create the
    ///         system", so each main token governs its own permissionless
    ///         surface. Defaults closed.
    mapping(Currency => bool) public pairingOpen;

    mapping(PoolId => bool) public isMainPool;
    mapping(PoolId => Currency) public protocolTokenOfPool;
    mapping(Currency => PoolId) public parentMainOfSub;

    /// @notice allowed (fee, tickSpacing) pairs. Permissionless creators must
    ///         not be able to pick pathological pool geometry.
    mapping(uint256 => bool) public feeTierAllowed;

    /// @notice Non-zero value is the runtime hash approved for this exact
    /// token. It is checked again at every pool launch so replaced code fails.
    mapping(address token => bytes32 runtimeHash) public whitelistedTokenHash;
    mapping(address token => bytes32 runtimeHash) public canonicalTokenHash;
    mapping(bytes32 runtimeHash => bool approved) public canonicalRuntimeHash;
    mapping(address launcher => bool approved) public canonicalLauncher;

    event TokenWhitelistSet(address indexed token, bytes32 indexed runtimeHash, bool approved);
    event CanonicalRuntimeHashSet(bytes32 indexed runtimeHash, bool approved);
    event CanonicalLauncherSet(address indexed launcher, bool approved);
    event CanonicalTokenRegistered(address indexed token, address indexed launcher, bytes32 runtimeHash);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IPoolManager pm, address initialOwner) {
        if (initialOwner == address(0)) revert ZeroToken();
        owner = initialOwner;
        poolManager = pm;
    }

    // ------------------------------------------------------------------
    // admin
    // ------------------------------------------------------------------

    function setWrappedNativeOnce(Currency weth) external onlyOwner {
        if (Currency.unwrap(wrappedNative) != address(0)) revert WrappedNativeAlreadySet();
        if (Currency.unwrap(weth) == address(0)) revert ZeroToken();
        _requireAdmitted(weth);
        wrappedNative = weth;
    }

    function setPairingOpen(Currency main, bool open) external onlyOwner {
        if (!isMain[main]) revert NoMainSide();
        if (pairingOpen[main] && !open) revert PairingCannotClose();
        pairingOpen[main] = open;
    }

    function setFeeTier(uint24 fee, int24 tickSpacing, bool ok) external onlyOwner {
        feeTierAllowed[_tierKey(fee, tickSpacing)] = ok;
    }

    /// @notice Case-by-case exception path for audited legacy/system tokens,
    /// including trusted proxies such as WETH. Approval snapshots the exact
    /// address and runtime; a changed proxy shell is rejected at launch.
    function setTokenWhitelist(address token, bool approved) external onlyOwner {
        bytes32 hash;
        if (approved) {
            if (token == address(0) || token.code.length == 0) revert ZeroToken();
            hash = token.codehash;
        }
        whitelistedTokenHash[token] = hash;
        emit TokenWhitelistSet(token, hash, approved);
    }

    function setCanonicalRuntimeHash(bytes32 runtimeHash, bool approved) external onlyOwner {
        if (runtimeHash == bytes32(0)) revert RuntimeHashNotApproved();
        canonicalRuntimeHash[runtimeHash] = approved;
        emit CanonicalRuntimeHashSet(runtimeHash, approved);
    }

    function setCanonicalLauncher(address launcher, bool approved) external onlyOwner {
        if (launcher == address(0)) revert ZeroToken();
        canonicalLauncher[launcher] = approved;
        emit CanonicalLauncherSet(launcher, approved);
    }

    /// @notice Called by an approved canonical launcher after deployment and
    /// initialization. Only owner-approved runtime templates can be enrolled.
    function registerCanonicalToken(address token) external {
        if (!canonicalLauncher[msg.sender]) revert NotCanonicalLauncher();
        if (token == address(0) || token.code.length == 0) revert ZeroToken();
        bytes32 hash = token.codehash;
        if (!canonicalRuntimeHash[hash]) revert RuntimeHashNotApproved();
        canonicalTokenHash[token] = hash;
        emit CanonicalTokenRegistered(token, msg.sender, hash);
    }

    function isTokenAdmitted(address token) public view returns (bool) {
        if (token == address(0)) return true;
        if (token.code.length == 0) return false;
        bytes32 hash = token.codehash;
        if (whitelistedTokenHash[token] == hash || canonicalTokenHash[token] == hash) return true;
        return _isInitializedB20(token);
    }

    function _tierKey(uint24 fee, int24 tickSpacing) internal pure returns (uint256) {
        return (uint256(fee) << 24) | uint256(uint24(tickSpacing));
    }

    // ------------------------------------------------------------------
    // creation gate
    // ------------------------------------------------------------------

    /// @notice Called from the hook's `beforeInitialize`. Validates the pool is
    ///         allowed to exist, registers a new main token if this is a WETH
    ///         pool, and freezes the pool's linkage.
    /// @param creator authenticated pool beneficiary supplied by the hook
    /// @dev internal: callers reach it through the hook's `beforeInitialize`,
    ///      which is already `onlyPM`.
    function _registerPool(address creator, PoolKey calldata key) internal {
        Currency weth = wrappedNative;
        if (Currency.unwrap(weth) == address(0)) revert WrappedNativeUnset();
        // FLASH is WETH-rooted. Native-currency pools would bypass the token
        // admission/codehash policy and break ERC20 custody in OTC/staking.
        if (Currency.unwrap(key.currency0) == address(0) || Currency.unwrap(key.currency1) == address(0)) {
            revert ZeroToken();
        }
        if (!feeTierAllowed[_tierKey(key.fee, key.tickSpacing)]) revert UnsupportedFeeTier();
        if (key.fee != 6_000) revert UnsupportedFeeTier();

        _requireAdmitted(key.currency0);
        _requireAdmitted(key.currency1);

        PoolId id = key.toId();
        bool zeroIsWeth = Currency.unwrap(key.currency0) == Currency.unwrap(weth);
        bool oneIsWeth = Currency.unwrap(key.currency1) == Currency.unwrap(weth);

        if (zeroIsWeth || oneIsWeth) {
            // ---- WETH/TOKEN: authenticated by the hook's launch gate. ----
            if (creator == address(0)) revert MainPoolLaunchUnauthorized();
            Currency tok = zeroIsWeth ? key.currency1 : key.currency0;
            if (isMain[tok]) revert AlreadyMain();
            _requireEighteenDecimals(tok);

            isMain[tok] = true;
            mainPoolOf[tok] = id;
            isMainPool[id] = true;
            protocolTokenOfPool[id] = tok;
        } else {
            // ---- <MAIN>/TOKEN ----
            bool m0 = isMain[key.currency0];
            bool m1 = isMain[key.currency1];
            if (!m0 && !m1) revert NoMainSide();
            if (m0 && m1) revert MainMainForbidden();
            Currency main = m0 ? key.currency0 : key.currency1;
            Currency sub = m0 ? key.currency1 : key.currency0;
            if (creator != owner && !pairingOpen[main]) revert LaunchingClosed();
            _requireEighteenDecimals(sub);
            if (PoolId.unwrap(parentMainOfSub[sub]) != bytes32(0)) revert SubTokenAlreadyLinked();
            PoolId upstream = mainPoolOf[main];
            parentMainOfSub[sub] = upstream;
            protocolTokenOfPool[id] = sub;
        }
    }

    function _requireEighteenDecimals(Currency c) internal view {
        address a = Currency.unwrap(c);
        if (a == address(0)) return; // native is 18 by definition
        // A token whose `decimals()` is missing or not 18 is rejected outright.
        (bool ok, bytes memory ret) = a.staticcall(abi.encodeCall(IERC20Decimals.decimals, ()));
        if (!ok || ret.length < 32) revert BadDecimals();
        if (abi.decode(ret, (uint8)) != 18) revert BadDecimals();
    }

    function _requireAdmitted(Currency c) internal view {
        address token = Currency.unwrap(c);
        if (token == address(0)) return;
        if (!isTokenAdmitted(token)) revert TokenNotVerified();
        _requireEighteenDecimals(c);
    }

    function _isInitializedB20(address token) private view returns (bool) {
        (bool ok, bytes memory ret) = B20_FACTORY.staticcall(
            abi.encodeCall(IB20AdmissionFactory.isB20, (token))
        );
        if (!ok || ret.length != 32 || abi.decode(ret, (uint256)) != 1) return false;
        (ok, ret) = B20_FACTORY.staticcall(
            abi.encodeCall(IB20AdmissionFactory.isB20Initialized, (token))
        );
        if (!ok || ret.length != 32 || abi.decode(ret, (uint256)) != 1) return false;
        (ok, ret) = token.staticcall(abi.encodeCall(IERC20Decimals.decimals, ()));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 18;
    }

}
