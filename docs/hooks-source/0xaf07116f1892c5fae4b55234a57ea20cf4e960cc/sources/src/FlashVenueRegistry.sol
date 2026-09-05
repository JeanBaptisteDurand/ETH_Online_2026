// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFlashVenueAdapter} from "./venues/IFlashVenueAdapter.sol";
import {IFlashSafeVenueAdapter} from "./venues/IFlashSafeVenueAdapter.sol";

interface IFlashPoolAdminAuthority {
    function adminOf(bytes32 poolId) external view returns (address);
}

/// @notice Bounded, chain-local venue configuration for FLASH hybrid pools.
/// Uniswap v4 is implicit; every registered pool must launch with at least one
/// approved external venue and may receive additional owner-approved venues.
contract FlashVenueRegistry {
    error NotOwner();
    error NotHook();
    error NotPoolAuthority();
    error ZeroAddress();
    error AdapterNotApproved();
    error PoolAlreadyRegistered();
    error PoolNotRegistered();
    error VenueAlreadyRegistered();
    error VenueLimit();
    error LastVenue();
    error InvalidPool();

    uint256 public constant MAX_EXTERNAL_VENUES = 4;

    struct Venue {
        address adapter;
        address venuePool;
        bool enabled;
    }

    address public immutable owner;
    address public immutable hook;
    IFlashPoolAdminAuthority public immutable poolAdmins;
    mapping(address adapter => bool approved) public approvedAdapter;
    mapping(bytes32 poolId => bool registered) public poolRegistered;
    mapping(bytes32 poolId => address token0) public poolToken0;
    mapping(bytes32 poolId => address token1) public poolToken1;
    mapping(bytes32 poolId => Venue[]) private venues;
    mapping(bytes32 poolId => mapping(bytes32 venueKey => bool exists)) private venueExists;

    event AdapterApprovalSet(address indexed adapter, bool approved);
    event PoolVenuesInitialized(bytes32 indexed poolId, address indexed adapter, address indexed venuePool);
    event VenueAdded(bytes32 indexed poolId, address indexed adapter, address indexed venuePool);
    event VenueEnabled(bytes32 indexed poolId, uint256 indexed index, bool enabled);

    constructor(address owner_, address hook_, IFlashPoolAdminAuthority poolAdmins_) {
        if (owner_ == address(0) || hook_ == address(0) || address(poolAdmins_) == address(0)) revert ZeroAddress();
        owner = owner_;
        hook = hook_;
        poolAdmins = poolAdmins_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPoolAuthority(bytes32 poolId) {
        if (msg.sender != owner && msg.sender != poolAdmins.adminOf(poolId)) revert NotPoolAuthority();
        _;
    }

    function setAdapterApproval(address adapter, bool approved) external onlyOwner {
        if (adapter == address(0) || adapter.code.length == 0) revert ZeroAddress();
        if (approved && IFlashSafeVenueAdapter(adapter).safeQuoteVersion() != IFlashSafeVenueAdapter.safeQuoteVersion.selector) {
            revert AdapterNotApproved();
        }
        approvedAdapter[adapter] = approved;
        emit AdapterApprovalSet(adapter, approved);
    }

    /// @notice Called atomically by the hook during pool launch. `venuePool`
    /// must already be deployed and verified by its approved adapter. This lets
    /// legacy tokens such as POKE attach their existing external liquidity; the
    /// registry never assumes that launch creates a new external pool.
    function initializePool(bytes32 poolId, address token0, address token1, address adapter, address venuePool) external {
        if (msg.sender != hook) revert NotHook();
        if (poolRegistered[poolId]) revert PoolAlreadyRegistered();
        if (token0 == address(0) || token1 == address(0) || token0 == token1) revert ZeroAddress();
        _validate(adapter, venuePool, token0, token1);
        poolRegistered[poolId] = true;
        poolToken0[poolId] = token0;
        poolToken1[poolId] = token1;
        _add(poolId, adapter, venuePool);
        emit PoolVenuesInitialized(poolId, adapter, venuePool);
    }

    /// @notice Owner or the current pool admin may attach another existing route.
    /// Adapter approval remains owner-only, while supportsPool verifies factory,
    /// token pair and pool type before the route is stored.
    function addVenue(bytes32 poolId, address adapter, address venuePool) external onlyPoolAuthority(poolId) {
        if (!poolRegistered[poolId]) revert PoolNotRegistered();
        _validate(adapter, venuePool, poolToken0[poolId], poolToken1[poolId]);
        if (venues[poolId].length >= MAX_EXTERNAL_VENUES) revert VenueLimit();
        _add(poolId, adapter, venuePool);
        emit VenueAdded(poolId, adapter, venuePool);
    }

    function setVenueEnabled(bytes32 poolId, uint256 index, bool enabled) external onlyPoolAuthority(poolId) {
        Venue storage venue = venues[poolId][index];
        if (!enabled && venue.enabled && activeVenueCount(poolId) == 1) revert LastVenue();
        venue.enabled = enabled;
        emit VenueEnabled(poolId, index, enabled);
    }

    function venueCount(bytes32 poolId) external view returns (uint256) { return venues[poolId].length; }
    function venueAt(bytes32 poolId, uint256 index) external view returns (Venue memory) { return venues[poolId][index]; }

    function activeVenueCount(bytes32 poolId) public view returns (uint256 count) {
        Venue[] storage list = venues[poolId];
        for (uint256 i; i < list.length; ++i) if (list[i].enabled) ++count;
    }

    function _validate(address adapter, address venuePool, address token0, address token1) private view {
        if (!approvedAdapter[adapter]) revert AdapterNotApproved();
        if (venuePool == address(0) || venuePool.code.length == 0) revert ZeroAddress();
        if (!IFlashVenueAdapter(adapter).supportsPool(venuePool, token0, token1)) revert InvalidPool();
    }

    function _add(bytes32 poolId, address adapter, address venuePool) private {
        bytes32 key = keccak256(abi.encode(adapter, venuePool));
        if (venueExists[poolId][key]) revert VenueAlreadyRegistered();
        venueExists[poolId][key] = true;
        venues[poolId].push(Venue({adapter: adapter, venuePool: venuePool, enabled: true}));
    }
}
