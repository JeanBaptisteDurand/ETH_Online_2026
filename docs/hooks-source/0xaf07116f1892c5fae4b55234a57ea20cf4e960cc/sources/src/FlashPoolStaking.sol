// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

interface IFlashBorrower {
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data)
        external
        returns (bytes32);
}

interface IFlashStakingChurn {
    function onOwnerStakingRewards(bytes32 poolId, address token, uint256 amount) external;
    function onOwnerStakingQuoteRewards(bytes32 poolId, address quoteToken, uint256 amount) external;
}

/// @title FlashPoolStaking
/// @notice One isolated vault per FLASH pool/token. Stakers supply the token
///         market makers borrow; flash fees and hook-funded rewards increase
///         share value without iterating over stakers.
contract FlashPoolStaking {
    using SafeTransferLib for ERC20;

    error ZeroAddress();
    error ZeroAmount();
    error Reentered();
    error InsufficientLiquidity();
    error BadCallback();
    error NotRepaid();
    error NotHook();
    error Slippage();
    error PermanentOwnerStake();
    error NoRewards();
    error NoShares();

    bytes32 public constant CALLBACK_SUCCESS = keccak256("IFlashBorrower.onFlashLoan");
    uint256 public constant BPS = 10_000;

    ERC20 public immutable token;
    ERC20 public immutable rewardToken;
    ERC20 public immutable quoteToken;
    bytes32 public immutable poolId;
    address public immutable hook;
    address public immutable stakeFunder;
    address public immutable protocolOwner;
    uint16 public immutable flashFeeBps;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public principalOf;
    uint256 public accQuotePerShare;
    uint256 public quoteRemainder;
    mapping(address => uint256) public quoteDebt;
    mapping(address => uint256) public quoteClaimable;
    uint256 public accRewardPerShare;
    uint256 public rewardRemainder;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public rewardClaimable;
    bool private entered;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event FlashLoan(address indexed receiver, address indexed initiator, uint256 amount, uint256 fee);
    event RewardCredited(uint256 amount);
    event ExternalRewardAdded(address indexed funder, address indexed asset, uint256 amount, bool routedToOwner);
    event PermanentOwnerStakeFunded(uint256 assets, uint256 shares);
    event RewardsClaimed(address indexed account, address indexed receiver, uint256 assets, uint256 sharesBurned);
    event OwnerRewardsChurned(uint256 assets, uint256 sharesBurned);
    event QuoteRewardCredited(uint256 amount);
    event QuoteRewardsClaimed(address indexed account, address indexed receiver, uint256 amount);
    event OwnerQuoteRewardsChurned(uint256 amount);
    event TokenRewardsClaimed(address indexed account, address indexed receiver, uint256 amount);
    event OwnerTokenRewardsChurned(uint256 amount);
    event OrphanedAssetsRouted(address indexed asset, uint256 amount);

    constructor(
        ERC20 token_,
        ERC20 rewardToken_,
        ERC20 quoteToken_,
        bytes32 poolId_,
        address hook_,
        address stakeFunder_,
        address protocolOwner_,
        uint16 feeBps_
    ) {
        if (
            address(token_) == address(0) || address(rewardToken_) == address(0) || address(quoteToken_) == address(0)
                || hook_ == address(0) || stakeFunder_ == address(0) || protocolOwner_ == address(0)
        ) revert ZeroAddress();
        if (feeBps_ > BPS) revert Slippage();
        token = token_;
        rewardToken = rewardToken_;
        quoteToken = quoteToken_;
        poolId = poolId_;
        hook = hook_;
        stakeFunder = stakeFunder_;
        protocolOwner = protocolOwner_;
        flashFeeBps = feeBps_;
    }

    modifier nonReentrant() {
        if (entered) revert Reentered();
        entered = true;
        _;
        entered = false;
    }

    function totalAssets() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function availableLiquidity() external view returns (uint256) {
        return totalAssets();
    }

    function maxFlashLoan(address asset) external view returns (uint256) {
        return asset == address(token) ? totalAssets() : 0;
    }

    function flashFee(uint256 amount) public view returns (uint256) {
        return (amount * flashFeeBps + BPS - 1) / BPS;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalShares;
        uint256 managed = totalAssets();
        return supply == 0 || managed == 0 ? assets : assets * supply / managed;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalShares;
        return supply == 0 ? shares : shares * totalAssets() / supply;
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0 || receiver == address(0)) revert ZeroAmount();
        if (receiver == protocolOwner) revert PermanentOwnerStake();
        _routeOrphanedAssets();
        _accrueQuote(receiver);
        _accrueTokenReward(receiver);
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();
        totalShares += shares;
        sharesOf[receiver] += shares;
        principalOf[receiver] += assets;
        _resetQuoteDebt(receiver);
        _resetRewardDebt(receiver);
        token.safeTransferFrom(msg.sender, address(this), assets);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function fundPermanentOwnerStake(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (msg.sender != hook && msg.sender != stakeFunder) revert NotHook();
        if (assets == 0) revert ZeroAmount();
        _routeOrphanedAssets();
        _accrueQuote(protocolOwner);
        _accrueTokenReward(protocolOwner);
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();
        totalShares += shares;
        sharesOf[protocolOwner] += shares;
        principalOf[protocolOwner] += assets;
        _resetQuoteDebt(protocolOwner);
        _resetRewardDebt(protocolOwner);
        token.safeTransferFrom(msg.sender, address(this), assets);
        emit PermanentOwnerStakeFunded(assets, shares);
    }

    /// @dev ERC20 transfers cannot be rejected by the receiver. If tokens are
    /// sent directly to an empty vault, route them before its first share is
    /// minted so that depositor cannot capture someone else's intended reward.
    function _routeOrphanedAssets() private {
        if (totalShares != 0) return;
        uint256 amount = token.balanceOf(address(this));
        if (amount == 0) return;
        token.safeTransfer(hook, amount);
        if (address(token) == address(rewardToken)) {
            IFlashStakingChurn(hook).onOwnerStakingRewards(poolId, address(token), amount);
        } else {
            IFlashStakingChurn(hook).onOwnerStakingQuoteRewards(poolId, address(token), amount);
        }
        emit OrphanedAssetsRouted(address(token), amount);
    }

    function withdraw(uint256 shares, address receiver) external nonReentrant returns (uint256 assets) {
        if (shares == 0 || receiver == address(0)) revert ZeroAmount();
        if (msg.sender == protocolOwner) revert PermanentOwnerStake();
        _sweepOwnerRewards();
        _sweepOwnerQuoteRewards();
        _sweepOwnerTokenRewards();
        _accrueQuote(msg.sender);
        _accrueTokenReward(msg.sender);
        uint256 holderShares = sharesOf[msg.sender];
        assets = convertToAssets(shares);
        uint256 principalReduction =
            shares == holderShares ? principalOf[msg.sender] : principalOf[msg.sender] * shares / holderShares;
        sharesOf[msg.sender] = holderShares - shares;
        principalOf[msg.sender] -= principalReduction;
        totalShares -= shares;
        _resetQuoteDebt(msg.sender);
        _resetRewardDebt(msg.sender);
        token.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, assets, shares);
    }

    function claimRewards(address receiver) external nonReentrant returns (uint256 assets) {
        if (receiver == address(0)) revert ZeroAddress();
        if (msg.sender == protocolOwner) revert PermanentOwnerStake();
        _sweepOwnerRewards();
        _sweepOwnerQuoteRewards();
        _sweepOwnerTokenRewards();
        _accrueQuote(msg.sender);
        _accrueTokenReward(msg.sender);
        uint256 sharesBurned;
        (assets, sharesBurned) = _claimableReward(msg.sender);
        if (assets == 0) revert NoRewards();
        sharesOf[msg.sender] -= sharesBurned;
        totalShares -= sharesBurned;
        _resetQuoteDebt(msg.sender);
        _resetRewardDebt(msg.sender);
        token.safeTransfer(receiver, assets);
        emit RewardsClaimed(msg.sender, receiver, assets, sharesBurned);
    }

    function claimableRewards(address account) external view returns (uint256 assets) {
        (assets,) = _claimableReward(account);
    }

    function _claimableReward(address account) private view returns (uint256 assets, uint256 sharesBurned) {
        uint256 accountShares = sharesOf[account];
        uint256 supply = totalShares;
        uint256 managed = totalAssets();
        if (accountShares == 0 || supply == 0 || managed == 0) return (0, 0);
        uint256 entitlement = accountShares * managed / supply;
        uint256 principal = principalOf[account];
        if (entitlement <= principal) return (0, 0);
        uint256 reward = entitlement - principal;
        // Round down so claiming yield can never consume deposited principal.
        sharesBurned = reward * supply / managed;
        if (sharesBurned == 0) return (0, 0);
        assets = sharesBurned * managed / supply;
    }

    function _sweepOwnerRewards() private {
        (uint256 assets, uint256 sharesBurned) = _claimableReward(protocolOwner);
        if (assets == 0) return;
        sharesOf[protocolOwner] -= sharesBurned;
        totalShares -= sharesBurned;
        token.safeTransfer(hook, assets);
        if (address(token) == address(rewardToken)) {
            IFlashStakingChurn(hook).onOwnerStakingRewards(poolId, address(token), assets);
        } else {
            IFlashStakingChurn(hook).onOwnerStakingQuoteRewards(poolId, address(token), assets);
        }
        emit OwnerRewardsChurned(assets, sharesBurned);
    }

    function claimQuoteRewards(address receiver) external nonReentrant returns (uint256 amount) {
        if (receiver == address(0)) revert ZeroAddress();
        if (msg.sender == protocolOwner) revert PermanentOwnerStake();
        _sweepOwnerRewards();
        _sweepOwnerQuoteRewards();
        _sweepOwnerTokenRewards();
        _accrueQuote(msg.sender);
        amount = quoteClaimable[msg.sender];
        if (amount == 0) revert NoRewards();
        quoteClaimable[msg.sender] = 0;
        quoteToken.safeTransfer(receiver, amount);
        emit QuoteRewardsClaimed(msg.sender, receiver, amount);
    }

    function claimableQuoteRewards(address account) external view returns (uint256 amount) {
        amount = quoteClaimable[account];
        uint256 accrued = sharesOf[account] * accQuotePerShare / 1e27;
        if (accrued > quoteDebt[account]) amount += accrued - quoteDebt[account];
    }

    function creditQuoteReward(uint256 amount) external {
        if (msg.sender != hook) revert NotHook();
        if (amount == 0) revert ZeroAmount();
        uint256 supply = totalShares;
        if (supply == 0) revert NoShares();
        if (address(quoteToken) == address(token)) {
            emit QuoteRewardCredited(amount);
            return;
        }
        uint256 numerator = amount * 1e27 + quoteRemainder;
        accQuotePerShare += numerator / supply;
        quoteRemainder = numerator % supply;
        emit QuoteRewardCredited(amount);
    }

    function _accrueQuote(address account) private {
        uint256 accrued = sharesOf[account] * accQuotePerShare / 1e27;
        uint256 debt = quoteDebt[account];
        if (accrued > debt) quoteClaimable[account] += accrued - debt;
        quoteDebt[account] = accrued;
    }

    function _resetQuoteDebt(address account) private {
        quoteDebt[account] = sharesOf[account] * accQuotePerShare / 1e27;
    }

    function _sweepOwnerQuoteRewards() private {
        if (address(quoteToken) == address(token)) return;
        _accrueQuote(protocolOwner);
        uint256 amount = quoteClaimable[protocolOwner];
        if (amount == 0) return;
        quoteClaimable[protocolOwner] = 0;
        quoteToken.safeTransfer(hook, amount);
        IFlashStakingChurn(hook).onOwnerStakingQuoteRewards(poolId, address(quoteToken), amount);
        emit OwnerQuoteRewardsChurned(amount);
    }

    /// @notice The hook transfers reward tokens first, then records the credit.
    /// No external callback occurs and share appreciation is automatic.
    function creditReward(uint256 amount) external {
        if (msg.sender != hook) revert NotHook();
        if (amount == 0) revert ZeroAmount();
        _recordReward(amount);
    }

    /// @notice PoolId-routed reward funding called by the canonical factory.
    /// The factory supplies the original funder for attribution, while this
    /// vault pulls only its immutable pool reward token from that factory.
    function addRewardsFrom(address funder, uint256 amount) external nonReentrant returns (uint256 received) {
        if (msg.sender != stakeFunder) revert NotHook();
        if (funder == address(0) || amount == 0) revert ZeroAmount();
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        received = rewardToken.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert ZeroAmount();

        if (totalShares == 0) {
            uint256 hookBefore = rewardToken.balanceOf(hook);
            rewardToken.safeTransfer(hook, received);
            uint256 routed = rewardToken.balanceOf(hook) - hookBefore;
            if (routed == 0) revert ZeroAmount();
            IFlashStakingChurn(hook).onOwnerStakingRewards(poolId, address(rewardToken), routed);
            emit ExternalRewardAdded(funder, address(rewardToken), routed, true);
            return routed;
        }

        _recordReward(received);
        emit ExternalRewardAdded(funder, address(rewardToken), received, false);
    }

    /// @notice Narrow factory-only credit used by atomic FLASH buybacks.
    /// @dev This intentionally remains callable while a staker claim is
    /// sweeping the permanent owner's quote rewards. The caller is the
    /// immutable factory, the asset is immutable, and no callback is made.
    function addBuybackRewardsFrom(uint256 amount) external returns (uint256 received) {
        if (msg.sender != stakeFunder) revert NotHook();
        if (amount == 0 || totalShares == 0) revert NoShares();
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        received = rewardToken.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert ZeroAmount();
        _recordReward(received);
        emit ExternalRewardAdded(hook, address(rewardToken), received, false);
    }

    function _recordReward(uint256 amount) private {
        if (address(rewardToken) != address(token)) {
            uint256 supply = totalShares;
            if (supply == 0) revert NoShares();
            uint256 numerator = amount * 1e27 + rewardRemainder;
            accRewardPerShare += numerator / supply;
            rewardRemainder = numerator % supply;
        }
        emit RewardCredited(amount);
    }

    function claimTokenRewards(address receiver) external nonReentrant returns (uint256 amount) {
        if (receiver == address(0)) revert ZeroAddress();
        if (msg.sender == protocolOwner) revert PermanentOwnerStake();
        if (address(rewardToken) == address(token)) revert NoRewards();
        _sweepOwnerRewards();
        _sweepOwnerQuoteRewards();
        _sweepOwnerTokenRewards();
        _accrueTokenReward(msg.sender);
        amount = rewardClaimable[msg.sender];
        if (amount == 0) revert NoRewards();
        rewardClaimable[msg.sender] = 0;
        rewardToken.safeTransfer(receiver, amount);
        emit TokenRewardsClaimed(msg.sender, receiver, amount);
    }

    function claimableTokenRewards(address account) external view returns (uint256 amount) {
        if (address(rewardToken) == address(token)) return 0;
        amount = rewardClaimable[account];
        uint256 accrued = sharesOf[account] * accRewardPerShare / 1e27;
        if (accrued > rewardDebt[account]) amount += accrued - rewardDebt[account];
    }

    function _accrueTokenReward(address account) private {
        if (address(rewardToken) == address(token)) return;
        uint256 accrued = sharesOf[account] * accRewardPerShare / 1e27;
        uint256 debt = rewardDebt[account];
        if (accrued > debt) rewardClaimable[account] += accrued - debt;
        rewardDebt[account] = accrued;
    }

    function _resetRewardDebt(address account) private {
        if (address(rewardToken) != address(token)) {
            rewardDebt[account] = sharesOf[account] * accRewardPerShare / 1e27;
        }
    }

    function _sweepOwnerTokenRewards() private {
        if (address(rewardToken) == address(token)) return;
        _accrueTokenReward(protocolOwner);
        uint256 amount = rewardClaimable[protocolOwner];
        if (amount == 0) return;
        rewardClaimable[protocolOwner] = 0;
        rewardToken.safeTransfer(hook, amount);
        IFlashStakingChurn(hook).onOwnerStakingRewards(poolId, address(rewardToken), amount);
        emit OwnerTokenRewardsChurned(amount);
    }

    function flashLoan(IFlashBorrower receiver, uint256 amount, bytes calldata data)
        external
        nonReentrant
        returns (bool)
    {
        uint256 balanceBefore = totalAssets();
        if (amount == 0 || amount > balanceBefore) revert InsufficientLiquidity();
        uint256 fee = flashFee(amount);
        token.safeTransfer(address(receiver), amount);
        if (receiver.onFlashLoan(msg.sender, address(token), amount, fee, data) != CALLBACK_SUCCESS) {
            revert BadCallback();
        }
        // The receiver opted into this flash loan and is the required payer
        // under the callback contract; this is the ERC-3156-style repayment.
        // slither-disable-next-line arbitrary-send-erc20
        token.safeTransferFrom(address(receiver), address(this), amount + fee);
        if (totalAssets() < balanceBefore + fee) revert NotRepaid();
        emit FlashLoan(address(receiver), msg.sender, amount, fee);
        return true;
    }
}
