// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/interfaces/IClanker.sol
// ZNS Launchpad. Modifications: renamed; DeploymentConfig extended with Referral/WhaleLimit;
// TokenConfig gains maxWalletBps + freezeMetadataAtDeploy; PoolConfig.tickIfToken0IsClanker ->
// tickIfTokenIsToken0; DeploymentInfo gains mevModule; team->treasury rename; added harvest /
// setTreasuryFeeRecipient / claimTreasuryFees; MEV-bound + NotImplemented errors;
// ReferrerSet event.
pragma solidity ^0.8.26;

import {IZnsOwnerAdmins} from "./IZnsOwnerAdmins.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IZNSFactory is IZnsOwnerAdmins {
    struct TokenConfig {
        address tokenAdmin;
        string name;
        string symbol;
        bytes32 salt;
        string image;
        string metadata;
        string context;
        uint256 originatingChainId;
        // ZNS additions:
        uint256 maxWalletBps; // mechanic 2 (whale limit) — ABI-present, NOT enforced in Phase 1a
        bool freezeMetadataAtDeploy; // decision #3 — one-way metadata freeze at launch
    }

    struct PoolConfig {
        address hook;
        address pairedToken; // [DECISION-0] WETH of the chain (NOT address(0))
        int24 tickIfTokenIsToken0; // renamed from tickIfToken0IsClanker
        int24 tickSpacing;
        bytes poolData;
    }

    struct LockerConfig {
        address locker;
        // reward info — factory OVERWRITES these to the hardcoded 50/30/20 shape
        address[] rewardAdmins;
        address[] rewardRecipients;
        uint16[] rewardBps;
        // liquidity placement info
        int24[] tickLower;
        int24[] tickUpper;
        uint16[] positionBps;
        bytes lockerData;
    }

    // mechanic 1 — creator referral (single static slot)
    struct ReferralConfig {
        address referrer; // 0 => fallback to treasury (D2); == tokenAdmin => silently coerced to 0
    }

    // mechanic 2 — whale / holder limit (ABI-present; enforcement deferred to Phase 2)
    struct WhaleLimitConfig {
        bool enabled;
        uint16 maxBalanceBps;
        uint32 durationSecs;
        bool strict;
    }

    struct ExtensionConfig {
        address extension;
        uint256 msgValue;
        uint16 extensionBps;
        bytes extensionData;
    }

    struct MevModuleConfig {
        address mevModule;
        bytes mevModuleData;
    }

    struct DeploymentConfig {
        TokenConfig tokenConfig;
        PoolConfig poolConfig;
        LockerConfig lockerConfig;
        ReferralConfig referralConfig;
        WhaleLimitConfig whaleLimit;
        MevModuleConfig mevModuleConfig;
        ExtensionConfig[] extensionConfigs;
    }

    struct DeploymentInfo {
        address token;
        address hook;
        address locker;
        address mevModule;
        address[] extensions;
    }

    /// @notice When the factory is deprecated
    error Deprecated();
    /// @notice When the token is not found to collect rewards for
    error NotFound();

    /// @notice When the function is only valid on the originating chain
    error OnlyOriginatingChain();
    /// @notice When the function is only valid on a non-originating chain
    error OnlyNonOriginatingChains();

    /// @notice When the hook is invalid
    error InvalidHook();
    /// @notice When the locker is invalid
    error InvalidLocker();
    /// @notice When the extension contract is invalid
    error InvalidExtension();

    /// @notice When the hook is not enabled
    error HookNotEnabled();
    /// @notice When the locker is not enabled
    error LockerNotEnabled();
    /// @notice When the extension contract is not enabled
    error ExtensionNotEnabled();
    /// @notice When the mev module is not enabled
    error MevModuleNotEnabled();

    /// @notice When the extension msg.value sum mismatches tx value
    error ExtensionMsgValueMismatch();
    /// @notice When the maximum number of extensions is exceeded
    error MaxExtensionsExceeded();
    /// @notice When the extension supply percentage is exceeded
    error MaxExtensionBpsExceeded();

    /// @notice When the mev module is invalid
    error InvalidMevModule();
    /// @notice When the treasury fee recipient is not set
    error TreasuryFeeRecipientNotSet();
    /// @notice When the pool's paired token is not WETH (Phase 1a is WETH-paired only)
    error PairedTokenNotWeth();
    /// @notice When msg.value is below the required per-deploy creation fee
    error InsufficientCreationFee();
    /// @notice When forwarding the creation fee to the treasury fails
    error CreationFeeTransferFailed();

    /// @notice MEV/anti-snipe config bounds (enforced in deployToken)
    error StartFeeTooHigh();
    error EndFeeTooLow();
    error DecayTooLong();

    /// @notice Phase 1b functionality not yet implemented
    error NotImplemented();

    event TokenCreated(
        address msgSender,
        address indexed tokenAddress,
        address indexed tokenAdmin,
        string tokenImage,
        string tokenName,
        string tokenSymbol,
        string tokenMetadata,
        string tokenContext,
        int24 startingTick,
        address poolHook,
        PoolId poolId,
        address pairedToken,
        address locker,
        address mevModule,
        uint256 extensionsSupply,
        address[] extensions
    );
    event ExtensionTriggered(address extension, uint256 extensionSupply, uint256 msgValue);

    /// @notice Emitted with the resolved referrer. resolvedFrom: 0=explicit, 1=self-ref-coerced, 2=unset-fallback
    event ReferrerSet(address indexed token, address indexed referrer, uint8 resolvedFrom);

    event SetDeprecated(bool deprecated);
    event SetExtension(address extension, bool enabled);
    event SetHook(address hook, bool enabled);
    event SetMevModule(address mevModule, bool enabled);
    event SetLocker(address locker, address hook, bool enabled);

    event SetTreasuryFeeRecipient(address oldTreasuryFeeRecipient, address newTreasuryFeeRecipient);
    event ClaimTreasuryFees(address indexed token, address indexed recipient, uint256 amount);
    event SetCreationFee(uint256 oldFee, uint256 newFee);

    function deprecated() external view returns (bool);

    function deployTokenZeroSupply(TokenConfig memory tokenConfig)
        external
        returns (address tokenAddress);

    function deployToken(DeploymentConfig memory deploymentConfig)
        external
        payable
        returns (address tokenAddress);

    function tokenDeploymentInfo(address token) external view returns (DeploymentInfo memory);

    function setTreasuryFeeRecipient(address newTreasuryFeeRecipient) external;

    function claimTreasuryFees(address token) external;

    /// @notice Per-deploy creation fee (native ETH), forwarded to the treasury on deployToken.
    function creationFee() external view returns (uint256);

    /// @notice Set the per-deploy creation fee (onlyOwner).
    function setCreationFee(uint256 newFee) external;

    /// @notice Keeper-callable: harvest accrued LP fees for a token on demand (split 50/30/20 in the locker)
    function harvest(address token) external;
}
