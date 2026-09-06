// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeTransferLib} from '@solady/utils/SafeTransferLib.sol';

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {StateLibrary} from '@uniswap/v4-core/src/libraries/StateLibrary.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {BalanceDelta} from '@uniswap/v4-core/src/types/BalanceDelta.sol';
import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {ModifyLiquidityParams, SwapParams} from '@uniswap/v4-core/src/types/PoolOperation.sol';
import {LiquidityAmounts} from '@uniswap/v4-core/test/utils/LiquidityAmounts.sol';

import {CurrencySettler} from '@flaunch/libraries/CurrencySettler.sol';
import {PairedTokenLib} from '@flaunch/libraries/PairedTokenLib.sol';
import {TokenSupply} from '@flaunch/libraries/TokenSupply.sol';
import {UniswapHookEvents} from '@flaunch/libraries/UniswapHookEvents.sol';
import {
    TS_ISP_AMOUNT0,
    TS_ISP_AMOUNT1,
    TS_ISP_FEE0,
    TS_ISP_FEE1,
    TS_UNI_AMOUNT0,
    TS_UNI_AMOUNT1,
    TS_UNI_FEE0,
    TS_UNI_FEE1
} from '@flaunch/types/StoreKeys.sol';
import {TickFinder} from '@flaunch/types/TickFinder.sol';

import {INotifier} from '@flaunch-interfaces/INotifier.sol';
import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';
import {IPositionManager} from '@flaunch-interfaces/IPositionManager.sol';
import {IWrappedToken} from '@flaunch-interfaces/IWrappedToken.sol';

/**
 * Shared launch-time math and liquidity helpers used by the {PositionManager} when seeding a
 * freshly flaunched pool and filling a premine.
 *
 * @dev These functions are `public` so the library is deployed separately and linked into the
 * {PositionManager} via `delegatecall`, keeping their (sizeable) runtime bytecode out of the hook
 * contract, which sits close to the EIP-170 limit. Because calls are delegated, `address(this)`
 * inside {createImmutablePosition} resolves to the calling {PositionManager}, so settlement is paid
 * from its balances exactly as if the logic were inlined.
 */
library FlaunchLibrary {
    using CurrencySettler for Currency;
    using StateLibrary for IPoolManager;
    using TickFinder for int24;

    /**
     * The inputs required to seed a freshly flaunched pool and fill its premine. Grouped into a
     * struct because the arguments cross an ABI boundary on every delegated call: encoding one
     * struct once keeps the calling hook's bytecode (and stack frame) small, which is the whole
     * point of hosting this logic in a linked library.
     *
     * @member poolManager The Uniswap V4 {PoolManager}, already unlocked by the caller
     * @member poolKey The PoolKey of the pool being seeded
     * @member initialTick The tick the pool was initialized at
     * @member nativeIsZero Whether the pool's paired token is `currency0`
     * @member tokenType The paired token's shape, read from the pool's launch-time snapshot; this
     * selects how the premine is funded (raw ETH / wrapped ETH / pulled ERC20)
     * @member paired The pool's paired token
     * @member memecoin The memecoin being seeded / premined
     * @member creator The recipient of the premined memecoin
     * @member payer The address an ERC20-paired premine is pulled from
     * @member premineAmount The amount of memecoin to premine (`0` for no premine)
     * @member remainingValue The ETH still available to fund an ETH-funded premine
     * @member maxPremineCost The most paired token a pull-funded premine may cost the payer
     * (`0` = uncapped, bounded only by the payer's allowance). The ETH-funded shapes derive their
     * own cap from `remainingValue` and ignore this field.
     */
    struct SeedParams {
        IPoolManager poolManager;
        PoolKey poolKey;
        int24 initialTick;
        bool nativeIsZero;
        IPairedTokenRegistry.PairedTokenType tokenType;
        address paired;
        address memecoin;
        address creator;
        address payer;
        uint premineAmount;
        uint remainingValue;
        uint maxPremineCost;
    }

    /**
     * Emits the per-swap fee breakdown that was accumulated in transient storage over the course
     * of a swap, then clears those transient slots.
     *
     * @dev Hosted here purely for size: the eighteen `tload`s and the thirteen-field {PoolSwap}
     * emit compile to roughly a kilobyte, and the calling hook sits against the EIP-170 limit.
     * `delegatecall` keeps the executing address as the hook, so the transient slots touched here
     * are the hook's own and both logs are emitted under the hook's address — identical to
     * emitting them inline.
     *
     * The slots are flushed because, although they are only ever set explicitly and never
     * modified, both the FL and ISP paths can be bypassed and would otherwise leave stale data
     * behind for the next swap in the same transaction.
     *
     * @param _poolId The PoolId that is being emitted
     * @param _sender The router of the swap
     */
    function emitSwapUpdate(
        PoolId _poolId,
        address _sender
    ) public {
        // Emit our protocol-recognised event
        emit IPositionManager.PoolSwap(
            _poolId,
            0,
            0,
            0,
            0,
            _tload(TS_ISP_AMOUNT0),
            _tload(TS_ISP_AMOUNT1),
            _tload(TS_ISP_FEE0),
            _tload(TS_ISP_FEE1),
            _tload(TS_UNI_AMOUNT0),
            _tload(TS_UNI_AMOUNT1),
            _tload(TS_UNI_FEE0),
            _tload(TS_UNI_FEE1)
        );

        // Emit the Uniswap V4 standardised event
        UniswapHookEvents.emitHookSwapEvent({
            _poolId: _poolId,
            _sender: _sender,
            _amount0: _tload(TS_ISP_AMOUNT0),
            _amount1: _tload(TS_ISP_AMOUNT1),
            _fee0: _tload(TS_ISP_FEE0),
            _fee1: _tload(TS_ISP_FEE1)
        });

        assembly {
            tstore(TS_ISP_AMOUNT0, 0)
            tstore(TS_ISP_AMOUNT1, 0)
            tstore(TS_ISP_FEE0, 0)
            tstore(TS_ISP_FEE1, 0)
            tstore(TS_UNI_AMOUNT0, 0)
            tstore(TS_UNI_AMOUNT1, 0)
            tstore(TS_UNI_FEE0, 0)
            tstore(TS_UNI_FEE1, 0)
        }
    }

    /**
     * Reads a single `tstore` slot. Kept as a helper so each `tload` can be used directly as a
     * call argument without first declaring a local.
     *
     * @param _key The `tstore` key to load
     *
     * @return value_ The `int` value in the tstore
     */
    function _tload(
        bytes32 _key
    ) internal view returns (int value_) {
        assembly {
            value_ := tload(_key)
        }
    }

    /**
     * Notifies a pool's subscribers and emits its current on-chain state.
     *
     * @dev Hosted here purely for size: the calling hook sits against the EIP-170 limit. Delegated
     * execution means the {PoolStateUpdated} log is emitted under the hook's address and the
     * subscriber notification is made by the hook, exactly as if this were inlined.
     *
     * @param _poolManager The Uniswap V4 {PoolManager} to read the pool's state from
     * @param _notifier The {Notifier} that forwards the update to the pool's subscribers
     * @param _poolId The PoolId that has been updated
     * @param _key The selector being sent to notification subscribers
     * @param _data The data being sent to notification subscribers
     */
    function emitPoolStateUpdate(
        IPoolManager _poolManager,
        address _notifier,
        PoolId _poolId,
        bytes4 _key,
        bytes memory _data
    ) public {
        // Notify our subscribed contracts
        INotifier(_notifier).notifySubscribers(_poolId, _key, _data);

        // Emit our event from its own frame, so the notifier arguments have fallen off the stack
        // before the six-field emit builds its own (avoids stack-too-deep)
        _emitPoolState(_poolManager, _poolId);
    }

    /**
     * Reads a pool's current state from the {PoolManager} and emits it.
     *
     * @param _poolManager The Uniswap V4 {PoolManager} to read the pool's state from
     * @param _poolId The PoolId whose state is being emitted
     */
    function _emitPoolState(
        IPoolManager _poolManager,
        PoolId _poolId
    ) internal {
        (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 swapFee) = _poolManager.getSlot0(_poolId);
        emit IPositionManager.PoolStateUpdated(_poolId, sqrtPriceX96, tick, protocolFee, swapFee, _poolManager.getLiquidity(_poolId));
    }

    /**
     * Ensures the {BidWall} has an allowance to pull a pool's paired token from the calling hook.
     *
     * @dev Re-approves when the current allowance drops below a large sentinel rather than only
     * when it hits exactly 0 (VPT-19). flETH keeps a full max allowance and is never re-approved
     * here.
     *
     * [L-2] The sentinel is NOT equivalent to the fee path's `< amount` self-healing, and the
     * previous comment claiming it was overstated the guarantee. This function is only reached at
     * LAUNCH, so for a pool whose paired token decrements allowances there is no later call to
     * re-evaluate it: the allowance drains toward zero over the pool's life and the sentinel never
     * gets a chance to fire. {FeeDistributor._allocateFees} re-checks on every distribution and so
     * genuinely self-heals; this path does not.
     *
     * Callers that grant an allowance the BidWall will spend repeatedly must therefore re-assert
     * it themselves — see the deposit path in {PositionManager._distributeFees}. Left unaddressed
     * this escalates to the same outcome as audit finding H-2: the reposition reverts inside
     * `afterSwap` and the pool stops trading permanently.
     *
     * Delegated execution means the allowance read and the grant are both made by (and for) the
     * calling hook, exactly as if this were inlined.
     *
     * @param _bidWall The {BidWall} being granted the allowance
     * @param _token The paired token to approve
     */
    function ensureBidWallApproval(
        address _bidWall,
        address _token
    ) public {
        // Native ETH has no allowance model; the BidWall custodies it via `deposit{value:}` instead.
        if (_token == address(0)) {
            return;
        }

        // Granted through {PairedTokenLib.ensureAllowance} (solady's `safeApproveWithRetry`) rather
        // than a high-level `IERC20.approve`. The registry whitelists plain ERC20s, and a USDT-style
        // token that returns no data makes the high-level call's bool decode revert — which here
        // would revert every LAUNCH against that token, while a token that returns `false` without
        // reverting would leave the BidWall unapproved and brick the pool's first reposition inside
        // `afterSwap`. Unlike the fee path in {FeeDistributor._allocateFees}, this call already lives
        // in the linked library, so the retry variant's extra bytecode costs the hook nothing.
        if (IERC20(_token).allowance(address(this), _bidWall) < type(uint).max / 2) {
            PairedTokenLib.ensureAllowance(_token, _bidWall, type(uint).max);
        }
    }

    /**
     * Resolves the tick ranges for the two single-sided launch positions, placing the ETH position
     * in a tight band adjacent to the launch tick and the memecoin position spanning outward.
     *
     * @dev Both legs are funded on ONE side only, so each range must sit strictly on its own side
     * of the launch tick or Uniswap asks for a currency the launch does not supply. Near the tick
     * domain's edge that becomes impossible: {TickFinder}'s clamp saturates, so the band stops
     * tracking the launch tick and collapses onto the wrong side of it — and the memecoin leg,
     * which spans from the clamp bound to the launch tick, degenerates to zero width and makes
     * `modifyLiquidity` revert outright.
     *
     * No arithmetic rescues this, because no valid pair of single-sided ranges EXISTS at those
     * prices. The launch is rejected instead, which is the only honest outcome: a pool created
     * there could never place its positions.
     *
     * The BidWall meets the same wall at runtime and cannot reject — a revert inside `afterSwap`
     * would brick the pool permanently — so it defers instead. See {TickFinder.singleSidedPosition}.
     *
     * @param _initialTick The tick the pool was initialized at
     * @param _nativeIsZero Whether the native token is `currency0`
     */
    function launchTickRanges(
        int24 _initialTick,
        bool _nativeIsZero
    ) public pure returns (int24 ethTickLower_, int24 ethTickUpper_, int24 memeTickLower_, int24 memeTickUpper_) {
        if (_nativeIsZero) {
            ethTickLower_ = (_initialTick + 1).validTick(false);
            ethTickUpper_ = ethTickLower_ + TickFinder.TICK_SPACING;

            memeTickLower_ = TickFinder.MIN_TICK;
            memeTickUpper_ = (_initialTick - 1).validTick(true);

            // Both legs are single-sided, so each must sit strictly on its own side of the launch
            // tick, and the memecoin leg must span at least one spacing. See the note below.
            if (ethTickLower_ <= _initialTick || memeTickUpper_ > _initialTick || memeTickLower_ >= memeTickUpper_) {
                revert IPositionManager.UnsupportedLaunchTick(_initialTick);
            }
        } else {
            ethTickUpper_ = (_initialTick - 1).validTick(true);
            ethTickLower_ = ethTickUpper_ - TickFinder.TICK_SPACING;

            memeTickLower_ = (_initialTick + 1).validTick(false);
            memeTickUpper_ = TickFinder.MAX_TICK;

            if (ethTickUpper_ > _initialTick || memeTickLower_ <= _initialTick || memeTickLower_ >= memeTickUpper_) {
                revert IPositionManager.UnsupportedLaunchTick(_initialTick);
            }
        }
    }

    /**
     * Creates an immutable, single-sided position, settling the required tokens from the calling
     * contract's balance. Adapted from the (removed) FairLaunch position logic.
     *
     * @param _poolManager The Uniswap V4 {PoolManager}
     * @param _poolKey The PoolKey to create a position against
     * @param _tickLower The lower tick of the position
     * @param _tickUpper The upper tick of the position
     * @param _tokens The number of tokens to put into the position
     * @param _tokenIsZero True if the position is created with `currency0`; false for `currency1`
     */
    function createImmutablePosition(
        IPoolManager _poolManager,
        PoolKey memory _poolKey,
        int24 _tickLower,
        int24 _tickUpper,
        uint _tokens,
        bool _tokenIsZero
    ) public {
        uint128 liquidityDelta = _tokenIsZero
            ? LiquidityAmounts.getLiquidityForAmount0({
                sqrtPriceAX96: TickMath.getSqrtPriceAtTick(_tickLower),
                sqrtPriceBX96: TickMath.getSqrtPriceAtTick(_tickUpper),
                amount0: _tokens
            })
            : LiquidityAmounts.getLiquidityForAmount1({
                sqrtPriceAX96: TickMath.getSqrtPriceAtTick(_tickLower),
                sqrtPriceBX96: TickMath.getSqrtPriceAtTick(_tickUpper),
                amount1: _tokens
            });

        // If we have no liquidity, then exit before creating the position which would revert
        if (liquidityDelta == 0) {
            return;
        }

        (BalanceDelta delta,) = _poolManager.modifyLiquidity({
            key: _poolKey,
            params: ModifyLiquidityParams({tickLower: _tickLower, tickUpper: _tickUpper, liquidityDelta: int128(liquidityDelta), salt: ''}),
            hookData: ''
        });

        // Settle the tokens that are required to fill the position
        if (delta.amount0() < 0) {
            _poolKey.currency0.settle(_poolManager, address(this), uint(-int(delta.amount0())), false);
        }

        if (delta.amount1() < 0) {
            _poolKey.currency1.settle(_poolManager, address(this), uint(-int(delta.amount1())), false);
        }
    }

    /**
     * Seeds a freshly flaunched pool with its initial single-sided memecoin sell position and, if
     * one was requested, fills the premine against it. Must be called from inside a {PoolManager}
     * unlock, which the calling hook holds.
     *
     * @dev The seed and the premine share one entrypoint (rather than the hook making a delegated
     * call per step) because each crossing re-encodes the {PoolKey}; folding them saves that
     * duplicated encoder in the hook, which sits against the EIP-170 limit. Delegated execution
     * means `address(this)` — and therefore every balance, settlement and allowance below —
     * resolves to the hook exactly as if this were inlined.
     *
     * @param _params The launch inputs (see {SeedParams})
     *
     * @return ethSpent_ The amount of ETH consumed by the premine (zero when no premine was
     * requested, and always zero for an ERC20-paired pool, whose premine is funded in the paired
     * token rather than ETH)
     */
    function seedLiquidityAndPremine(
        SeedParams memory _params
    ) public returns (uint ethSpent_) {
        // Seed the single-sided memecoin sell position with the remaining supply. The tick locals
        // are scoped so they fall off the stack before the premine branch runs.
        {
            (,, int24 memeTickLower, int24 memeTickUpper) = launchTickRanges(_params.initialTick, _params.nativeIsZero);

            createImmutablePosition({
                _poolManager: _params.poolManager,
                _poolKey: _params.poolKey,
                _tickLower: memeTickLower,
                _tickUpper: memeTickUpper,
                _tokens: TokenSupply.INITIAL_SUPPLY,
                _tokenIsZero: !_params.nativeIsZero
            });
        }

        // Nothing further to do when no premine was requested
        if (_params.premineAmount == 0) {
            return 0;
        }

        // Raw native ETH: settle the caller's `msg.value` directly, with no wrap.
        if (_params.tokenType == IPairedTokenRegistry.PairedTokenType.NativeEth) {
            return _premineRawNative(_params);
        }

        // Any other ETH-funded shape is a native wrapper (flETH): wrap the caller's ETH into the
        // paired token, then swap. {PairedTokenLib.isEthFunded} is the shared dispatch truth, so
        // this library and {FlaunchZap} can never disagree on a launch's funding mode.
        if (PairedTokenLib.isEthFunded(_params.tokenType)) {
            return _premineNative(_params);
        }

        // ERC20-funded (flUSDC wrapper or plain ERC20): pull the paired token from the caller.
        _premineErc20(_params);

        // An ERC20-paired premine consumes no ETH; the caller's msg.value is left to be refunded.
        return 0;
    }

    /**
     * Fills a premine for a native-ETH-wrapper pool: wraps the caller's remaining ETH into the
     * paired wrapper, swaps it for the premined memecoin, settles the debt, and unwraps any unused
     * wrapper back to ETH so the calling hook can refund the excess.
     *
     * @param _params The launch inputs (see {SeedParams})
     *
     * @return spent_ The amount of ETH consumed by the premine
     */
    function _premineNative(
        SeedParams memory _params
    ) internal returns (uint spent_) {
        // Wrap all the remaining ETH into the paired wrapper up front so it is available as the
        // swap input. A registered wrapper wraps 1:1, so the credit is exactly what we sent.
        PairedTokenLib.wrap(_params.paired, _params.remainingValue);
        uint wrapped = _params.remainingValue;

        Currency pairedCurrency;
        Currency memecoinCurrency;
        uint pairedSpent;
        (pairedCurrency, memecoinCurrency, pairedSpent) = _premineSwap(_params);

        // If the premine costs more wrapper than we managed to wrap, we cannot cover it
        if (pairedSpent > wrapped) {
            revert IPositionManager.InsufficientPreminePayment(pairedSpent, wrapped);
        }

        // Settle the wrapper owed for the premine and take the premined memecoin directly to
        // the creator
        pairedCurrency.settle(_params.poolManager, address(this), pairedSpent, false);
        _params.poolManager.take(memecoinCurrency, _params.creator, _params.premineAmount);

        // Unwrap any wrapper we did not spend back to ETH so the hook can refund the caller
        uint unusedWrapper = wrapped - pairedSpent;
        if (unusedWrapper != 0) {
            IWrappedToken(_params.paired).withdraw(unusedWrapper);
        }

        // The wrap and the unwrap are both 1:1, so the ETH consumed is exactly the wrapper the
        // swap kept. This used to be measured from the ETH balance delta purely to stay correct
        // for a non-1:1 wrapper (VPT-21) — not a shape the protocol admits.
        spent_ = pairedSpent;
    }

    /**
     * Fills a premine for a raw native-ETH pool: swaps the caller's `msg.value` ETH for the
     * premined memecoin and settles the native debt directly — no wrap/unwrap, since the paired
     * side already is native ETH. Any unspent ETH is left for the hook to refund.
     *
     * @param _params The launch inputs (see {SeedParams})
     *
     * @return spent_ The amount of ETH consumed by the premine
     */
    function _premineRawNative(
        SeedParams memory _params
    ) internal returns (uint spent_) {
        // Measure the ETH actually consumed from the balance delta so the hook's refund stays solvent.
        uint ethBefore = address(this).balance;

        (Currency pairedCurrency, Currency memecoinCurrency, uint pairedSpent) = _premineSwap(_params);

        // Cannot cover the premine if it costs more ETH than the caller supplied
        if (pairedSpent > _params.remainingValue) {
            revert IPositionManager.InsufficientPreminePayment(pairedSpent, _params.remainingValue);
        }

        // Settle the native ETH owed (native `settle{value:}` draws from this contract's balance),
        // then take the premined memecoin directly to the creator.
        pairedCurrency.settle(_params.poolManager, address(this), pairedSpent, false);
        _params.poolManager.take(memecoinCurrency, _params.creator, _params.premineAmount);

        spent_ = ethBefore - address(this).balance;
    }

    /**
     * Fills a premine for an ERC20-paired pool: swaps the paired token for the premined memecoin
     * and funds the swap by pulling exactly the required amount of the paired token from the
     * caller. The fill is zero-impact against the just-seeded position, so the cost is
     * deterministic and pulled precisely (no refund needed). The caller must have approved the
     * calling hook to spend at least the resulting amount of the paired token.
     *
     * @dev The cost is derived from the pool's launch price, which resolves through the paired
     * token's registered price calculator at execution time — so it is not knowable when the
     * transaction is signed. Without `maxPremineCost` the only bound on what gets pulled is the
     * payer's allowance, which leaves a payer holding a broad (e.g. unlimited) approval exposed to
     * an oracle move or a calculator rotation between quote and inclusion. The ETH-funded shapes
     * already have this protection implicitly, since `msg.value` bounds them and overrunning it
     * reverts {InsufficientPreminePayment}; this gives the pull-funded shapes the same guarantee
     * explicitly. `0` preserves the previous (allowance-bounded) behaviour for existing callers.
     *
     * @param _params The launch inputs (see {SeedParams})
     */
    function _premineErc20(
        SeedParams memory _params
    ) internal {
        (Currency pairedCurrency, Currency memecoinCurrency, uint spent) = _premineSwap(_params);

        // Enforce the payer's cost cap before moving any of their token
        if (_params.maxPremineCost != 0 && spent > _params.maxPremineCost) {
            revert IPositionManager.PremineCostExceedsMaximum(spent, _params.maxPremineCost);
        }

        // Pull the paired tokens owed for the premine from the caller, then settle. Every
        // approved paired token is 1:1 by policy — the pull moves the full amount or reverts
        // inside `safeTransferFrom` — so the settle below is funded by this pull alone and never
        // by the hook's commingled fee inventory.
        PairedTokenLib.pullFrom(pairedCurrency, _params.payer, spent, 0);
        pairedCurrency.settle(_params.poolManager, address(this), spent, false);
        _params.poolManager.take(memecoinCurrency, _params.creator, _params.premineAmount);
    }

    /**
     * Performs the premine swap (paired token -> memecoin) against the just-seeded liquidity and
     * returns the paired/memecoin currencies plus the paired amount owed. We cannot be front-run
     * here because the liquidity is added in the same transaction.
     *
     * @param _params The launch inputs (see {SeedParams})
     *
     * @return pairedCurrency_ The paired-token currency owed to the pool
     * @return memecoinCurrency_ The memecoin currency taken from the pool
     * @return spent_ The amount of paired token owed for the premine
     */
    function _premineSwap(
        SeedParams memory _params
    ) internal returns (Currency pairedCurrency_, Currency memecoinCurrency_, uint spent_) {
        bool nativeIsZero = _params.nativeIsZero;

        // The premine pays the paired token and receives memecoin: when the paired token is
        // currency0 we swap 0 -> 1 (zeroForOne=true) with the low-side price limit; otherwise we
        // swap 1 -> 0 with the high-side price limit.
        BalanceDelta delta = _params.poolManager.swap(
            _params.poolKey,
            SwapParams({
                zeroForOne: nativeIsZero,
                amountSpecified: int(_params.premineAmount),
                sqrtPriceLimitX96: nativeIsZero ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ''
        );

        // The paired-side delta is negative and represents the paired token the pool is owed.
        int128 pairedDelta;
        (pairedCurrency_, memecoinCurrency_, pairedDelta) = nativeIsZero
            ? (_params.poolKey.currency0, _params.poolKey.currency1, delta.amount0())
            : (_params.poolKey.currency1, _params.poolKey.currency0, delta.amount1());
        spent_ = uint(-int(pairedDelta));
    }
}
