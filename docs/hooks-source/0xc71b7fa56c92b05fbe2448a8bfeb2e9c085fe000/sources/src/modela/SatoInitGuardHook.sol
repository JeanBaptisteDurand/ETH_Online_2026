// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PoolKey, Currency} from "./V4Interfaces.sol";

interface ISatoMarketRegistry {
    /// The SINGLE vault currently authorized to initialize this exact pool. Zero when none is.
    ///
    /// Deliberately NOT a blanket "is this one of our vaults" predicate. That earlier shape was
    /// exploitable: every factory vault carried the privilege, so a 1-wei dust market created for an
    /// unrelated project could initialize somebody else's PoolKey and burn it permanently. Authority
    /// is bound to the exact pool, and superseding a candidate revokes it in the same state change.
    function authorizedInitializer(bytes32 poolId) external view returns (address);
}

interface ISatoVaultView {
    /// The vault's immutable PoolKey (public struct getter -> flattened tuple).
    function key() external view returns (Currency currency0, Currency currency1, uint24 fee, int24 tickSpacing, address hooks);
    function OPENING_SQRT_PRICE_X96() external view returns (uint160);
}

/// @title SatoInitGuardHook — the minimal Uniswap v4 hook that makes a SATO market un-grief-able.
///
/// @notice WHY THIS EXISTS. `PoolManager.initialize` is permissionless and a Model A PoolKey is
///         public before creation (that is the whole point of `predictVault`). Without a hook, anyone
///         can initialize the intended PoolKey at a price of their choosing for the cost of gas. The
///         vault correctly refuses to build on a wrong price — but the PoolKey is then permanently
///         unusable, because a v4 pool can never be re-initialized. That is a permanent, capital-free
///         griefing vector against every announced market, and no factory-side bookkeeping fixes it:
///         the burned object is the POOL, not SATO's record of it.
///
///         Setting `hooks` to this contract changes the PoolKey itself, so the guarded pool is a
///         DIFFERENT pool from the unguarded one. An attacker can still create the hookless pool for
///         the same token pair — that is just an ordinary Uniswap pool and it has no bearing on SATO's
///         market — but they cannot touch the guarded PoolKey at all.
///
/// @dev SCOPE IS DELIBERATELY MINIMAL. Exactly ONE permission bit is set: BEFORE_INITIALIZE.
///      There is no owner, no upgrade path, no admin function, no storage, no dynamic fee, no swap or
///      liquidity logic, and no callback that can run during a trade. After initialization this
///      contract is never called again, so it cannot affect pricing, fees or settlement. Every field
///      is immutable and set once at construction.
///
///      The hook does not merely trust the caller: it re-reads the caller's OWN immutable PoolKey and
///      opening price and requires them to match the initialization it is being asked to authorize.
///      A vault therefore cannot be used as a proxy to open some other pool, or the right pool at the
///      wrong price, even if the factory's vault registry were somehow wrong.
///
///      ADDRESS DERIVATION IS LOAD-BEARING. v4 reads a hook's permissions from the low 14 bits of its
///      ADDRESS, so this contract must be deployed via CREATE2 to an address where
///      `uint160(addr) & 0x3FFF == BEFORE_INITIALIZE_FLAG` exactly. Any other permission bit set would
///      make v4 call a function this contract does not implement, bricking the pool. `ScriptHookMiner`
///      / `HookAddress.isValid` express that requirement and the deploy script asserts it.
contract SatoInitGuardHook {
    /// v4 encodes hook permissions in the low 14 bits of the hook ADDRESS.
    uint160 internal constant ALL_HOOK_MASK = uint160((1 << 14) - 1);
    uint160 internal constant BEFORE_INITIALIZE_FLAG = uint160(1 << 13);

    address public immutable POOL_MANAGER;
    ISatoMarketRegistry public immutable FACTORY;

    error NotPoolManager();
    error NotSatoVault();
    error WrongPoolKey();
    error WrongOpeningPrice();
    error BadHookAddress();
    error ZeroAddress();

    constructor(address poolManager, ISatoMarketRegistry factory) {
        if (poolManager == address(0) || address(factory) == address(0)) revert ZeroAddress();
        // Fail at construction rather than at the first market: an address with the wrong permission
        // bits would either skip the guard entirely or make v4 call an unimplemented hook function.
        if (uint160(address(this)) & ALL_HOOK_MASK != BEFORE_INITIALIZE_FLAG) revert BadHookAddress();
        POOL_MANAGER = poolManager;
        FACTORY = factory;
    }

    /// @notice v4 calls this before initializing any pool whose key names this hook.
    /// @dev Reverting here makes the initialization revert, which is exactly the protection.
    function beforeInitialize(address sender, PoolKey calldata poolKey, uint160 sqrtPriceX96)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        // Only the vault currently authorized for THIS EXACT pool may open it. A superseded candidate,
        // a vault for another market, and a vault for another project all fail here.
        if (FACTORY.authorizedInitializer(keccak256(abi.encode(poolKey))) != sender) revert NotSatoVault();

        // ...and only the exact pool, at the exact price, that vault was constructed to open.
        (Currency c0, Currency c1, uint24 fee, int24 tickSpacing, address hooks) = ISatoVaultView(sender).key();
        if (
            Currency.unwrap(c0) != Currency.unwrap(poolKey.currency0)
                || Currency.unwrap(c1) != Currency.unwrap(poolKey.currency1) || fee != poolKey.fee
                || tickSpacing != poolKey.tickSpacing || hooks != poolKey.hooks
        ) revert WrongPoolKey();
        if (ISatoVaultView(sender).OPENING_SQRT_PRICE_X96() != sqrtPriceX96) revert WrongOpeningPrice();

        return SatoInitGuardHook.beforeInitialize.selector;
    }
}

/// @notice Pure helper for validating and mining a compliant hook address. Not deployed in production.
library HookAddress {
    uint160 internal constant ALL_HOOK_MASK = uint160((1 << 14) - 1);
    uint160 internal constant BEFORE_INITIALIZE_FLAG = uint160(1 << 13);

    /// The ONLY address shape v4 will treat as a before-initialize-only hook.
    function isValid(address hook) internal pure returns (bool) {
        return uint160(hook) & ALL_HOOK_MASK == BEFORE_INITIALIZE_FLAG;
    }

    function computeAddress(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }

    /// Find a salt whose CREATE2 address carries exactly the before-initialize flag.
    function mine(address deployer, bytes memory creationCode, bytes memory constructorArgs)
        internal
        pure
        returns (bytes32 salt, address hook)
    {
        bytes32 initCodeHash = keccak256(abi.encodePacked(creationCode, constructorArgs));
        unchecked {
            for (uint256 i = 0; i < 500_000; i++) {
                bytes32 s = bytes32(i);
                address a = computeAddress(deployer, s, initCodeHash);
                if (isValid(a)) return (s, a);
            }
        }
        revert("HookAddress: no salt found");
    }
}
