// SPDX-License-Identifier: MIT
// ┌────────────────────────────────────────────────┐
// │  BaseStonk                                     │
// │  Token launchpad on Base, Uniswap v4 hooks     │
// │  https://basestonk.io                          │
// └────────────────────────────────────────────────┘

pragma solidity ^0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-core/test/utils/LiquidityAmounts.sol";
import {LaunchFees} from "../LaunchFees.sol";

contract AdvancedFeeHookV5 is IHooks {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeCast for uint256;

    uint256 private constant BPS = 10_000;

    struct Payee {
        address to;
        uint16 shareBps;
    }

    struct Config {

        uint16 taxBps;

        uint16 burnBps;

        uint16 liquidityBps;

        bool set;
    }

    IPoolManager public immutable poolManager;
    address public immutable platformTreasury;
    address public immutable launcher;
    address public immutable platformAdmin;

    address internal constant BURN = 0x000000000000000000000000000000000000dEaD;

    mapping(PoolId => Config) public configOf;

    mapping(PoolId => Payee[]) internal payeesOf;

    uint256 public constant MAX_PAYEES = 8;

    error NotPoolManager();
    error NotLauncher();
    error NotRecipientOrAdmin();
    error AlreadyConfigured();
    error PoolNotConfigured();
    error TaxTooHigh(uint16 got, uint256 max);
    error SharesMustSumToBps(uint256 got);
    error TooManyPayees(uint256 got, uint256 max);
    error PayeeRequired();

    error PayeeAlreadyHoldsSlot(address to);
    error HookNotImplemented();

    event PoolConfigured(
        PoolId indexed id,
        uint16 taxBps,
        uint16 burnBps,
        uint16 liquidityBps,
        uint256 payees
    );
    event FeeTaken(PoolId indexed id, Currency currency, uint256 platform, uint256 creator);
    event CreatorShareSplit(PoolId indexed id, uint256 burnt, uint256 toLiquidity, uint256 paid);
    event PayeesChanged(PoolId indexed id, uint256 count);
    event PayeeSlotTransferred(PoolId indexed id, address indexed from, address indexed to);

    event RemainderSwept(PoolId indexed id, Currency currency, uint256 amount);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _platformTreasury,
        address _launcher,
        address _platformAdmin
    ) {
        poolManager = _poolManager;
        platformTreasury = _platformTreasury;
        launcher = _launcher;
        platformAdmin = _platformAdmin;
    }

    function configurePool(
        PoolKey calldata key,
        uint16 taxBps,
        uint16 burnBps,
        uint16 liquidityBps,
        Payee[] memory payees
    ) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (taxBps > LaunchFees.MAX_TAX_BPS) revert TaxTooHigh(taxBps, LaunchFees.MAX_TAX_BPS);
        if (uint256(burnBps) + liquidityBps > BPS) {
            revert SharesMustSumToBps(uint256(burnBps) + liquidityBps);
        }

        PoolId id = key.toId();
        if (configOf[id].set) revert AlreadyConfigured();

        _writePayees(id, payees, uint256(burnBps) + liquidityBps);

        configOf[id] = Config({
            taxBps: taxBps,
            burnBps: burnBps,
            liquidityBps: liquidityBps,
            set: true
        });
        emit PoolConfigured(id, taxBps, burnBps, liquidityBps, payees.length);
    }

    function setPayees(PoolKey calldata key, Payee[] calldata payees) external {
        PoolId id = key.toId();
        Config memory c = configOf[id];
        if (!c.set) revert PoolNotConfigured();
        if (msg.sender != platformAdmin) revert NotRecipientOrAdmin();

        _writePayees(id, payees, uint256(c.burnBps) + c.liquidityBps);
        emit PayeesChanged(id, payees.length);
    }

    uint256 public constant PAYOUT_GAS = 500_000;

    event PayoutDeferred(address indexed to, Currency indexed currency, uint256 amount);

    function _payOut(Currency currency, address to, uint256 amount) private {
        if (amount == 0) return;
        try poolManager.take{gas: PAYOUT_GAS}(currency, to, amount) {
            return;
        } catch {
            poolManager.mint(to, currency.toId(), amount);
            emit PayoutDeferred(to, currency, amount);
        }
    }

    int24 internal constant LP_WIDTH = 10;

    event LiquidityAdded(PoolId indexed id, Currency currency, uint256 amount, uint128 liquidity);

    event LiquidityFeesCollected(PoolId indexed id, Currency currency, uint256 amount);

    event WedgeUndone(PoolId indexed id, int24 lower, int24 upper, uint128 liquidity);

    event WedgePaidForItself(PoolId indexed id, Currency currency, uint256 surplus);

    event BoughtBackAndBurnt(PoolId indexed id, uint256 spent, uint256 burnt);

    function _buybackAndBurn(PoolKey calldata key, PoolId id, uint256 amount)
        private
        returns (uint256 spent)
    {
        if (amount == 0) return 0;
        try poolManager.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        ) returns (BalanceDelta d) {
            int128 got = d.amount0();
            int128 paid = d.amount1();

            if (got <= 0 || paid >= 0) {
                _collect(id, key.currency0, got);
                _collect(id, key.currency1, paid);
                return paid < 0 ? uint256(uint128(-paid)) : 0;
            }

            _payOut(key.currency0, BURN, uint256(uint128(got)));
            spent = uint256(uint128(-paid));
            emit BoughtBackAndBurnt(id, spent, uint256(uint128(got)));
        } catch {
            spent = 0;
        }
    }

    function _oneSidedRange(PoolId id, int24 spacing, bool isToken0)
        private
        view
        returns (int24 lower, int24 upper)
    {
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(id);
        int24 aligned = (tick / spacing) * spacing;
        if (aligned > tick) aligned -= spacing;

        int24 span = spacing * LP_WIDTH;

        if (isToken0) {
            if (aligned >= TickMath.MAX_TICK - span - spacing * 2) return (0, 0);
            lower = aligned + spacing;
            if (TickMath.getSqrtPriceAtTick(lower) < sqrtPriceX96) lower += spacing;
            upper = lower + span;
            if (upper >= TickMath.MAX_TICK) return (0, 0);
        } else {
            if (aligned <= TickMath.MIN_TICK + span + spacing) return (0, 0);
            upper = aligned;
            if (TickMath.getSqrtPriceAtTick(upper) > sqrtPriceX96) upper -= spacing;
            lower = upper - span;
            if (lower <= TickMath.MIN_TICK) return (0, 0);
        }
    }

    struct Wedge {
        int24 lower;
        int24 upper;
        uint128 liquidity;
        bool isToken0;
    }

    function _addSingleSided(PoolKey calldata key, PoolId id, Currency currency, uint256 amount)
        private
        returns (uint256 spent)
    {
        Wedge memory w;
        w.isToken0 = Currency.unwrap(currency) == Currency.unwrap(key.currency0);
        (w.lower, w.upper) = _oneSidedRange(id, key.tickSpacing, w.isToken0);
        if (w.lower == w.upper) return 0;

        w.liquidity = w.isToken0
            ? LiquidityAmounts.getLiquidityForAmount0(
                TickMath.getSqrtPriceAtTick(w.lower), TickMath.getSqrtPriceAtTick(w.upper), amount
            )
            : LiquidityAmounts.getLiquidityForAmount1(
                TickMath.getSqrtPriceAtTick(w.lower), TickMath.getSqrtPriceAtTick(w.upper), amount
            );
        if (w.liquidity == 0) return 0;

        try poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: w.lower,
                tickUpper: w.upper,
                liquidityDelta: int256(uint256(w.liquidity)),
                salt: bytes32(0)
            }),
            ""
        ) returns (BalanceDelta callerDelta, BalanceDelta) {
            spent = _settleWedge(key, id, currency, w, callerDelta);
            emit LiquidityAdded(id, currency, spent, w.liquidity);
        } catch {
            spent = 0;
        }
    }

    function _settleWedge(
        PoolKey calldata key,
        PoolId id,
        Currency feeCurrency,
        Wedge memory w,
        BalanceDelta delta
    ) private returns (uint256 spent) {
        int128 a0 = delta.amount0();
        int128 a1 = delta.amount1();

        if ((w.isToken0 ? a1 : a0) < 0) {
            (BalanceDelta undone,) = poolManager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: w.lower,
                    tickUpper: w.upper,
                    liquidityDelta: -int256(uint256(w.liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            _collect(id, key.currency0, a0 + undone.amount0());
            _collect(id, key.currency1, a1 + undone.amount1());
            emit WedgeUndone(id, w.lower, w.upper, w.liquidity);
            return 0;
        }

        _collect(id, w.isToken0 ? key.currency1 : key.currency0, w.isToken0 ? a1 : a0);

        int128 cost = w.isToken0 ? a0 : a1;
        if (cost >= 0) {

            _collect(id, feeCurrency, cost);
            emit WedgePaidForItself(id, feeCurrency, uint256(uint128(cost)));
            return 0;
        }
        spent = uint256(uint128(-cost));
    }

    function _collect(PoolId id, Currency currency, int128 amount) private {
        if (amount <= 0) return;
        uint256 credit = uint256(uint128(amount));
        _payOut(currency, platformTreasury, credit);
        emit LiquidityFeesCollected(id, currency, credit);
    }

    function locker(bytes32 id) external view returns (address) {
        return configOf[PoolId.wrap(id)].set ? launcher : address(0);
    }

    function transferPayeeSlot(PoolKey calldata key, address to) external {
        if (to == address(0)) revert PayeeRequired();

        PoolId id = key.toId();
        if (!configOf[id].set) revert PoolNotConfigured();

        Payee[] storage existing = payeesOf[id];
        uint256 slot = type(uint256).max;
        for (uint256 i = 0; i < existing.length; i++) {
            if (existing[i].to == to) revert PayeeAlreadyHoldsSlot(to);
            if (existing[i].to == msg.sender) slot = i;
        }
        if (slot == type(uint256).max) revert NotRecipientOrAdmin();

        existing[slot].to = to;
        emit PayeeSlotTransferred(id, msg.sender, to);
    }

    function _writePayees(PoolId id, Payee[] memory payees, uint256 reserved) private {
        if (payees.length > MAX_PAYEES) revert TooManyPayees(payees.length, MAX_PAYEES);

        uint256 sum = reserved;
        for (uint256 i = 0; i < payees.length; i++) {
            if (payees[i].to == address(0)) revert PayeeRequired();
            sum += payees[i].shareBps;
        }
        if (sum != BPS) revert SharesMustSumToBps(sum);

        delete payeesOf[id];
        for (uint256 i = 0; i < payees.length; i++) {
            payeesOf[id].push(payees[i]);
        }
    }

    function payees(PoolKey calldata key) external view returns (Payee[] memory) {
        return payeesOf[key.toId()];
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {

        if (sender == launcher) return (IHooks.afterSwap.selector, 0);

        Config memory c = configOf[key.toId()];
        if (!c.set || c.taxBps == 0) return (IHooks.afterSwap.selector, 0);

        (Currency feeCurrency, uint256 magnitude) = _unspecified(key, params, delta);
        if (magnitude == 0) return (IHooks.afterSwap.selector, 0);

        uint256 fee = (magnitude * c.taxBps) / BPS;
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        uint256 platformFee = (magnitude * LaunchFees.platformCut(c.taxBps)) / BPS;
        if (platformFee > fee) platformFee = fee;

        if (platformFee > 0) _payOut(feeCurrency, platformTreasury, platformFee);
        if (fee > platformFee) {
            _payCreatorShare(key, key.toId(), c, feeCurrency, fee - platformFee);
        }

        emit FeeTaken(key.toId(), feeCurrency, platformFee, fee - platformFee);
        return (IHooks.afterSwap.selector, fee.toInt128());
    }

    function _unspecified(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta
    ) private pure returns (Currency currency, uint256 magnitude) {
        int128 amount;
        if (params.amountSpecified < 0) {
            currency = params.zeroForOne ? key.currency1 : key.currency0;
            amount = params.zeroForOne ? delta.amount1() : delta.amount0();
        } else {
            currency = params.zeroForOne ? key.currency0 : key.currency1;
            amount = params.zeroForOne ? delta.amount0() : delta.amount1();
        }
        magnitude = amount < 0 ? uint256(uint128(-amount)) : uint256(uint128(amount));
    }

    function _payCreatorShare(
        PoolKey calldata key,
        PoolId id,
        Config memory c,
        Currency feeCurrency,
        uint256 creatorFee
    ) private {

        bool feeIsToken = Currency.unwrap(feeCurrency) == Currency.unwrap(key.currency0);

        uint256 burnt;
        if (c.burnBps > 0 && feeIsToken) {
            burnt = (creatorFee * c.burnBps) / BPS;
            if (burnt > 0) _payOut(feeCurrency, BURN, burnt);
        }

        uint256 toLiquidity;
        if (c.liquidityBps > 0) {
            uint256 want = (creatorFee * c.liquidityBps) / BPS;
            if (want > 0) toLiquidity = _addSingleSided(key, id, feeCurrency, want);
        }

        uint256 sharedToPlatform;
        if (!feeIsToken && c.burnBps > 0) {
            uint256 unburnable = (creatorFee * c.burnBps) / BPS;

            uint256 boughtBack = _buybackAndBurn(key, id, unburnable);
            if (boughtBack > 0) {
                burnt += boughtBack;
                unburnable -= boughtBack;
            }

            sharedToPlatform = (unburnable * LaunchFees.platformCut(c.taxBps)) / c.taxBps;
            if (sharedToPlatform > 0) {
                _payOut(feeCurrency, platformTreasury, sharedToPlatform);
                emit RemainderSwept(id, feeCurrency, sharedToPlatform);
            }
        }

        uint256 distributable = creatorFee - burnt - toLiquidity - sharedToPlatform;
        Payee[] storage list = payeesOf[id];

        uint256 totalShares = BPS - c.burnBps - c.liquidityBps;
        uint256 paid;
        for (uint256 i = 0; i < list.length; i++) {
            uint256 amount = i + 1 == list.length
                ? distributable - paid
                : totalShares == 0 ? 0 : (distributable * list[i].shareBps) / totalShares;
            if (amount > 0) {
                _payOut(feeCurrency, list[i].to, amount);
                paid += amount;
            }
        }

        uint256 unplaced = distributable - paid;
        if (unplaced > 0) {
            _payOut(feeCurrency, platformTreasury, unplaced);
            emit RemainderSwept(id, feeCurrency, unplaced);
        }

        emit CreatorShareSplit(id, burnt, toLiquidity, paid);
    }

    function beforeInitialize(address sender, PoolKey calldata, uint160)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        if (sender != launcher) revert NotLauncher();
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
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
