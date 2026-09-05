// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

interface IFlashOtcModuleRegistry {
    function stakingFactory() external view returns (address);
}

/// @notice Pool-isolated OTC inventory, seller proceeds and bounded churn.
/// @dev Token custody remains in the hook because PoolManager deltas are
/// attributed to the hook address. This satellite owns only accounting and can
/// be mutated only by that hook.
contract FlashOtcDeck {
    error NotHook();
    error InvalidPool();
    error InvalidConfig();
    error InvalidBps();
    error InsufficientInventory();
    error ZeroShares();
    error InsolventRewards();

    uint256 private constant Q = 1e27;
    uint256 private constant BPS = 10_000;

    enum ShareClass {
        Public,
        AdminFee,
        OwnerFee
    }

    struct Deck {
        bool configured;
        bool isMain;
        bytes32 upstream;
        address quote;
        address token;
        address admin;
        uint64 epoch;
        uint16 otcBps;
        uint16 sellerFeeBps;
        uint256 inventory;
        uint256 shares;
        uint256 accQuotePerShare;
        uint256 remainderX;
        uint256 grossQuoteFilled;
        uint256 sellerFees;
        uint256 publicClaims;
        uint256 rewardsDistributed;
        uint256 rewardsPaid;
        uint256 roundingDustRouted;
    }

    struct Position {
        uint64 epoch;
        uint256 shares;
        uint256 debt;
        uint256 claimable;
    }

    address public immutable hook;
    address public immutable protocolOwner;
    mapping(bytes32 id => Deck) private _decks;
    mapping(bytes32 id => mapping(uint64 epoch => uint256 acc)) public closedEpochAcc;
    mapping(bytes32 id => mapping(address beneficiary => mapping(ShareClass class => Position))) public positions;
    /// @dev Share class is part of the terminal key. The pool creator may also
    /// be the protocol owner; merging their AdminFee and OwnerFee payouts would
    /// let whichever class flushes first consume the other class's proceeds.
    mapping(bytes32 id => mapping(address beneficiary => mapping(ShareClass class => uint256 amount)))
        public atomicPayout;

    event PoolConfigured(
        bytes32 indexed id, bool indexed isMain, bytes32 indexed upstream, address quote, address token, address admin
    );
    event BpsSet(bytes32 indexed id, uint16 otcBps, uint16 sellerFeeBps);
    event Deposited(bytes32 indexed id, address indexed beneficiary, ShareClass class, uint256 amount, uint256 shares);
    event Filled(bytes32 indexed id, uint256 tokenAmount, uint256 grossQuote, uint256 sellerFee);
    event Churned(bytes32 indexed id, address indexed beneficiary, ShareClass class, uint256 amount);

    constructor(address hook_, address protocolOwner_) {
        if (hook_ == address(0) || protocolOwner_ == address(0)) revert InvalidConfig();
        hook = hook_;
        protocolOwner = protocolOwner_;
    }

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    function configurePool(bytes32 id, bool isMain, bytes32 upstream, address quote, address token, address admin)
        external
        onlyHook
    {
        if (
            id == bytes32(0) || quote == address(0) || token == address(0) || quote == token || admin == address(0)
                || (isMain ? upstream != bytes32(0) : upstream == bytes32(0))
        ) revert InvalidConfig();
        Deck storage d = _decks[id];
        if (d.configured) revert InvalidPool();
        d.configured = true;
        d.isMain = isMain;
        d.upstream = upstream;
        d.quote = quote;
        d.token = token;
        d.admin = admin;
        d.epoch = 1;
        d.otcBps = 690;
        d.sellerFeeBps = 100;
        emit PoolConfigured(id, isMain, upstream, quote, token, admin);
        emit BpsSet(id, 690, 100);
    }

    function setBps(bytes32 id, uint16 otcBps, uint16 sellerFeeBps, bool ownerAuthority) external onlyHook {
        Deck storage d = _deck(id);
        uint256 minOtc = ownerAuthority ? 100 : 690;
        uint256 maxOtc = ownerAuthority ? 3_000 : 2_000;
        if (otcBps < minOtc || otcBps > maxOtc || sellerFeeBps < 100 || sellerFeeBps > 690) {
            revert InvalidBps();
        }
        d.otcBps = otcBps;
        d.sellerFeeBps = sellerFeeBps;
        emit BpsSet(id, otcBps, sellerFeeBps);
    }

    function setAdmin(bytes32 id, address newAdmin) external onlyHook {
        if (newAdmin == address(0)) revert InvalidConfig();
        Deck storage d = _deck(id);
        address oldAdmin = d.admin;
        _churnPosition(id, d, oldAdmin, ShareClass.AdminFee);
        d.admin = newAdmin;
    }

    function deposit(bytes32 id, address beneficiary, ShareClass class, uint256 amount)
        external
        onlyHook
        returns (uint256 minted)
    {
        if (beneficiary == address(0) || amount == 0) revert InvalidConfig();
        Deck storage d = _deck(id);
        minted = _deposit(id, d, beneficiary, class, amount);
    }

    /// @notice Attributes bought protocol tokens held by the hook to its
    /// owner-fee deck. Only the hook's currently wired staking factory may use
    /// this narrow allocation entry point.
    function depositBuyback(bytes32 id, uint256 amount) external returns (uint256 minted) {
        if (msg.sender != IFlashOtcModuleRegistry(hook).stakingFactory()) revert NotHook();
        if (amount == 0) revert InvalidConfig();
        Deck storage d = _deck(id);
        minted = _deposit(id, d, protocolOwner, ShareClass.OwnerFee, amount);
    }

    function recordFill(bytes32 id, uint256 tokenAmount, uint256 grossQuote)
        external
        onlyHook
        returns (uint256 sellerFee)
    {
        Deck storage d = _deck(id);
        if (tokenAmount == 0 || tokenAmount > d.inventory || grossQuote == 0) revert InsufficientInventory();
        d.inventory -= tokenAmount;
        d.grossQuoteFilled += grossQuote;
        sellerFee = grossQuote * d.sellerFeeBps / BPS;
        d.sellerFees += sellerFee;
        uint256 net = grossQuote - sellerFee;
        _route(id, d, protocolOwner, ShareClass.OwnerFee, sellerFee);
        _distributeAndChurn(id, d, net);
        emit Filled(id, tokenAmount, grossQuote, sellerFee);
    }

    function churnFor(bytes32 id, address beneficiary, ShareClass class) external onlyHook returns (uint256 amount) {
        if (class == ShareClass.Public) return 0;
        Deck storage d = _deck(id);
        amount = _churnPosition(id, d, beneficiary, class);
    }

    /// @notice Routes externally generated quote rewards through the same
    /// bounded main/sub churn graph without pretending they were OTC proceeds.
    function routeExternalQuote(bytes32 id, address beneficiary, ShareClass class, uint256 amount) external onlyHook {
        if (beneficiary == address(0) || class == ShareClass.Public || amount == 0) revert InvalidConfig();
        Deck storage d = _deck(id);
        _route(id, d, beneficiary, class, amount);
        emit Churned(id, beneficiary, class, amount);
    }

    function claimPublic(bytes32 id, address beneficiary) external onlyHook returns (address quote, uint256 amount) {
        Deck storage d = _deck(id);
        Position storage p = positions[id][beneficiary][ShareClass.Public];
        _sync(id, d, p, ShareClass.Public);
        amount = p.claimable;
        p.claimable = 0;
        d.publicClaims -= amount;
        d.rewardsPaid += amount;
        if (d.rewardsPaid > d.rewardsDistributed) revert InsolventRewards();
        quote = d.quote;
    }

    function withdrawPublic(bytes32 id, address beneficiary, uint256 sharesToBurn)
        external
        onlyHook
        returns (address token, uint256 amount)
    {
        if (sharesToBurn == 0) revert ZeroShares();
        Deck storage d = _deck(id);
        Position storage p = positions[id][beneficiary][ShareClass.Public];
        _sync(id, d, p, ShareClass.Public);
        if (p.epoch != d.epoch || sharesToBurn > p.shares || d.shares == 0) revert ZeroShares();
        amount = FullMath.mulDiv(sharesToBurn, d.inventory, d.shares);
        if (amount == 0) revert ZeroShares();
        p.shares -= sharesToBurn;
        d.shares -= sharesToBurn;
        d.inventory -= amount;
        p.debt = FullMath.mulDivRoundingUp(p.shares, d.accQuotePerShare, Q);
        token = d.token;
    }

    /// @notice Consumes a terminal payout and, for a sub pool, first advances
    /// that beneficiary's special position through the single frozen upstream
    /// main deck. The hop is bounded and never iterates over beneficiaries.
    function consumePayout(bytes32 id, address beneficiary, ShareClass class)
        external
        onlyHook
        returns (address quote, uint256 amount)
    {
        Deck storage d = _deck(id);
        if (!d.isMain) {
            id = d.upstream;
            d = _deck(id);
            _churnPosition(id, d, beneficiary, class);
        }
        amount = atomicPayout[id][beneficiary][class];
        if (amount != 0) delete atomicPayout[id][beneficiary][class];
        quote = d.quote;
    }

    function inventoryOf(bytes32 id) external view returns (uint256) {
        return _decks[id].inventory;
    }

    function poolConfig(bytes32 id)
        external
        view
        returns (
            bool configured,
            bool isMain,
            bytes32 upstream,
            address quote,
            address token,
            address admin,
            uint16 otcBps,
            uint16 sellerFeeBps
        )
    {
        Deck storage d = _decks[id];
        return (d.configured, d.isMain, d.upstream, d.quote, d.token, d.admin, d.otcBps, d.sellerFeeBps);
    }

    function poolAccounting(bytes32 id)
        external
        view
        returns (
            uint64 epoch,
            uint256 inventory,
            uint256 shares,
            uint256 grossQuoteFilled,
            uint256 sellerFees,
            uint256 publicClaims,
            uint256 rewardsDistributed,
            uint256 rewardsPaid,
            uint256 roundingDustRouted
        )
    {
        Deck storage d = _decks[id];
        return (
            d.epoch,
            d.inventory,
            d.shares,
            d.grossQuoteFilled,
            d.sellerFees,
            d.publicClaims,
            d.rewardsDistributed,
            d.rewardsPaid,
            d.roundingDustRouted
        );
    }

    function previewClaim(bytes32 id, address beneficiary, ShareClass class) external view returns (uint256 amount) {
        Deck storage d = _decks[id];
        Position storage p = positions[id][beneficiary][class];
        amount = p.claimable;
        if (p.epoch == 0) return amount;
        uint256 acc = p.epoch == d.epoch ? d.accQuotePerShare : closedEpochAcc[id][p.epoch];
        uint256 accrued = FullMath.mulDiv(p.shares, acc, Q);
        if (accrued > p.debt) amount += accrued - p.debt;
    }

    function _deposit(bytes32 id, Deck storage d, address beneficiary, ShareClass class, uint256 amount)
        private
        returns (uint256 minted)
    {
        Position storage p = positions[id][beneficiary][class];
        _sync(id, d, p, class);
        if (d.inventory == 0 && d.shares != 0) {
            closedEpochAcc[id][d.epoch] = d.accQuotePerShare;
            uint256 wholeDust = d.remainderX / Q;
            if (wholeDust != 0) {
                d.roundingDustRouted += wholeDust;
                d.rewardsPaid += wholeDust;
                if (d.rewardsPaid > d.rewardsDistributed) revert InsolventRewards();
                _route(id, d, protocolOwner, ShareClass.OwnerFee, wholeDust);
            }
            ++d.epoch;
            d.shares = 0;
            d.accQuotePerShare = 0;
            d.remainderX = 0;
        }
        if (p.epoch != d.epoch) {
            p.epoch = d.epoch;
            p.shares = 0;
            p.debt = 0;
        }
        minted = d.shares == 0 ? amount : FullMath.mulDiv(amount, d.shares, d.inventory);
        if (minted == 0) revert ZeroShares();
        d.inventory += amount;
        d.shares += minted;
        p.shares += minted;
        p.debt = FullMath.mulDivRoundingUp(p.shares, d.accQuotePerShare, Q);
        emit Deposited(id, beneficiary, class, amount, minted);
    }

    function _sync(bytes32 id, Deck storage d, Position storage p, ShareClass class) private {
        if (p.epoch == 0) {
            p.epoch = d.epoch;
            return;
        }
        uint256 acc = p.epoch == d.epoch ? d.accQuotePerShare : closedEpochAcc[id][p.epoch];
        uint256 accrued = FullMath.mulDiv(p.shares, acc, Q);
        if (accrued <= p.debt) return;
        uint256 add = accrued - p.debt;
        p.debt = accrued;
        p.claimable += add;
        if (class == ShareClass.Public) d.publicClaims += add;
    }

    function _distributeAndChurn(bytes32 id, Deck storage d, uint256 net) private {
        if (net == 0) return;
        d.rewardsDistributed += net;
        if (d.shares == 0) {
            d.roundingDustRouted += net;
            d.rewardsPaid += net;
            _route(id, d, protocolOwner, ShareClass.OwnerFee, net);
            return;
        }
        uint256 numerator = net * Q + d.remainderX;
        d.accQuotePerShare += numerator / d.shares;
        d.remainderX = numerator % d.shares;
        _churnPosition(id, d, protocolOwner, ShareClass.OwnerFee);
        _churnPosition(id, d, d.admin, ShareClass.AdminFee);
    }

    function _churnPosition(bytes32 id, Deck storage d, address beneficiary, ShareClass class)
        private
        returns (uint256 amount)
    {
        if (beneficiary == address(0)) return 0;
        Position storage p = positions[id][beneficiary][class];
        _sync(id, d, p, class);
        amount = p.claimable;
        if (amount == 0) return 0;
        p.claimable = 0;
        d.rewardsPaid += amount;
        if (d.rewardsPaid > d.rewardsDistributed) revert InsolventRewards();
        _route(id, d, beneficiary, class, amount);
        emit Churned(id, beneficiary, class, amount);
    }

    function _route(bytes32 id, Deck storage d, address beneficiary, ShareClass class, uint256 amount) private {
        if (amount == 0) return;
        if (d.isMain) {
            atomicPayout[id][beneficiary][class] += amount;
        } else {
            Deck storage upstreamDeck = _deck(d.upstream);
            _deposit(d.upstream, upstreamDeck, beneficiary, class, amount);
        }
    }

    function _deck(bytes32 id) private view returns (Deck storage d) {
        d = _decks[id];
        if (!d.configured) revert InvalidPool();
    }
}
