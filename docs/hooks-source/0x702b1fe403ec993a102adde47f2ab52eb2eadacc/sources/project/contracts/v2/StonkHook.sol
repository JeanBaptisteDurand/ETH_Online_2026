// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IStonkTokenV2} from "./interfaces/IStonkTokenV2.sol";

// Highest trade rate the protocol will accept anywhere: 5%, against a live rate of 1%.
// File-level so StonkFactoryV2 can enforce the same number at config time without
// duplicating it -- Solidity cannot read another contract's constant.
//
// A sanity bound, not a business one. Without it the ceiling is MAX_LP_FEE -- a 100% fee,
// which withholds the entire asset leg and hands the trader nothing. The blast radius is
// smaller than it looks, since a pool's rate is fixed at registration and no live token can
// be retuned, but a misconfigured AssetConfig would poison every launch after it.
//
// Deliberately a constant rather than an owner setting: a bound the owner can raise is not a
// bound. Changing it means deploying a new hook and factory.
uint24 constant STONK_MAX_TRADE_FEE = 50_000;

/**
 * @title StonkHook
 * @notice Policy hook for Stonk v4 pools: trading-window defence in depth, permanently
 *         locked and permanently exclusive protocol liquidity, a per-swap size cap, and a
 *         flat trade fee withheld from the asset leg so no fee is ever denominated in the
 *         launched token.
 *
 * @dev WHAT THIS HOOK DOES *NOT* DO
 *
 *      It does not enforce the NYSE lock. It cannot: `PoolManager.initialize` is
 *      permissionless, so a rogue STONK pool with `hooks = address(0)` never calls this
 *      code. Enforcement lives in StonkTokenV2's transfer path, which is universal. The
 *      `beforeSwap` window check here exists because a hook revert happens earlier, costs
 *      less gas, and reads more clearly to simulating aggregators than an ERC20 revert
 *      part-way through settlement.
 *
 *      It does not price the curve either. Pricing is ordinary concentrated liquidity,
 *      shaped by StonkFactoryV2 into single-sided positions that reproduce the v1 bonding
 *      curve exactly.
 *
 *      THE FEE IS TAKEN FROM THE ASSET LEG, AT SWAP TIME, ALWAYS
 *
 *      v4's native LP fee is charged on whichever token the trader puts IN, so a sell would
 *      pay in STONK. Fees denominated in the launched token have to be sold before anyone
 *      can be paid in something they want, and a sale batched to a collection call is one
 *      visible print on the chart at a publicly known time rather than the drip it looks
 *      like on paper. So the pool's LP fee is overridden to ZERO and this hook withholds
 *      the fee from the ASSET side of every swap instead. Sell 100 STONK for 10 USDC and
 *      0.1 USDC is withheld. No STONK is ever created as a fee, so none ever needs selling,
 *      and `StonkFeeLocker` only ever holds the asset.
 *
 *      Which callback does the withholding depends on where v4 puts the asset, and all four
 *      cases are covered -- see `_assetIsSpecified`.
 *
 *      THE COSTS, STATED PLAINLY
 *
 *      This needs BEFORE_SWAP_RETURNS_DELTA and AFTER_SWAP_RETURNS_DELTA, which is custom
 *      accounting against the singleton PoolManager -- the highest-risk hook category there
 *      is. The mechanism itself is the established one for withholding inside a v4 hook
 *      (`poolManager.mint` of an ERC-6909 claim rather than a real `take` mid-swap, swept
 *      later), which is some assurance the pattern is sound. Note though that ALL fee
 *      revenue is routed through it, not merely a protocol slice: a fault here affects
 *      every beneficiary's entire entitlement rather than a portion of it.
 *
 *      It also leaves `slot0.lpFee` reading zero while the real cost is nonzero, so
 *      integrators that price from pool state understate it. Aggregators that simulate are
 *      unaffected: a simulated quote runs `beforeSwap` and therefore sees the withholding,
 *      matching the fill exactly. A caller that prices from `slot0` and sets its slippage
 *      bound accordingly reverts on that bound rather than being filled worse, so the
 *      exposure is a misleading quote, never a misleading execution. `hookData` stays
 *      optional, so no router is locked out.
 *
 *      THE RATE IS FLAT
 *
 *      There is no launch-time premium that decays into the base rate. Launches are batched
 *      to the NYSE opening bell, so the fair-launch primitive is the calendar rather than a
 *      per-pool race, and a rate that moves block to block makes every quote a moving
 *      target for no benefit. `cfg.fee` is set once in `registerPool` and there is no
 *      setter, so it is immutable per pool.
 *
 *      WHY IHooks IS IMPLEMENTED DIRECTLY
 *
 *      v4-periphery ships a `BaseHook` that provides exactly the dispatch boilerplate
 *      below, but it imports v4-core through its own vendored copy. Solidity identifies
 *      types by source path, so mixing that copy with the standalone v4-core package fails
 *      to compile ("Invalid implicit conversion from contract IPoolManager to contract
 *      IPoolManager"). Rather than take on that dependency or keep a local base contract
 *      purely to work around it, `IHooks` is implemented here. It also removes a layer:
 *      each callback is one function, not an external wrapper delegating to an overridable
 *      internal that nothing else ever overrides.
 *
 *      IHooks requires all ten callbacks to exist. The five whose permission bits are unset
 *      -- beforeInitialize, afterAddLiquidity, afterRemoveLiquidity, beforeDonate,
 *      afterDonate -- can never be invoked by PoolManager and simply revert.
 */
contract StonkHook is IHooks {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;
    using CurrencyLibrary for Currency;

    /// @notice 100% in v4 fee units (pips: 1e6 == 100%). The denominator for fee math.
    uint24 public constant MAX_FEE = LPFeeLibrary.MAX_LP_FEE;

    /// @notice Highest rate `registerPool` accepts. See `STONK_MAX_TRADE_FEE` above.
    uint24 public constant MAX_TRADE_FEE = STONK_MAX_TRADE_FEE;

    /// @dev `token`, `initialized`, `fee` and `maxSwapOut` are read at runtime. The tick
    ///      bounds are stored for introspection only, so indexers and tests can recover a
    ///      pool's discovery band from the hook alone.
    struct PoolConfig {
        address token;
        bool tokenIsZero;
        bool initialized;
        int24 discoveryLower;
        int24 discoveryUpper;
        /// @dev Flat trade rate in pips, withheld from the asset leg. Set once, no setter.
        uint24 fee;
        uint256 maxSwapOut;
    }

    IPoolManager public immutable poolManager;
    address public immutable factory;
    /// @notice Where `sweepFees` redeems the hook's claims. Never holds STONK by design.
    address public immutable feeLocker;

    mapping(PoolId => PoolConfig) internal _pools;

    /// @notice Asset-denominated fees withheld but not yet allocated to beneficiaries.
    ///         Held as ERC-6909 claims on the PoolManager until `sweepFees`.
    mapping(PoolId => uint256) public pendingFees;

    /* -------------------------------- Events -------------------------------- */

    event PoolRegistered(PoolId indexed poolId, address indexed token, bool tokenIsZero);
    /// @notice Fee withheld in the ASSET at swap time, never in the launched token.
    event FeeTaken(PoolId indexed poolId, uint256 amount, bool viaBeforeSwap);
    /// @notice Trade-referral attribution. Off-chain only -- not paid from the fee split.
    event SwapReferred(
        PoolId indexed poolId,
        address indexed referrer,
        address indexed token,
        uint256 amountSpecified,
        bool zeroForOne
    );

    /* -------------------------------- Errors -------------------------------- */

    error NotPoolManager();
    error HookNotImplemented();
    error OnlyFactory();
    error PoolNotRegistered();
    error PoolAlreadyRegistered();
    error DynamicFeeRequired();
    error InvalidFee(uint24 fee);
    error TradingWindowClosed();
    error LiquidityLocked();
    error ProtocolLiquidityIsPermanent();
    error SwapExceedsWalletCap(uint256 amountOut, uint256 cap);
    error TokenMustBeCurrency0();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    constructor(IPoolManager _poolManager, address _factory, address _feeLocker) {
        poolManager = _poolManager;
        factory = _factory;
        feeLocker = _feeLocker;
        // Reverts unless the deployed address encodes exactly the permissions below, which
        // is why deployment requires a CREATE2 salt mined for the 0x1ACC suffix.
        Hooks.validateHookPermissions(this, getHookPermissions());
    }

    /**
     * @dev Address must encode exactly these bits (suffix 0x1ACC):
     *      afterInitialize 1<<12 | beforeAddLiquidity 1<<11 | beforeRemoveLiquidity 1<<9
     *      | beforeSwap 1<<7 | afterSwap 1<<6
     *      | beforeSwapReturnDelta 1<<3 | afterSwapReturnDelta 1<<2
     *
     *      The two delta bits are what let the hook withhold the fee from the asset leg.
     *      They are also the whole of its value-moving surface: nothing else in this
     *      contract touches balances.
     */
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /* ------------------------------------------------------------------ */
    /*                            Registration                            */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Stage a pool's policy before the factory initializes it.
     * @dev Written ahead of `initialize` because `afterInitialize` cannot receive
     *      parameters. The `afterInitialize` callback then verifies that the pool actually
     *      created matches what was staged.
     */
    function registerPool(PoolKey calldata key, PoolConfig calldata config) external onlyFactory {
        PoolId id = key.toId();
        if (_pools[id].initialized) revert PoolAlreadyRegistered();
        // The pool must be DYNAMIC-flagged, because `beforeSwap` returns OVERRIDE_FEE_FLAG
        // to force the native LP fee to zero and v4 only honours an override on a dynamic
        // pool. Registering a static pool would charge the key's rate natively -- in STONK
        // on sells -- on top of what this hook withholds. Cheap check, expensive mistake.
        if (!key.fee.isDynamicFee()) revert DynamicFeeRequired();
        // Mirrors the factory's own bound. Zero would silently make trading free; the upper
        // bound stops a misconfigured AssetConfig from withholding the whole asset leg.
        if (config.fee == 0 || config.fee > MAX_TRADE_FEE) revert InvalidFee(config.fee);
        // The fee logic reads the asset as currency1 and the wallet-cap check reads the
        // launched token as currency0, both unconditionally; the factory's band math assumes
        // the same orientation. The factory mines the clone salt to guarantee it. Assert
        // rather than trust: getting it wrong would withhold the fee in the wrong currency.
        if (!config.tokenIsZero) revert TokenMustBeCurrency0();

        PoolConfig memory cfg = config;
        cfg.initialized = true;
        _pools[id] = cfg;

        emit PoolRegistered(id, cfg.token, cfg.tokenIsZero);
    }

    function poolConfig(PoolKey calldata key) external view returns (PoolConfig memory) {
        return _pools[key.toId()];
    }

    /// @notice `pendingFees` for callers holding the key rather than the id. Mirrors
    ///         `poolConfig`, so an integrator never has to hash the key itself.
    function pendingFeesFor(PoolKey calldata key) external view returns (uint256) {
        return pendingFees[key.toId()];
    }

    /* ------------------------------------------------------------------ */
    /*                           Fee withholding                          */
    /* ------------------------------------------------------------------ */

    /**
     * @dev Which currency the swapper pinned. v4 maps the specified side to currency0
     *      exactly when `(amountSpecified < 0) == zeroForOne`, so with the token as
     *      currency0 the asset is specified precisely when that equality FAILS.
     *
     *          buy  exact-in   -> asset specified    (beforeSwap withholds)
     *          buy  exact-out  -> asset unspecified  (afterSwap withholds)
     *          sell exact-in   -> asset unspecified  (afterSwap withholds)  <-- the case
     *                                                                          this design
     *                                                                          exists for
     *          sell exact-out  -> asset specified    (beforeSwap withholds)
     *
     *      Derived from v4-core `Hooks.sol`, not assumed. All four are covered because a
     *      missed case does not fail loudly -- it silently trades for free.
     */
    function _assetIsSpecified(SwapParams calldata params) internal pure returns (bool) {
        return (params.amountSpecified < 0) != params.zeroForOne;
    }

    /**
     * @dev Claim `amount` of the asset as an ERC-6909 balance and record it for allocation.
     *
     *      Deliberately `mint`, NOT `take`. `take` moves real ERC20 balance out of the
     *      PoolManager, and mid-swap the router has not settled yet -- so the PoolManager
     *      may not hold the asset at all and the transfer underflows inside the token.
     *      `mint` only credits an internal claim, which the returned delta then settles.
     *      Real tokens leave later, via `sweepFees`, once settlement is done. This is the
     *      conventional choice for fee-withholding hooks, for the same reason.
     */
    function _takeAssetFee(PoolId id, PoolKey calldata key, uint256 amount, bool viaBefore)
        internal
    {
        poolManager.mint(address(this), key.currency1.toId(), amount);
        pendingFees[id] += amount;
        emit FeeTaken(id, amount, viaBefore);
    }

    /// @notice Hand accumulated fees to the factory for allocation, and reset the counter.
    /// @dev Bookkeeping only -- `sweepFees` is what moves the tokens.
    function consumePendingFees(PoolKey calldata key)
        external
        onlyFactory
        returns (uint256 amount)
    {
        PoolId id = key.toId();
        amount = pendingFees[id];
        if (amount != 0) pendingFees[id] = 0;
    }

    /**
     * @notice Redeem the hook's ERC-6909 claims into real tokens at the locker.
     * @dev Runs inside the factory's unlock during `distributeFees`, which is outside any
     *      swap, so the PoolManager definitely holds the funds by then. Factory-only: the
     *      destination is fixed at construction, so this cannot send anywhere else, but
     *      gating it keeps the burn and the bookkeeping reset in one caller's control.
     */
    function sweepFees(Currency currency, uint256 amount) external onlyFactory {
        poolManager.burn(address(this), currency.toId(), amount);
        poolManager.take(currency, feeLocker, amount);
    }

    /* ------------------------------------------------------------------ */
    /*                          Live callbacks                            */
    /* ------------------------------------------------------------------ */

    /// @dev Rejects any pool the factory did not stage, so the hook's policy cannot be
    ///      borrowed by a pool someone else initializes. Nothing else to do: the fee is
    ///      static, so `slot0.lpFee` is already correct the moment the pool exists.
    function afterInitialize(address sender, PoolKey calldata key, uint160, int24)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory) revert OnlyFactory();
        if (!_pools[key.toId()].initialized) revert PoolNotRegistered();
        return IHooks.afterInitialize.selector;
    }

    /**
     * @dev The factory is the ONLY address that may ever add liquidity to a Stonk pool.
     *      There is no switch to open it up later.
     *
     *      Two things follow. A third party cannot seed a cheaper competing position inside
     *      the protocol's pool and erase the early-buyer edge. And because those positions
     *      are the only positions, beneficiaries capture 100% of the fee THIS POOL charges,
     *      rather than sharing it pro-rata with outside LPs.
     *
     *      SCOPE: that is a statement about this pool, not about the token. `initialize` is
     *      permissionless on every venue, so anyone may stand up a rival STONK pool -- v4
     *      with `hooks = address(0)`, v2, v3, anything -- and this hook never runs for it.
     *      Such a pool charges no protocol fee and applies no `maxSwapOut`, and because
     *      `StonkTokenV2.isWalletCapExempt` exempts the PoolManager ADDRESS rather than a
     *      specific pool, a rival v4 pool on the same singleton can hold unbounded STONK
     *      while every real wallet stays capped. Aggregators will prefer it precisely
     *      because it is cheaper.
     *
     *      This is inherent to launching a composable ERC20 and is accepted, not
     *      overlooked. What survives on every venue is the trading window, because
     *      `StonkTokenV2.transfer` gates both legs and PoolManager is never window-exempt;
     *      see that contract's header. Fee capture does not survive. Do not plan revenue
     *      on the assumption that it does.
     */
    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        bytes calldata
    ) external view onlyPoolManager returns (bytes4) {
        if (!_pools[key.toId()].initialized) revert PoolNotRegistered();
        if (sender != factory) revert LiquidityLocked();
        return IHooks.beforeAddLiquidity.selector;
    }

    /**
     * @dev The protocol position can never be withdrawn -- only its fees collected
     *      (`liquidityDelta == 0`). This is the "liquidity is permanently locked"
     *      guarantee, enforced in code rather than by burning an LP token. Paired with
     *      `beforeAddLiquidity`, it means the pool's liquidity is fixed at launch and
     *      belongs to nobody: it can never be withdrawn, and no one else can ever join it.
     *
     *      The withdrawal ban is checked on EVERY sender, not just the factory. Only the
     *      factory can hold a position, so a third-party removal would fail inside v4
     *      anyway -- but relying on that would make this guard's correctness depend on
     *      `beforeAddLiquidity` still being right. Rejecting any negative delta outright
     *      keeps the invariant self-contained and legible: no liquidity ever leaves a
     *      Stonk pool, whoever asks.
     *
     *      `liquidityDelta == 0` still passes, which is the fee harvest `collectFees`
     *      performs; v4 routes a zero delta here rather than to `beforeAddLiquidity`.
     */
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) external view onlyPoolManager returns (bytes4) {
        if (!_pools[key.toId()].initialized) revert PoolNotRegistered();
        if (params.liquidityDelta < 0) revert ProtocolLiquidityIsPermanent();
        return IHooks.beforeRemoveLiquidity.selector;
    }

    /**
     * @dev `hookData` is read but never required. When a router supplies exactly 32 bytes it
     *      is decoded as a trade-referrer address and emitted for attribution; empty hookData
     *      is the normal path and behaves identically. That distinction matters because a
     *      hook that *requires* custom data breaks every router that passes none, which is
     *      most of them; an optional read keeps the pool usable by every aggregator while
     *      still allowing an integrating frontend to claim credit.
     *
     *      Attribution is emitted, not settled per swap. The hook does return deltas, so
     *      splitting a referral out of the swap itself is mechanically possible; it is
     *      deliberately not done, because it would mean a per-trade storage write and a
     *      second split in the hot path for a bucket that is settled just as accurately off
     *      the collected fee pool. The on-chain fee split pays the launch-time platform
     *      referrer, not this address.
     */
    function beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId id = key.toId();
        PoolConfig memory cfg = _pools[id];
        if (!cfg.initialized) revert PoolNotRegistered();

        // Defence in depth. StonkTokenV2 would revert during settlement anyway; failing
        // here is cheaper and gives quoters an unambiguous reason.
        if (!IStonkTokenV2(cfg.token).isTradingOpen()) revert TradingWindowClosed();

        if (hookData.length == 32) {
            address referrer = abi.decode(hookData, (address));
            if (referrer != address(0)) {
                uint256 size = params.amountSpecified < 0
                    ? uint256(-params.amountSpecified)
                    : uint256(params.amountSpecified);
                emit SwapReferred(id, referrer, cfg.token, size, params.zeroForOne);
            }
        }

        // When the asset is the SPECIFIED currency the fee is a slice of an amount already
        // known, so withhold it here. v4-core does `amountToSwap += specifiedDelta`, so a
        // positive value shrinks what reaches the curve by exactly the fee.
        BeforeSwapDelta hookDelta = BeforeSwapDeltaLibrary.ZERO_DELTA;
        if (_assetIsSpecified(params)) {
            uint256 amount = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);
            uint256 fee = (amount * cfg.fee) / MAX_FEE;
            if (fee > 0) {
                _takeAssetFee(id, key, fee, true);
                hookDelta = toBeforeSwapDelta(int128(uint128(fee)), 0);
            }
        }

        // Native LP fee forced to ZERO: this hook is the only thing charging, so the
        // position never accrues a STONK-denominated fee that would later need selling.
        return (IHooks.beforeSwap.selector, hookDelta, LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    /**
     * @notice Rejects any single swap that would move more than the wallet cap.
     * @dev PARTIAL CHECK BY DESIGN. `beforeSwap`/`afterSwap` receive the *router* as
     *      `sender`, not the end recipient, so the hook cannot evaluate a true per-wallet
     *      cap. Learning the recipient would require `hookData`, and a hook that requires
     *      custom data inputs is unusable by any router that does not supply it.
     *
     *      So the hook catches the recipient-independent case (a single swap larger than
     *      the entire cap, which can never succeed for anyone) and StonkTokenV2's `_update`
     *      remains the authoritative per-wallet enforcement. A buyer already holding, say,
     *      4.9% will still be quoted and then revert at settlement; that is an accepted
     *      and documented limitation of enforcing wallet caps behind an AMM.
     *
     *      Checked in `afterSwap` rather than `beforeSwap` because only the realised
     *      BalanceDelta gives the exact output for an exact-input swap.
     */
    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolConfig memory cfg = _pools[id];

        // Positive delta == owed to the swapper, i.e. tokens leaving the pool on a buy.
        int128 tokenDelta = delta.amount0();
        if (tokenDelta > 0) {
            uint256 amountOut = uint256(uint128(tokenDelta));
            if (amountOut > cfg.maxSwapOut) revert SwapExceedsWalletCap(amountOut, cfg.maxSwapOut);
        }

        // When the asset is the UNSPECIFIED currency its amount is only known once the swap
        // has run, so the fee is withheld here instead. The returned int128 lands on
        // hookDeltaUnspecified, which is the asset side in exactly these cases -- including
        // `sell exact-in`, the case this whole design exists for.
        int128 hookDelta = 0;
        if (!_assetIsSpecified(params)) {
            int128 assetDelta = delta.amount1();
            uint256 assetAmount =
                assetDelta < 0 ? uint256(uint128(-assetDelta)) : uint256(uint128(assetDelta));
            uint256 fee = (assetAmount * cfg.fee) / MAX_FEE;
            if (fee > 0) {
                _takeAssetFee(id, key, fee, false);
                hookDelta = int128(uint128(fee));
            }
        }

        return (IHooks.afterSwap.selector, hookDelta);
    }

    /* ------------------------------------------------------------------ */
    /*                        Disabled callbacks                          */
    /* ------------------------------------------------------------------ */
    //
    // Required by IHooks, but their permission bits are unset in getHookPermissions, so
    // PoolManager can never invoke them. They revert rather than returning a selector, so
    // a future permission change that forgot to implement one would fail loudly.

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
