// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IHookStats} from "./IHookStats.sol";

import {PoolConfig, PriceData, PriceBand, Window} from "../types/PoolConfig.sol";
import {Errors} from "../libraries/Errors.sol";
import {SpreadMath} from "../libraries/SpreadMath.sol";
import {QuoteEngine} from "../libraries/QuoteEngine.sol";
import {WindowLib} from "../libraries/WindowLib.sol";
import {IHookSwapEvents} from "../interfaces/IALFHook.sol";
import {JITMath} from "./JITMath.sol";

/// @title JITRangeHook — PROTOTYPE, OUT OF AUDIT SCOPE
/// @notice The same dealer desk as `PropAMMHook`, plumbed the opposite way: instead of absorbing
///         the swap with `BEFORE_SWAP_RETURNS_DELTA` (the flag that removes the pool from
///         Uniswap's automatic routing path), it injects a REAL one-tick liquidity range at
///         `beforeSwap` and removes it at `afterSwap`, so the PoolManager's curve math runs and a
///         router simulating the swap sees real depth. The shape is Aqua0's `V4Adapter`
///         (docs/08 §2), minus the per-swap `hookData` authorization their third-party capital
///         requires — this hook is sole-operator, so it injects unconditionally off the pushed
///         price and requires no payload.
///
/// Mechanism per swap:
///   1. Price the swap with the SAME `QuoteEngine` as the live hook (mid + skew + staleness +
///      size premium), enforce the same fail-closed bounds.
///   2. Corrective swap: with no resting liquidity anywhere, `poolManager.swap` moves the pool
///      price to any target at zero token cost (SwapMath consumes nothing at liquidity 0), so
///      park the price at the effective-price tick edge. Core skips our own hook callbacks
///      (`noSelfCall`), so there is no recursion.
///   3. Inject a one-spacing-wide, single-sided range at that edge, sized (rounded up) to hold
///      the full output. The taker's swap then executes on the real curve, within one tick of
///      the effective price, on the adverse side.
///   4. `afterSwap`: remove the range, settle back to ERC-6909 claims, enforce full fill and the
///      window budget against the MEASURED amounts.
///
/// Deploy address MUST satisfy `uint160(hook) & 0x3FFF == 0x8C0`:
///   BEFORE_ADD_LIQUIDITY_FLAG (1 << 11) = 0x800  -> revert, no third-party LPs
///   BEFORE_SWAP_FLAG          (1 <<  7) = 0x080
///   AFTER_SWAP_FLAG           (1 <<  6) = 0x040
/// No RETURNS_DELTA flag anywhere — which is the point.
///
/// @dev Prototype scope, deliberately: the admin skeleton is v1's (no `Ceilings`, no band
///      anchor — a production version takes those from `PropAMMHook`); no IALFHook surface (a
///      router should quote this shape through the standard `V4Quoter`, which is exact where an
///      indicative wrapper here would be one tick optimistic); not referenced by `script/`.
///      It DOES implement URC-3 `IHookStats` so hook-stats-aware discovery can see the inventory
///      that `getLiquidity() == 0` hides.
///
/// v1.1 adds the BEACON (docs/08 §2's mitigation, docs/09's routed-around-us experiment made it
/// urgent): an owner-set, hook-owned resident position spanning the price band, so the pool
/// registers nonzero liquidity to indexers and candidate generation while JIT provides the real
/// depth. It carries no free option: every swap still passes `beforeSwap`, which re-prices the
/// pool to the desk price before anything executes, so beacon liquidity can never be hit at a
/// stale price. The corrective move can now consume real amounts -- but its counterparty is the
/// hook's own position, so value only reshuffles between the hook's claims and its beacon.
contract JITRangeHook is IHooks, IUnlockCallback, IHookStats, IHookSwapEvents {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;
    using WindowLib for Window;
    using StateLibrary for IPoolManager;

    uint256 internal constant BPS = 10_000;
    /// @dev Wei of extra output capacity per injection, covering curve-vs-QuoteEngine rounding.
    ///      Strands nothing: whatever the swap does not take comes back at removal.
    uint256 internal constant OUTPUT_HEADROOM = 8;
    bytes32 internal constant JIT_SALT = bytes32(0);
    bytes32 internal constant BEACON_SALT = bytes32(uint256(1));
    /// @dev Exact-in budget for the corrective move: far larger than any beacon could consume,
    ///      so the swap always reaches its price target and stops there.
    int256 internal constant CORRECTIVE_BUDGET = int256(1) << 100;

    IPoolManager public immutable poolManager;

    mapping(PoolId => PoolConfig) internal _config;
    mapping(PoolId => PriceData) internal _price;
    mapping(PoolId => PriceBand) internal _band;
    mapping(PoolId => Window) internal _notionalWindow;
    mapping(PoolId => Window) internal _moveWindow;
    mapping(uint256 => uint256) public reserveFloor;

    /// @notice The resident beacon position per pool (BEACON_SALT). Exists so indexers and
    ///         routing candidate generation see nonzero registered liquidity; the JIT range
    ///         still provides the actual depth at the desk price.
    struct Beacon {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(PoolId => Beacon) public beacon;

    address public owner;
    address public pendingOwner;
    address public operator;
    address public guardian;
    bool public paused;

    // ── errors specific to the JIT shape ─────────────────────────────────────
    error PartialFill();
    error NoPendingPosition();
    error PendingPositionExists();
    error TakerBeatTheQuote();

    // ── events ───────────────────────────────────────────────────────────────
    event Fill(
        PoolId indexed id,
        address indexed sender,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        uint256 notionalQuote,
        uint256 midQ128,
        uint256 effPriceQ128,
        int64 skewBps,
        uint16 spreadBps,
        uint32 priceAge
    );
    event Inject(PoolId indexed id, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event PricePushed(PoolId indexed id, uint256 priceQ128, int64 skewBps, uint256 moveBps, uint32 updatedAt);
    event ConfigSet(PoolId indexed id, PoolConfig config);
    event PriceBandSet(PoolId indexed id, uint256 minQ128, uint256 maxQ128);
    event ReserveFloorSet(uint256 indexed currencyId, uint256 floorAmount);
    event Funded(Currency indexed currency, uint256 amount, address indexed from, uint256 claimBalance);
    event Swept(Currency indexed currency, uint256 amount, address indexed to, uint256 claimBalance);
    event PausedSet(bool isPaused, address indexed by);
    event BeaconSet(PoolId indexed id, int24 tickLower, int24 tickUpper, uint128 liquidity);

    // ── transient state ──────────────────────────────────────────────────────
    /// @dev Same assembly pattern as PropAMMHook's UNLOCKING_SLOT (Solidity's `transient` needs
    ///      >= 0.8.28; this project pins 0.8.26).
    /// @dev uint256(keccak256("propWFIAT.JITRangeHook.unlocking")) - 1
    uint256 private constant UNLOCKING_SLOT = 0x8ca03899ebdbdc573984347f36191b1bb69e068c012b629441859405d86a8a04;
    /// @dev uint256(keccak256("propWFIAT.JITRangeHook.pending")) - 1; five consecutive slots:
    ///      flag, tickLower, tickUpper, liquidity, predictedOut, predictedNotional.
    uint256 private constant PENDING_BASE = 0xe2ef6575ba1a9cac874e4722bc8ed843a9360ead276be57fb134fcf290e66985;

    function _tstore(uint256 slot, uint256 v) private {
        assembly ("memory-safe") {
            tstore(slot, v)
        }
    }

    function _tload(uint256 slot) private view returns (uint256 v) {
        assembly ("memory-safe") {
            v := tload(slot)
        }
    }

    enum Action {
        FUND,
        SWEEP,
        BEACON
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert Errors.NotPoolManager();
        _;
    }

    constructor(IPoolManager _poolManager, address _owner, address _operator, address _guardian) {
        if (_owner == address(0)) revert Errors.BadRecipient();
        poolManager = _poolManager;
        owner = _owner;
        operator = _operator;
        guardian = _guardian;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true, // revert: sole-operator; core exempts our own injections
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // inject the range
            afterSwap: true, // remove the range
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false, // the whole point: no delta flag
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Swap path
    // ─────────────────────────────────────────────────────────────────────────

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (paused) revert Errors.Paused();
        if (_tload(PENDING_BASE) != 0) revert PendingPositionExists();

        PoolId id = key.toId();
        PoolConfig memory cfg = _config[id];
        if (!cfg.enabled) revert Errors.PoolDisabled();

        PriceData memory p = _price[id];
        if (p.updatedAt == 0) revert Errors.PriceNotSet();
        // forge-lint: disable-next-line(block-timestamp)
        uint256 age = block.timestamp > p.updatedAt ? block.timestamp - p.updatedAt : 0;
        if (age > cfg.maxAge) revert Errors.StalePrice();

        bool exactIn = params.amountSpecified < 0;
        if (!exactIn && !cfg.allowExactOutput) revert Errors.ExactOutputDisabled();
        uint256 specified = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        if (specified == 0) revert Errors.ZeroAmount();

        QuoteEngine.Result memory r =
            QuoteEngine.priceSwap(cfg, p.priceQ128, p.skewBps, age, params.zeroForOne, exactIn, specified);
        if (r.amountIn == 0 || r.amountOut == 0) revert Errors.ZeroAmount();

        // The curve executes within one tick of the engine price, on the adverse side -- which
        // for exact-OUTPUT means the measured input (and so the measured notional) can exceed
        // the engine's number by up to a tick. Bound everything by the engine notional plus that
        // margin (2 bps covers a tick at spacing 1 plus rounding), so the caps hold against what
        // actually executes, not against the optimistic prediction.
        uint256 notionalBound = r.notionalQuote + (r.notionalQuote * 2) / BPS + 2;
        if (notionalBound > cfg.maxSwapAmountQuote) revert Errors.SwapTooLarge();

        // Window check against the bound, committed now; afterSwap belt-checks the measurement.
        {
            Window storage w = _notionalWindow[id];
            uint256 used = w.accrue(notionalBound, cfg.windowLength);
            if (used > cfg.windowCapQuote) revert Errors.WindowCapExceeded();
            w.commit(used);
        }

        // Inventory: the range must hold the full output above the reserve floor.
        uint256 need = r.amountOut + OUTPUT_HEADROOM;
        Currency outputC = params.zeroForOne ? key.currency1 : key.currency0;
        if (poolManager.balanceOf(address(this), outputC.toId()) < need + reserveFloor[outputC.toId()]) {
            revert Errors.InsufficientInventory();
        }

        (int24 tickLower, int24 tickUpper, uint160 targetSqrt) =
            JITMath.edgeRange(r.effPriceQ128, params.zeroForOne, key.tickSpacing);

        _correctPriceTo(key, id, targetSqrt);

        uint128 liquidity = JITMath.liquidityForOutput(
            need, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), params.zeroForOne
        );
        (BalanceDelta addDelta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: JIT_SALT
            }),
            ""
        );
        // Adding owes tokens (negative deltas); pay them from claims. Single-sided by
        // construction, but settle both components so a boundary rounding cannot strand a wei.
        _settleNegative(key, addDelta);

        _tstore(PENDING_BASE, 1);
        _tstore(PENDING_BASE + 1, uint256(int256(tickLower)));
        _tstore(PENDING_BASE + 2, uint256(int256(tickUpper)));
        _tstore(PENDING_BASE + 3, liquidity);
        _tstore(PENDING_BASE + 4, r.amountOut);
        _tstore(PENDING_BASE + 5, notionalBound);
        // The quote context for afterSwap's Fill event.
        _tstore(PENDING_BASE + 6, r.effPriceQ128);
        _tstore(PENDING_BASE + 7, (uint256(r.spreadBps) << 96) | (uint256(uint64(p.skewBps)) << 32) | uint32(age));
        _tstore(PENDING_BASE + 8, p.priceQ128);

        emit Inject(id, tickLower, tickUpper, liquidity);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta swapDelta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        if (_tload(PENDING_BASE) == 0) revert NoPendingPosition();
        int24 tickLower = int24(int256(_tload(PENDING_BASE + 1)));
        int24 tickUpper = int24(int256(_tload(PENDING_BASE + 2)));
        uint128 liquidity = uint128(_tload(PENDING_BASE + 3));
        uint256 predictedOut = _tload(PENDING_BASE + 4);
        uint256 predictedNotional = _tload(PENDING_BASE + 5);
        _tstore(PENDING_BASE, 0);

        PoolId id = key.toId();

        // Remove the range; positive deltas come back as claims. fee = 0 pools accrue no fees,
        // so feesAccrued is structurally zero and principal is all there is.
        (BalanceDelta removeDelta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: -int256(uint256(liquidity)),
                salt: JIT_SALT
            }),
            ""
        );
        _mintPositive(key, removeDelta);

        // Measured amounts, from the swap's own delta (signs are the swapper's perspective).
        (uint256 measuredIn, uint256 measuredOut) = params.zeroForOne
            ? (uint256(uint128(-swapDelta.amount0())), uint256(uint128(swapDelta.amount1())))
            : (uint256(uint128(-swapDelta.amount1())), uint256(uint128(swapDelta.amount0())));

        // All-or-nothing, as the live hook: a partial fill would mean quote != execution -- and
        // V4Quoter itself reverts `NotEnoughLiquidity` on partials, so this also keeps the
        // discovery surface honest.
        bool exactIn = params.amountSpecified < 0;
        uint256 specified = exactIn ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        if ((exactIn ? measuredIn : measuredOut) != specified) revert PartialFill();

        // The taker can never do better than the quote; tripwire, not policy. (For exact-out
        // the output IS the quote by construction, so this is only load-bearing for exact-in.)
        if (measuredOut > predictedOut) revert TakerBeatTheQuote();

        PoolConfig memory cfg = _config[id];
        uint256 measuredNotional = (cfg.quoteIsCurrency0 == params.zeroForOne) ? measuredIn : measuredOut;
        if (measuredNotional > predictedNotional) revert Errors.WindowCapExceeded();

        _emitFill(id, sender, params.zeroForOne, measuredIn, measuredOut, measuredNotional);
        return (IHooks.afterSwap.selector, 0);
    }

    /// @dev Move the pool price to `target`. Where no liquidity is in the way, this is free
    ///      (`computeSwapStep` at liquidity 0 consumes nothing and jumps to the limit); where
    ///      the move crosses the BEACON, real amounts trade -- but the counterparty is the
    ///      hook's own position, so the deltas settle against the hook's claims and value only
    ///      reshuffles internally, bounded by beacon size x move distance. Core skips our own
    ///      beforeSwap/afterSwap (`noSelfCall`), so no recursion and no pending-position
    ///      interference.
    function _correctPriceTo(PoolKey calldata key, PoolId id, uint160 target) internal {
        (uint160 current,,,) = poolManager.getSlot0(id);
        if (current == target) return;
        BalanceDelta d = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: target < current,
                amountSpecified: -CORRECTIVE_BUDGET,
                sqrtPriceLimitX96: target
            }),
            ""
        );
        _settleNegative(key, d);
        _mintPositive(key, d);
    }

    function _settleNegative(PoolKey memory key, BalanceDelta d) internal {
        if (d.amount0() < 0) poolManager.burn(address(this), key.currency0.toId(), uint256(uint128(-d.amount0())));
        if (d.amount1() < 0) poolManager.burn(address(this), key.currency1.toId(), uint256(uint128(-d.amount1())));
    }

    function _mintPositive(PoolKey memory key, BalanceDelta d) internal {
        if (d.amount0() > 0) poolManager.mint(address(this), key.currency0.toId(), uint256(uint128(d.amount0())));
        if (d.amount1() > 0) poolManager.mint(address(this), key.currency1.toId(), uint256(uint128(d.amount1())));
    }

    function _emitFill(
        PoolId id,
        address sender,
        bool zeroForOne,
        uint256 measuredIn,
        uint256 measuredOut,
        uint256 measuredNotional
    ) internal {
        uint256 packed = _tload(PENDING_BASE + 7);
        emit Fill(
            id,
            sender,
            zeroForOne,
            measuredIn,
            measuredOut,
            measuredNotional,
            _tload(PENDING_BASE + 8),
            _tload(PENDING_BASE + 6),
            int64(uint64(packed >> 32)),
            uint16(packed >> 96),
            uint32(packed)
        );
        emit HookSwap(
            PoolId.unwrap(id),
            sender,
            zeroForOne ? -measuredIn.toInt128() : measuredOut.toInt128(),
            zeroForOne ? measuredOut.toInt128() : -measuredIn.toInt128(),
            0
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  No third-party liquidity. Core's `noSelfCall` never fires this for our own injections.
    // ─────────────────────────────────────────────────────────────────────────

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert Errors.NoThirdPartyLiquidity();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  URC-3 hook stats: the discovery surface for inventory `getLiquidity() == 0` hides.
    // ─────────────────────────────────────────────────────────────────────────

    function getReserves(PoolKey calldata key) external view override returns (uint256 amount0, uint256 amount1) {
        amount0 = poolManager.balanceOf(address(this), key.currency0.toId());
        amount1 = poolManager.balanceOf(address(this), key.currency1.toId());
    }

    function getEffectiveLiquidity(PoolKey calldata key)
        external
        view
        override
        returns (uint256 amount0, uint256 amount1)
    {
        uint256 b0 = poolManager.balanceOf(address(this), key.currency0.toId());
        uint256 b1 = poolManager.balanceOf(address(this), key.currency1.toId());
        uint256 f0 = reserveFloor[key.currency0.toId()];
        uint256 f1 = reserveFloor[key.currency1.toId()];
        amount0 = b0 > f0 ? b0 - f0 : 0;
        amount1 = b1 > f1 ? b1 - f1 : 0;
    }

    function hook() external view override returns (address) {
        return address(this);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IHookStats).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Operator: push price (verbatim from PropAMMHook v1)
    // ─────────────────────────────────────────────────────────────────────────

    function pushPrice(PoolId id, uint256 priceQ128, int64 skewBps) public onlyOperator {
        PoolConfig memory cfg = _config[id];
        if (!cfg.enabled) revert Errors.PoolDisabled();
        if (priceQ128 == 0) revert Errors.InvalidPrice();
        if (skewBps > cfg.maxAbsSkewBps || skewBps < -cfg.maxAbsSkewBps) revert Errors.SkewOutOfRange();

        PriceBand memory b = _band[id];
        if (b.maxQ128 != 0 && (priceQ128 < b.minQ128 || priceQ128 > b.maxQ128)) {
            revert Errors.OutsidePriceBand();
        }

        PriceData storage p = _price[id];
        uint256 prev = p.priceQ128;
        uint256 moveBps;
        if (prev != 0) {
            uint256 diff = priceQ128 > prev ? priceQ128 - prev : prev - priceQ128;
            moveBps = FullMath.mulDiv(diff, BPS, prev);
            if (cfg.maxDeviationBps != 0 && moveBps > cfg.maxDeviationBps) revert Errors.DeviationTooLarge();
            Window storage mw = _moveWindow[id];
            uint256 usedMove = mw.accrue(moveBps, cfg.moveWindowLength);
            if (usedMove > cfg.maxWindowMoveBps) revert Errors.WindowMoveExceeded();
            mw.commit(usedMove);
        }

        p.priceQ128 = priceQ128;
        // forge-lint: disable-next-line(block-timestamp,unsafe-typecast)
        p.updatedAt = uint32(block.timestamp);
        p.skewBps = skewBps;
        emit PricePushed(id, priceQ128, skewBps, moveBps, p.updatedAt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin (v1 skeleton; a production version carries PropAMMHook's Ceilings + band anchor)
    // ─────────────────────────────────────────────────────────────────────────

    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert Errors.NotAuthorized();
        paused = true;
        emit PausedSet(true, msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PausedSet(false, msg.sender);
    }

    function setConfig(PoolId id, PoolConfig calldata cfg) external onlyOwner {
        SpreadMath.validate(cfg);
        _config[id] = cfg;
        emit ConfigSet(id, cfg);
    }

    function setPriceBand(PoolId id, uint256 minQ128, uint256 maxQ128) external onlyOwner {
        if (maxQ128 != 0 && minQ128 >= maxQ128) revert Errors.InvalidConfig();
        _band[id] = PriceBand({minQ128: minQ128, maxQ128: maxQ128});
        emit PriceBandSet(id, minQ128, maxQ128);
    }

    function setReserveFloor(Currency currency, uint256 floorAmount) external onlyOwner {
        reserveFloor[currency.toId()] = floorAmount;
        emit ReserveFloorSet(currency.toId(), floorAmount);
    }

    function setOperator(address a) external onlyOwner {
        operator = a;
    }

    function setGuardian(address a) external onlyOwner {
        guardian = a;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Inventory (verbatim from PropAMMHook)
    // ─────────────────────────────────────────────────────────────────────────

    function fund(Currency currency, uint256 amount) external onlyOwner {
        if (currency.isAddressZero()) revert Errors.NativeCurrencyUnsupported();
        _tstore(UNLOCKING_SLOT, 1);
        poolManager.unlock(abi.encode(Action.FUND, currency, amount, msg.sender));
        _tstore(UNLOCKING_SLOT, 0);
        emit Funded(currency, amount, msg.sender, poolManager.balanceOf(address(this), currency.toId()));
    }

    function sweep(Currency currency, uint256 amount, address to) external onlyOwner {
        if (currency.isAddressZero()) revert Errors.NativeCurrencyUnsupported();
        if (to == address(0)) revert Errors.BadRecipient();
        _tstore(UNLOCKING_SLOT, 1);
        poolManager.unlock(abi.encode(Action.SWEEP, currency, amount, to));
        _tstore(UNLOCKING_SLOT, 0);
        emit Swept(currency, amount, to, poolManager.balanceOf(address(this), currency.toId()));
    }

    /// @notice Set, resize or remove (liquidity = 0) the pool's resident beacon position.
    ///         Funded from the hook's own claims; removal returns them. Owner-only, and safe by
    ///         construction: `beforeSwap` re-prices every swap before it executes, so beacon
    ///         liquidity is never tradable at a stale price.
    function setBeacon(PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        onlyOwner
    {
        if (liquidity != 0 && tickLower >= tickUpper) revert Errors.InvalidConfig();
        _tstore(UNLOCKING_SLOT, 1);
        poolManager.unlock(abi.encode(Action.BEACON, key, tickLower, tickUpper, liquidity));
        _tstore(UNLOCKING_SLOT, 0);
    }

    function _applyBeacon(PoolKey memory key, int24 tickLower, int24 tickUpper, uint128 liquidity) internal {
        PoolId id = key.toId();
        Beacon memory old = beacon[id];
        if (old.liquidity != 0) {
            (BalanceDelta removed,) = poolManager.modifyLiquidity(
                key,
                ModifyLiquidityParams({
                    tickLower: old.tickLower,
                    tickUpper: old.tickUpper,
                    liquidityDelta: -int256(uint256(old.liquidity)),
                    salt: BEACON_SALT
                }),
                ""
            );
            _settleNegative(key, removed);
            _mintPositive(key, removed);
        }
        if (liquidity != 0) {
            (BalanceDelta added,) = poolManager.modifyLiquidity(
                key,
                ModifyLiquidityParams({
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: int256(uint256(liquidity)),
                    salt: BEACON_SALT
                }),
                ""
            );
            _settleNegative(key, added);
            _mintPositive(key, added);
        }
        beacon[id] = Beacon({tickLower: tickLower, tickUpper: tickUpper, liquidity: liquidity});
        emit BeaconSet(id, tickLower, tickUpper, liquidity);
    }

    function unlockCallback(bytes calldata data) external override onlyPoolManager returns (bytes memory) {
        if (_tload(UNLOCKING_SLOT) == 0) revert Errors.NotSelfInitiated();
        if (abi.decode(data[0:32], (Action)) == Action.BEACON) {
            (, PoolKey memory key, int24 lo, int24 hi, uint128 liq) =
                abi.decode(data, (Action, PoolKey, int24, int24, uint128));
            _applyBeacon(key, lo, hi, liq);
            return "";
        }
        (Action action, Currency currency, uint256 amount, address party) =
            abi.decode(data, (Action, Currency, uint256, address));
        if (action == Action.FUND) {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransferFrom(party, address(poolManager), amount);
            if (poolManager.settle() != amount) revert Errors.SettleMismatch();
            poolManager.mint(address(this), currency.toId(), amount);
        } else {
            poolManager.burn(address(this), currency.toId(), amount);
            poolManager.take(currency, party, amount);
        }
        return "";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Views (same surface as PropAMMHook so the desk/API could point here unchanged)
    // ─────────────────────────────────────────────────────────────────────────

    function config(PoolId id) external view returns (PoolConfig memory) {
        return _config[id];
    }

    function price(PoolId id) external view returns (PriceData memory) {
        return _price[id];
    }

    function band(PoolId id) external view returns (PriceBand memory) {
        return _band[id];
    }

    function notionalWindow(PoolId id) external view returns (Window memory) {
        return _notionalWindow[id];
    }

    function moveWindow(PoolId id) external view returns (Window memory) {
        return _moveWindow[id];
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Unimplemented IHooks callbacks: flags off, revert loudly if ever reached.
    // ─────────────────────────────────────────────────────────────────────────

    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        revert Errors.HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        revert Errors.HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert Errors.HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert Errors.HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert Errors.HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert Errors.HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert Errors.HookNotImplemented();
    }
}
