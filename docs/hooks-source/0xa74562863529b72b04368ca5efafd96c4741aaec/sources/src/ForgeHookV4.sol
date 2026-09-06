// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";

interface IERC721OwnerOf {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IForgeClaimVault {
    function recordClaim(uint256 amount) external;
}

contract ForgeHookV4 is BaseHook {
    using SafeCast for uint256;

    uint160 public constant REQUIRED_MASK = 0x2AEC;
    uint256 public constant BPS = 10_000;
    uint16 public constant MIN_TOTAL_FEE_BPS = 100;
    uint16 public constant MIN_PLATFORM_TRADE_FEE_BPS = 100;
    uint16 public constant BASIC_FEE_CAP_BPS = 500;
    uint16 public constant UTILITY_FEE_CAP_BPS = 1500;

    enum Mode {
        Basic,
        Utility,
        Rewards
    }

    struct PoolConfig {
        address creator;
        address platformRecipient;
        address rewardsDistributor;
        address utilityRecipient;
        Mode mode;
        uint16 buyFeeBps;
        uint16 sellFeeBps;
        uint16 platformShareBps;
        uint16 creatorShareBps;
        uint16 rewardsShareBps;
        uint16 utilityShareBps;
        uint32 cadenceSeconds;
        int24 tickSpacing;
        uint160 sqrtPriceX96;
        bool registered;
        bool initialized;
    }

    struct LaunchAuthorization {
        PoolId poolId;
        bytes32 poolKeyHash;
        address positionManager;
        uint256 expectedTokenId;
        bytes32 salt;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        address positionVault;
        uint256 nonce;
        uint160 sqrtPriceX96;
        bool active;
        bool consumed;
        bool initialized;
    }

    address public immutable launchManager;
    address public immutable claimVault;
    address public immutable authorizedSweeper;

    mapping(PoolId => PoolConfig) private poolConfigs;
    mapping(PoolId => bool) public poolAlreadyHasPosition;
    LaunchAuthorization private launchAuthorization;
    mapping(PoolId => uint256) public poolFeeAccrued;
    mapping(PoolId => uint256) public platformLiability;
    mapping(PoolId => uint256) public creatorLiability;
    mapping(PoolId => uint256) public rewardsLiability;
    mapping(PoolId => uint256) public utilityLiability;
    mapping(PoolId => uint256) public platformRedeemed;
    mapping(PoolId => uint256) public creatorRedeemed;
    mapping(PoolId => uint256) public rewardsRedeemed;
    mapping(PoolId => uint256) public utilityRedeemed;

    error InvalidLaunchManager();
    error InvalidClaimVault();
    error InvalidAuthorizedSweeper();
    error NotLaunchManager();
    error PoolAlreadyRegistered();
    error UnregisteredPool();
    error BasicFeeTooHigh();
    error UtilityFeeTooHigh();
    error TotalFeeBelowMinimum(bool isBuy, uint16 totalFeeBps);
    error PlatformFeeBelowMinimum(bool isBuy, uint16 totalFeeBps, uint16 platformShareBps);
    error InvalidShares();
    error InvalidCadence();
    error WrongInitializeSender();
    error WrongPoolFee();
    error WrongHook();
    error WrongTickSpacing();
    error WrongInitialSqrtPrice();
    error RemoveLiquidityLocked();
    error DonationsDisabled();
    error NoActiveAuthorization();
    error WrongPositionManager();
    error WrongPoolId();
    error WrongPoolKey();
    error WrongTokenId();
    error WrongSalt();
    error WrongTickLower();
    error WrongTickUpper();
    error WrongLiquidity();
    error WrongNonce();
    error WrongNFTOwner();
    error SecondPositionInPool();
    error AuthorizationStillActive();
    error LiabilityInvariant();
    error UnauthorizedRedemption();
    error InvalidRedemptionBucket();
    error RedemptionExceedsLiability();

    constructor(IPoolManager manager_, address launchManager_, address claimVault_, address authorizedSweeper_)
        BaseHook(manager_)
    {
        if (launchManager_ == address(0)) revert InvalidLaunchManager();
        if (claimVault_ == address(0)) revert InvalidClaimVault();
        if (authorizedSweeper_ == address(0)) revert InvalidAuthorizedSweeper();
        if ((uint160(address(this)) & Hooks.ALL_HOOK_MASK) != REQUIRED_MASK) {
            revert Hooks.HookAddressNotValid(address(this));
        }
        launchManager = launchManager_;
        claimVault = claimVault_;
        authorizedSweeper = authorizedSweeper_;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: true,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function registerPoolConfig(PoolKey calldata key, PoolConfig calldata config) external {
        if (msg.sender != launchManager) revert NotLaunchManager();
        PoolId poolId = key.toId();
        if (poolConfigs[poolId].registered) revert PoolAlreadyRegistered();
        if (key.fee != 0) revert WrongPoolFee();
        if (address(key.hooks) != address(this)) revert WrongHook();
        if (config.tickSpacing != key.tickSpacing) revert WrongTickSpacing();
        if (config.sqrtPriceX96 == 0) revert WrongInitialSqrtPrice();
        _validateFeesAndShares(config);

        poolConfigs[poolId] = config;
        poolConfigs[poolId].registered = true;
    }

    function registerLaunchAuthorization(LaunchAuthorization calldata authorization) external {
        if (msg.sender != launchManager) revert NotLaunchManager();
        if (authorization.positionManager == address(0)) revert WrongPositionManager();
        if (authorization.positionVault == address(0)) revert WrongNFTOwner();
        if (authorization.poolKeyHash == bytes32(0)) revert WrongPoolKey();
        if (authorization.liquidityDelta <= 0) revert WrongLiquidity();
        if (authorization.salt != bytes32(authorization.expectedTokenId)) revert WrongSalt();
        launchAuthorization = authorization;
    }

    function poolStatus(PoolId poolId) external view returns (bool registered, bool initialized) {
        PoolConfig storage config = poolConfigs[poolId];
        return (config.registered, config.initialized);
    }

    function poolFeeConfig(PoolId poolId)
        external
        view
        returns (Mode mode, uint16 buyFeeBps, uint16 sellFeeBps, uint32 cadenceSeconds)
    {
        PoolConfig storage config = poolConfigs[poolId];
        return (config.mode, config.buyFeeBps, config.sellFeeBps, config.cadenceSeconds);
    }

    function poolShareConfig(PoolId poolId)
        external
        view
        returns (uint16 platformShareBps, uint16 creatorShareBps, uint16 rewardsShareBps, uint16 utilityShareBps)
    {
        PoolConfig storage config = poolConfigs[poolId];
        return (config.platformShareBps, config.creatorShareBps, config.rewardsShareBps, config.utilityShareBps);
    }

    function poolRecipients(PoolId poolId)
        external
        view
        returns (address platformRecipient, address creator, address rewardsDistributor, address utilityRecipient)
    {
        PoolConfig storage config = poolConfigs[poolId];
        return (config.platformRecipient, config.creator, config.rewardsDistributor, config.utilityRecipient);
    }

    function authorizeRedemption(address caller, PoolId poolId, uint8 bucket, uint256 amount)
        external
        returns (address recipient)
    {
        if (msg.sender != claimVault) revert UnauthorizedRedemption();
        PoolConfig storage config = poolConfigs[poolId];
        if (!config.registered) revert UnregisteredPool();

        if (bucket == 0) {
            recipient = config.platformRecipient;
            if (caller != recipient) revert UnauthorizedRedemption();
            platformRedeemed[poolId] = _checkedRedeemed(platformRedeemed[poolId], platformLiability[poolId], amount);
        } else if (bucket == 1) {
            recipient = config.creator;
            if (caller != recipient) revert UnauthorizedRedemption();
            creatorRedeemed[poolId] = _checkedRedeemed(creatorRedeemed[poolId], creatorLiability[poolId], amount);
        } else if (bucket == 2) {
            recipient = config.rewardsDistributor;
            if (caller != recipient) revert UnauthorizedRedemption();
            rewardsRedeemed[poolId] = _checkedRedeemed(rewardsRedeemed[poolId], rewardsLiability[poolId], amount);
        } else if (bucket == 3) {
            recipient = config.utilityRecipient;
            if (caller != recipient && caller != authorizedSweeper) revert UnauthorizedRedemption();
            utilityRedeemed[poolId] = _checkedRedeemed(utilityRedeemed[poolId], utilityLiability[poolId], amount);
        } else {
            revert InvalidRedemptionBucket();
        }
    }

    function launchAuthorizationStatus() external view returns (bool active, bool consumed, bool initialized) {
        return (launchAuthorization.active, launchAuthorization.consumed, launchAuthorization.initialized);
    }

    function assertLaunchAuthorizationConsumed() external view {
        if (launchAuthorization.active || !launchAuthorization.consumed) revert AuthorizationStillActive();
    }

    function _beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        internal
        override
        returns (bytes4)
    {
        if (sender != launchManager) revert WrongInitializeSender();
        PoolConfig storage config = poolConfigs[key.toId()];
        if (!config.registered) revert UnregisteredPool();
        if (key.fee != 0) revert WrongPoolFee();
        if (address(key.hooks) != address(this)) revert WrongHook();
        if (key.tickSpacing != config.tickSpacing) revert WrongTickSpacing();
        if (sqrtPriceX96 != config.sqrtPriceX96) revert WrongInitialSqrtPrice();
        LaunchAuthorization storage authorization = launchAuthorization;
        if (!authorization.active) revert NoActiveAuthorization();
        if (keccak256(abi.encode(key)) != authorization.poolKeyHash) revert WrongPoolKey();
        if (sqrtPriceX96 != authorization.sqrtPriceX96) revert WrongInitialSqrtPrice();
        config.initialized = true;
        authorization.initialized = true;
        return IHooks.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4) {
        LaunchAuthorization storage authorization = launchAuthorization;
        if (!authorization.active) revert NoActiveAuthorization();
        if (sender != authorization.positionManager) revert WrongPositionManager();
        if (PoolId.unwrap(key.toId()) != PoolId.unwrap(authorization.poolId)) revert WrongPoolId();
        if (keccak256(abi.encode(key)) != authorization.poolKeyHash) revert WrongPoolKey();
        if (params.salt != bytes32(authorization.expectedTokenId)) revert WrongTokenId();
        if (params.salt != authorization.salt) revert WrongSalt();
        if (params.tickLower != authorization.tickLower) revert WrongTickLower();
        if (params.tickUpper != authorization.tickUpper) revert WrongTickUpper();
        if (params.liquidityDelta != authorization.liquidityDelta) revert WrongLiquidity();
        if (abi.decode(hookData, (uint256)) != authorization.nonce) revert WrongNonce();
        if (
            IERC721OwnerOf(authorization.positionManager).ownerOf(authorization.expectedTokenId)
                != authorization.positionVault
        ) {
            revert WrongNFTOwner();
        }
        if (poolAlreadyHasPosition[authorization.poolId]) revert SecondPositionInPool();

        poolAlreadyHasPosition[authorization.poolId] = true;
        launchAuthorization.active = false;
        launchAuthorization.consumed = true;
        return IHooks.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        revert RemoveLiquidityLocked();
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolConfig storage config = poolConfigs[key.toId()];
        if (!config.registered) revert UnregisteredPool();

        uint256 fee;
        if (params.zeroForOne && params.amountSpecified < 0) {
            fee = uint256(-params.amountSpecified) * config.buyFeeBps / BPS;
        } else if (!params.zeroForOne && params.amountSpecified > 0) {
            fee = _ceilDiv(uint256(params.amountSpecified) * config.sellFeeBps, BPS - config.sellFeeBps);
        }

        if (fee != 0) {
            _collectFee(key.toId(), config, fee);
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
        }

        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolConfig storage config = poolConfigs[key.toId()];
        if (!config.registered) revert UnregisteredPool();

        uint256 fee;
        if (params.zeroForOne && params.amountSpecified > 0) {
            uint256 poolEthInput = uint256(uint128(-delta.amount0()));
            fee = _ceilDiv(poolEthInput * config.buyFeeBps, BPS - config.buyFeeBps);
        } else if (!params.zeroForOne && params.amountSpecified < 0) {
            uint256 grossEthOutput = uint256(uint128(delta.amount0()));
            fee = grossEthOutput * config.sellFeeBps / BPS;
        }

        if (fee != 0) {
            _collectFee(key.toId(), config, fee);
            return (IHooks.afterSwap.selector, fee.toInt128());
        }

        return (IHooks.afterSwap.selector, 0);
    }

    function _beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        revert DonationsDisabled();
    }

    function _validateFeesAndShares(PoolConfig calldata config) internal pure {
        if (config.mode == Mode.Basic) {
            if (config.buyFeeBps > BASIC_FEE_CAP_BPS || config.sellFeeBps > BASIC_FEE_CAP_BPS) {
                revert BasicFeeTooHigh();
            }
            if (config.rewardsShareBps != 0 || config.utilityShareBps != 0) revert InvalidShares();
            if (uint256(config.platformShareBps) + config.creatorShareBps != BPS) revert InvalidShares();
            if (config.cadenceSeconds != 0) revert InvalidCadence();
            _validatePlatformFeeFloor(config);
            return;
        }

        if (config.buyFeeBps > UTILITY_FEE_CAP_BPS || config.sellFeeBps > UTILITY_FEE_CAP_BPS) {
            revert UtilityFeeTooHigh();
        }
        if (
            uint256(config.platformShareBps) + config.creatorShareBps + config.rewardsShareBps + config.utilityShareBps
                != BPS
        ) revert InvalidShares();

        if (config.mode == Mode.Rewards) {
            if (
                config.cadenceSeconds != 15 minutes && config.cadenceSeconds != 30 minutes
                    && config.cadenceSeconds != 60 minutes
            ) revert InvalidCadence();
            _validatePlatformFeeFloor(config);
            return;
        }

        if (config.cadenceSeconds != 0) revert InvalidCadence();
        _validatePlatformFeeFloor(config);
    }

    function _validatePlatformFeeFloor(PoolConfig calldata config) internal pure {
        _validatePlatformFeeFloorForSide(config.buyFeeBps, config.platformShareBps, true);
        _validatePlatformFeeFloorForSide(config.sellFeeBps, config.platformShareBps, false);
    }

    function _validatePlatformFeeFloorForSide(uint16 totalFeeBps, uint16 platformShareBps, bool isBuy)
        internal
        pure
    {
        if (totalFeeBps < MIN_TOTAL_FEE_BPS) revert TotalFeeBelowMinimum(isBuy, totalFeeBps);

        // platformShareBps is a share of the total fee, so the platform's trade-level fee is
        // floor(totalFeeBps * platformShareBps / BPS). Cross-multiplication enforces that this
        // is at least 100 bps without division truncation: totalFeeBps * platformShareBps >= 100 * BPS.
        if (uint256(totalFeeBps) * platformShareBps < uint256(MIN_PLATFORM_TRADE_FEE_BPS) * BPS) {
            revert PlatformFeeBelowMinimum(isBuy, totalFeeBps, platformShareBps);
        }
    }

    function _collectFee(PoolId poolId, PoolConfig storage config, uint256 fee) internal {
        poolFeeAccrued[poolId] += fee;

        uint256 creatorAmount = fee * config.creatorShareBps / BPS;
        uint256 rewardsAmount = fee * config.rewardsShareBps / BPS;
        uint256 utilityAmount = fee * config.utilityShareBps / BPS;
        uint256 platformAmount = fee - creatorAmount - rewardsAmount - utilityAmount;

        platformLiability[poolId] += platformAmount;
        creatorLiability[poolId] += creatorAmount;
        rewardsLiability[poolId] += rewardsAmount;
        utilityLiability[poolId] += utilityAmount;

        poolManager.mint(claimVault, CurrencyLibrary.ADDRESS_ZERO.toId(), fee);
        IForgeClaimVault(claimVault).recordClaim(fee);
        _assertLiabilities(poolId);
    }

    function _assertLiabilities(PoolId poolId) internal view {
        uint256 sum =
            platformLiability[poolId] + creatorLiability[poolId] + rewardsLiability[poolId] + utilityLiability[poolId];
        if (sum != poolFeeAccrued[poolId]) revert LiabilityInvariant();
    }

    function _checkedRedeemed(uint256 redeemed, uint256 liability, uint256 amount)
        internal
        pure
        returns (uint256 next)
    {
        next = redeemed + amount;
        if (next > liability) revert RedemptionExceedsLiability();
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) internal pure returns (uint256) {
        if (numerator == 0) return 0;
        return (numerator - 1) / denominator + 1;
    }
}
