// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FlashPoolStaking} from "./FlashPoolStaking.sol";
import {FlashOtcDeck} from "./FlashOtcDeck.sol";

interface IFlashStakingModuleRegistry {
    function impactInterceptor() external view returns (address);
    function otcDeck() external view returns (FlashOtcDeck);
}

/// @notice Enforces exactly one canonical, accounting-isolated staking vault
///         for each registered FLASH pool.
contract FlashPoolStakingFactory {
    using SafeTransferLib for ERC20;

    error NotHook();
    error NotOwner();
    error NotFunder();
    error AlreadyDeployed();
    error ZeroAddress();
    error ZeroAmount();
    error Reentered();
    error LegacyPokePoolAlreadySet();
    error LegacyPokePoolUnset();

    address public immutable hook;
    address public immutable protocolOwner;
    address public immutable wrappedNative;
    mapping(bytes32 poolId => FlashPoolStaking) public stakingOf;
    mapping(address funder => bool) public authorizedFunder;
    /// @notice Chain-local PoolId selected once for the legacy POKE
    /// `addRewards(uint256)` ABI. The token and vault remain immutable after
    /// selection, while the PoolId may naturally differ between chains.
    bytes32 public legacyPokePoolId;
    address public legacyPokeToken;
    bool private entered;

    event StakingDeployed(bytes32 indexed poolId, address indexed token, address staking);
    event PoolRewardsAdded(
        bytes32 indexed poolId, address indexed funder, address indexed token, uint256 amount, bool routedToOwner
    );
    event LegacyPokePoolConfigured(bytes32 indexed poolId, address indexed token, address indexed staking);
    event BuybackRewardsCredited(bytes32 indexed poolId, uint256 stakers, uint256 ownerOtc);

    constructor(address hook_, address protocolOwner_, address wrappedNative_) {
        if (hook_ == address(0) || protocolOwner_ == address(0) || wrappedNative_ == address(0)) revert ZeroAddress();
        hook = hook_;
        protocolOwner = protocolOwner_;
        wrappedNative = wrappedNative_;
        authorizedFunder[protocolOwner_] = true;
    }

    modifier nonReentrant() {
        if (entered) revert Reentered();
        entered = true;
        _;
        entered = false;
    }

    function deployForPool(bytes32 poolId, ERC20 token, ERC20 quoteToken, uint16 flashFeeBps)
        external
        returns (FlashPoolStaking staking)
    {
        if (msg.sender != hook) revert NotHook();
        if (address(stakingOf[poolId]) != address(0)) revert AlreadyDeployed();
        staking = new FlashPoolStaking(
            token, token, quoteToken, poolId, hook, address(this), protocolOwner, flashFeeBps
        );
        stakingOf[poolId] = staking;
        emit StakingDeployed(poolId, address(token), address(staking));
    }

    function setAuthorizedFunder(address funder, bool allowed) external {
        if (msg.sender != protocolOwner) revert NotOwner();
        if (funder == address(0)) revert ZeroAddress();
        authorizedFunder[funder] = allowed;
    }

    /// @notice One-time compatibility binding for the live POKE application
    /// contracts, which approve this contract and call `addRewards(uint256)`.
    /// The local PoolId is never supplied by those callers and therefore
    /// cannot be redirected per call.
    function configureLegacyPokePool(bytes32 poolId) external {
        if (msg.sender != protocolOwner) revert NotOwner();
        if (legacyPokeToken != address(0)) revert LegacyPokePoolAlreadySet();
        FlashPoolStaking staking = stakingOf[poolId];
        if (address(staking) == address(0)) revert ZeroAddress();
        address token = address(staking.rewardToken());
        if (token == address(0) || token != address(staking.token())) revert ZeroAddress();
        legacyPokePoolId = poolId;
        legacyPokeToken = token;
        emit LegacyPokePoolConfigured(poolId, token, address(staking));
    }

    function fundPermanentOwnerStake(bytes32 poolId, uint256 amount) external nonReentrant returns (uint256 shares) {
        if (!authorizedFunder[msg.sender]) revert NotFunder();
        FlashPoolStaking staking = stakingOf[poolId];
        if (address(staking) == address(0)) revert ZeroAddress();
        ERC20 asset = staking.token();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.safeApprove(address(staking), amount);
        shares = staking.fundPermanentOwnerStake(amount);
        asset.safeApprove(address(staking), 0);
    }

    /// @notice Receives bought tokens directly from PoolManager, credits 69%
    /// to stakers, and sends the 31% owner inventory to hook custody before
    /// recording it in the owner OTC class. The whole call is nested inside
    /// the buyback executor so any failure rolls back the parent attempt.
    function allocateBuyback(bytes32 poolId, uint256 amount) external nonReentrant {
        IFlashStakingModuleRegistry modules = IFlashStakingModuleRegistry(hook);
        if (msg.sender != modules.impactInterceptor()) revert NotHook();
        if (amount == 0) revert ZeroAmount();
        FlashPoolStaking staking = stakingOf[poolId];
        if (address(staking) == address(0)) revert ZeroAddress();
        ERC20 asset = staking.rewardToken();
        uint256 stakerAmount = amount * 69 / 100;
        if (staking.totalShares() == 0) {
            stakerAmount = 0;
        } else {
            asset.safeApprove(address(staking), stakerAmount);
            uint256 received = staking.addBuybackRewardsFrom(stakerAmount);
            asset.safeApprove(address(staking), 0);
            if (received != stakerAmount) revert ZeroAmount();
        }
        uint256 ownerOtcAmount = amount - stakerAmount;
        asset.safeTransfer(hook, ownerOtcAmount);
        modules.otcDeck().depositBuyback(poolId, ownerOtcAmount);
        emit BuybackRewardsCredited(poolId, stakerAmount, ownerOtcAmount);
    }

    /// @notice Permissionless, canonical reward entry point. PoolId selects
    /// exactly one hook-created vault and therefore one immutable pool token.
    /// Callers cannot create or redirect a competing reward sink here.
    function addRewards(bytes32 poolId, uint256 amount) external nonReentrant returns (uint256 received) {
        received = _addRewards(poolId, amount, msg.sender);
    }

    /// @notice ABI-compatible reward endpoint used by the existing POKE
    /// contracts. It always pulls the configured POKE token into the one
    /// chain-local POKE vault; callers cannot select a PoolId.
    function addRewards(uint256 amount) external nonReentrant returns (uint256 received) {
        if (legacyPokeToken == address(0)) revert LegacyPokePoolUnset();
        received = _addRewards(legacyPokePoolId, amount, msg.sender);
    }

    function _addRewards(bytes32 poolId, uint256 amount, address funder) private returns (uint256 received) {
        if (amount == 0) revert ZeroAmount();
        FlashPoolStaking staking = stakingOf[poolId];
        if (address(staking) == address(0)) revert ZeroAddress();
        ERC20 asset = staking.rewardToken();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(funder, address(this), amount);
        uint256 pulled = asset.balanceOf(address(this)) - beforeBalance;
        if (pulled == 0) revert ZeroAmount();
        asset.safeApprove(address(staking), pulled);
        received = staking.addRewardsFrom(funder, pulled);
        asset.safeApprove(address(staking), 0);
        emit PoolRewardsAdded(poolId, funder, address(asset), received, staking.totalShares() == 0);
    }
}
