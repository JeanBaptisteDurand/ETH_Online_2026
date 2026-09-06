// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.26;

// - - - OZ Imports - - -

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

// - - - Uniswap Imports - - -

import { Hooks } from "@uniswap/v4-core/src/libraries/Hooks.sol";
import { LPFeeLibrary } from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";
import { Currency, CurrencyLibrary } from "@uniswap/v4-core/src/types/Currency.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { toBalanceDelta, BalanceDelta, BalanceDeltaLibrary } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
  BeforeSwapDelta,
  BeforeSwapDeltaLibrary,
  toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { LiquidityAmounts } from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import { BaseHook } from "@uniswap/v4-periphery/src/utils/BaseHook.sol";

// - - - local imports - - -

import { Errors } from "./libraries/dfm/Errors.sol";
import { PPM_SCALE } from "./libraries/dfm/PrecisionConstants.sol";
import { LUnitMath } from "./libraries/ae/math/LUnitMath.sol";
import { HookRuntime } from "./libraries/hook/HookRuntime.sol";
import { CurrentSwapHookFeeCache } from "./libraries/hook/CurrentSwapHookFeeCache.sol";
import { ENGINE_MAX_SWAP_FEE_PIPS } from "./libraries/ae/Constants.sol";
import { IAegisHook } from "./interfaces/IAegisHook.sol";
import { IAegisDependencies } from "./interfaces/IAegisDependencies.sol";
import { IDynamicFeeManager } from "./interfaces/dfm/IDynamicFeeManager.sol";
import { IOracleManager } from "./interfaces/IOracleManager.sol";
import { IAegisEngine } from "./interfaces/IAegisEngine.sol";
import { ILimitOrderManager } from "./interfaces/ILimitOrderManager.sol";

/// @title AegisHook
/// @notice Uniswap V4 hook implementing dynamic fees, oracle integration, and automatic fee reinvestment
/// @dev DEFENSIVE DESIGN: All non-initialize OracleManager and DynamicFeeManager calls are wrapped in try-catch
///      to prevent bricking liquidity. The reinvest path's `AEGIS_ENGINE.modifyLiquidity` call is also wrapped
///      because AE market initialization is decoupled from `_afterInitialize` — there is now a window where
///      hook fees can accumulate before the AE market exists; an unwrapped call would revert and brick swaps.
///      PoolManager and LimitOrderManager calls are NOT wrapped as they are expected to be robust and we
///      want to enforce guarantees on those.
contract AegisHook is Ownable, Pausable, BaseHook, IAegisHook {
  using StateLibrary for IPoolManager;
  using PoolIdLibrary for PoolKey;
  using PoolIdLibrary for PoolId;
  using CurrencyLibrary for Currency;
  using BalanceDeltaLibrary for BalanceDelta;

  uint128 public constant MIN_REINVEST_LIQUIDITY = 1_000;
  uint32 public constant REINVEST_COOLDOWN = 3600; // 1hr
  // NB: 3600 allows for up to a 1hr TWAP in the worst case of 1 second blocks with observations every block
  uint16 public constant TARGET_CARDINALITY = 3600;
  uint16 public constant CARDINALITY_INCREMENT = 5;

  struct PoolConfig {
    uint24 hookFeePpm;
    uint32 lastReinvest;
    // Set to true once `cardinalityNext` has reached `TARGET_CARDINALITY`. Caches the result so
    // the steady-state swap path can skip the external `ORACLE_MANAGER.states` call. Closes the
    // gas regression introduced when the `block.number % 10` gating was dropped in favor of
    // eager per-swap cardinality growth.
    bool oracleGrowthComplete;
  }

  IOracleManager public immutable override ORACLE_MANAGER;
  IDynamicFeeManager public immutable override DYNAMIC_FEE_MANAGER;
  IAegisEngine public immutable override AEGIS_ENGINE;
  ILimitOrderManager public immutable override LIMIT_ORDER_MANAGER;

  mapping(PoolId => BalanceDelta) private _pendingFees;
  mapping(PoolId => PoolConfig) private _poolConfigs;

  constructor(
    IAegisDependencies deps,
    IAegisEngine aegisEngine,
    IOracleManager oracleManager,
    IDynamicFeeManager dynamicFeeManager,
    ILimitOrderManager limitOrderManager
  ) BaseHook(deps.poolManager()) Ownable(deps.AEGIS_INITIALIZER()) {
    require(deps.initialized(), "AegisDependencies not initialized");
    _checkNonZeroAddress(address(aegisEngine));
    _checkNonZeroAddress(address(oracleManager));
    _checkNonZeroAddress(address(dynamicFeeManager));
    _checkNonZeroAddress(address(limitOrderManager));

    AEGIS_ENGINE = aegisEngine;
    ORACLE_MANAGER = oracleManager;
    DYNAMIC_FEE_MANAGER = dynamicFeeManager;
    LIMIT_ORDER_MANAGER = limitOrderManager;
  }

  /// @notice Accept native ETH sent by PoolManager during hook reinvestment settlement.
  receive() external payable {
    if (msg.sender != address(poolManager)) {
      revert Errors.UnauthorizedCaller(msg.sender);
    }
  }

  // - - - Views - - -

  /// @inheritdoc BaseHook
  function getHookPermissions() public pure virtual override returns (Hooks.Permissions memory) {
    return Hooks.Permissions({
      beforeInitialize: false,
      afterInitialize: true,
      beforeAddLiquidity: false,
      afterAddLiquidity: false,
      beforeRemoveLiquidity: false,
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

  /// @inheritdoc IAegisHook
  function pendingFees(PoolId id) public view override returns (uint128 amount0, uint128 amount1) {
    BalanceDelta pending = _pendingFees[id];
    (amount0, amount1) = (uint128(pending.amount0()), uint128(pending.amount1()));
  }

  /// @inheritdoc IAegisHook
  function hookFeePpm(PoolId poolId) public view override returns (uint24) {
    return _poolConfigs[poolId].hookFeePpm;
  }

  // - - - Admin Setters - - -

  /// @inheritdoc IAegisHook
  function pause(bool doPause) external override onlyOwner {
    if (doPause) {
      _pause();
    } else {
      _unpause();
    }
  }

  /// @inheritdoc IAegisHook
  function setHookFeePpm(PoolId poolId, uint24 feePpm) external override onlyOwner {
    if (feePpm > PPM_SCALE) revert Errors.ParameterOutOfRange(feePpm, 0, PPM_SCALE);
    _poolConfigs[poolId].hookFeePpm = feePpm;
    emit HookFeePpmUpdated(poolId, feePpm);
  }

  /// @inheritdoc IAegisHook
  function withdrawMarketShares(PoolId poolId, address to, uint256 amount) external override onlyOwner {
    _checkNonZeroAddress(to);
    if (amount > 0) {
      uint256 tokenId = uint256(PoolId.unwrap(poolId));
      AEGIS_ENGINE.transfer(to, tokenId, amount);

      emit SharesWithdrawn(poolId, to, amount);
    }
  }

  // - - - Hook Callbacks - - -

  /// @inheritdoc BaseHook
  function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
    internal
    virtual
    override
    returns (bytes4, BeforeSwapDelta hookSwapDelta, uint24)
  {
    PoolId poolId = key.toId();

    // Eagerly grow oracle cardinality on every swap until TARGET_CARDINALITY is reached.
    // A previous design only attempted growth on `block.number % 10 == 0`, which let an attacker
    // swap on non-tenth blocks to overwrite the only stored observation (cardinality stayed at
    // 1). Eager growth ensures the very first attacker swap also bumps `cardinalityNext`, so the
    // subsequent `_afterSwap` write preserves the genesis observation. Steady-state cost is
    // preserved by caching `oracleGrowthComplete` once the target is reached.
    if (!_poolConfigs[poolId].oracleGrowthComplete) {
      try ORACLE_MANAGER.states(poolId) returns (uint16, uint16, uint16 cardinalityNext) {
        if (cardinalityNext < TARGET_CARDINALITY) {
          try ORACLE_MANAGER.increaseCardinalityNext(poolId, cardinalityNext + CARDINALITY_INCREMENT) { }
          catch (bytes memory errorData) {
            emit ExternalCallFailed(poolId, address(ORACLE_MANAGER), "ICN", errorData);
          }
        } else {
          _poolConfigs[poolId].oracleGrowthComplete = true;
        }
      } catch (bytes memory errorData) {
        emit ExternalCallFailed(poolId, address(ORACLE_MANAGER), "states", errorData);
      }
    }
    (, int24 preSwapTick,,) = poolManager.getSlot0(poolId);

    uint24 activeFee;
    try DYNAMIC_FEE_MANAGER.prepareSwap(key, preSwapTick) returns (uint24 fee) {
      activeFee = fee;
    } catch (bytes memory errorData) {
      emit ExternalCallFailed(poolId, address(DYNAMIC_FEE_MANAGER), "PS", errorData);
    }

    if (activeFee == 0) revert Errors.InvalidFee(); // NB: invariant; should never happen

    // Cap the v4 pool swap fee for AegisEngine-initiated swaps to favor micro-liquidation
    // economics. The cap applies to `activeFee`, which is the scale factor used to compute
    // both the pool LP fee AND the hook fee — but the hook fee is still charged on top of the
    // capped pool fee, not absorbed into it. With `hookFeePpm = 100%`, the engine's all-in
    // fee on a swap is approximately twice `ENGINE_MAX_SWAP_FEE_PIPS` (i.e. ≈ 0.2%), well
    // within the 2% `MICRO_LIQ_CONSERVATIVE_HAIRCUT_PIPS` budget. Stacking is intentional.
    if (sender == address(AEGIS_ENGINE) && activeFee > ENGINE_MAX_SWAP_FEE_PIPS) {
      activeFee = ENGINE_MAX_SWAP_FEE_PIPS;
    }

    HookRuntime.Runtime memory runtime =
      HookRuntime.Runtime({ dynamicFee: activeFee, preSwapTick: preSwapTick, sender: sender });
    HookRuntime.store(poolId, runtime);

    // V4 hook-fee accounting constraint: `BeforeSwapDelta` only adjusts the SPECIFIED currency,
    // and `afterSwap`'s int128 return only adjusts the UNSPECIFIED currency. Since we always
    // want the hook fee charged in the INPUT currency:
    //   - exactOut: input is unspecified → compute in afterSwap (actual input known by then).
    //   - exactIn:  input is specified   → compute in beforeSwap from the requested input.
    // See https://github.com/Uniswap/docs/issues/967.
    if (params.amountSpecified < 0) {
      // i.e. exactIn swap
      hookSwapDelta = _beforeSwapExactIn(poolId, key, params, runtime);
    }

    return (BaseHook.beforeSwap.selector, hookSwapDelta, (activeFee | LPFeeLibrary.OVERRIDE_FEE_FLAG));
  }

  /// @inheritdoc BaseHook
  function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
    internal
    virtual
    override
    returns (bytes4, int128)
  {
    PoolId poolId = key.toId();
    HookRuntime.Runtime memory runtime = HookRuntime.load(poolId);

    (, int24 postSwapTick,,) = poolManager.getSlot0(poolId);

    if (postSwapTick != runtime.preSwapTick) {
      try ORACLE_MANAGER.afterSwap(key, runtime.preSwapTick) { }
      catch (bytes memory errorData) {
        emit ExternalCallFailed(poolId, address(ORACLE_MANAGER), "AS", errorData);
      }
    }

    try DYNAMIC_FEE_MANAGER.finalizeSwap(key, runtime.preSwapTick, postSwapTick) { }
    catch (bytes memory errorData) {
      emit ExternalCallFailed(poolId, address(DYNAMIC_FEE_MANAGER), "FS", errorData);
    }

    LIMIT_ORDER_MANAGER.onAfterSwap(key, params);

    int128 hookFeeReturned;
    if (params.amountSpecified > 0) {
      // i.e. exactOut swap
      bool zeroIsInput = params.zeroForOne;
      int128 inputAmount = zeroIsInput ? delta.amount0() : delta.amount1();
      hookFeeReturned = _afterSwapExactOut(poolId, key, zeroIsInput, inputAmount, runtime);
    }

    _tryReinvest(poolId, key);

    // Flush the current swap's hook fee — held in `CurrentSwapHookFeeCache` by `_chargeHookFee`
    // — into `_pendingFees` for the next reinvest cycle. Done unconditionally so all
    // `_tryReinvest` early-return paths (paused / cooldown / threshold / failed engine call)
    // still result in the fee accruing. Skips the SSTORE if the cache was empty.
    BalanceDelta currentSwapFee = CurrentSwapHookFeeCache.consume(poolId);
    if (BalanceDelta.unwrap(currentSwapFee) != 0) {
      _pendingFees[poolId] = _pendingFees[poolId] + currentSwapFee;
    }

    return (BaseHook.afterSwap.selector, hookFeeReturned);
  }

  /// @inheritdoc BaseHook
  /// @dev AE market initialization is intentionally NOT performed here. The AE market must
  ///      remain uninitialized until OracleManager can durably serve consult(TWAP_WINDOW_SECONDS);
  ///      anyone may call AegisEngine.initialize(key) once the oracle is warm. Until then
  ///      debt-bearing flows are blocked at the engine boundary, ensuring debt cannot exist
  ///      in a market that lacks the price-history liquidation needs.
  function _afterInitialize(address, PoolKey calldata key, uint160, int24 tick)
    internal
    virtual
    override
    returns (bytes4)
  {
    if (!LPFeeLibrary.isDynamicFee(key.fee)) revert Errors.InvalidFee();
    ORACLE_MANAGER.recordAfterInitialize(key, tick);
    DYNAMIC_FEE_MANAGER.initialize(key, tick);
    LIMIT_ORDER_MANAGER.onAfterInitialize(key, tick);

    return BaseHook.afterInitialize.selector;
  }

  // - - - Internal helpers - - -

  function _beforeSwapExactIn(
    PoolId poolId,
    PoolKey calldata key,
    SwapParams calldata params,
    HookRuntime.Runtime memory runtime
  ) private returns (BeforeSwapDelta hookSwapDelta) {
    uint128 hookFeeAmount = _computeHookFeeFromAmountIn(poolId, uint256(-params.amountSpecified), runtime.dynamicFee);
    if (hookFeeAmount == 0) return BeforeSwapDeltaLibrary.ZERO_DELTA;
    (uint128 fee0, uint128 fee1) = _chargeHookFee(poolId, key, params.zeroForOne, hookFeeAmount);
    emit HookFee(poolId, runtime.sender, fee0, fee1);
    // forge-lint: disable-next-line(unsafe-typecast) -- hook fees are capped at type(int128).max
    int128 deltaSpecifiedInt = int128(hookFeeAmount);
    hookSwapDelta = toBeforeSwapDelta(deltaSpecifiedInt, 0);
  }

  function _afterSwapExactOut(
    PoolId poolId,
    PoolKey calldata key,
    bool zeroIsInput,
    int128 inputAmount,
    HookRuntime.Runtime memory runtime
  ) private returns (int128 hookFeeReturned) {
    // forge-lint: disable-next-line(unsafe-typecast) -- input amount is negative by definition
    uint128 hookFeeAmount = _computeHookFeeFromAmountIn(poolId, uint256(-int256(inputAmount)), runtime.dynamicFee);
    (uint128 fee0, uint128 fee1) = _chargeHookFee(poolId, key, zeroIsInput, hookFeeAmount);
    emit HookFee(poolId, runtime.sender, fee0, fee1);
    // forge-lint: disable-next-line(unsafe-typecast) -- hook fees are capped at type(int128).max
    hookFeeReturned = int128(hookFeeAmount);
  }

  // we cut the hook fee out of the specified input amount
  function _computeHookFeeFromAmountIn(PoolId poolId, uint256 amountIn, uint24 dynamicFee)
    private
    view
    returns (uint128 hookFeeAmount)
  {
    uint256 hookFeeCutPpm = _poolConfigs[poolId].hookFeePpm;
    if (hookFeeCutPpm == 0) return 0; // save some gas

    // TOB-AEGIS-11: Round down intermediate to avoid double round-up bias (max 1 wei vs 2 wei).
    uint256 swapFeeAmount = FullMath.mulDiv(amountIn, dynamicFee, PPM_SCALE);
    uint256 hookFeeAmountRaw = FullMath.mulDivRoundingUp(swapFeeAmount, hookFeeCutPpm, PPM_SCALE);

    // forge-lint: disable-start(unsafe-typecast) -- cast to uint128 is safe by construction
    hookFeeAmount =
      (hookFeeAmountRaw > uint256(int256(type(int128).max))) ? uint128(type(int128).max) : uint128(hookFeeAmountRaw);
    // forge-lint: disable-end
  }

  /// @dev Charge the hook fee for the current swap. The 6909 claim is minted immediately
  ///      (recording the fee against the swapper's eventual settlement) and `HookFee` is
  ///      emitted, but the `_pendingFees` update is DEFERRED via `CurrentSwapHookFeeCache`.
  ///      `_tryReinvest` therefore reads `_pendingFees` without the current swap's
  ///      contribution; the cached delta is folded back into `_pendingFees` at end of
  ///      `_afterSwap` (see `CurrentSwapHookFeeCache.consume` call there).
  function _chargeHookFee(PoolId poolId, PoolKey calldata key, bool zeroIsInput, uint128 amount)
    private
    returns (uint128 fee0, uint128 fee1)
  {
    Currency feeCurrency = zeroIsInput ? key.currency0 : key.currency1;
    poolManager.mint(address(this), feeCurrency.toId(), amount);

    BalanceDelta newHookFees;

    if (zeroIsInput) {
      newHookFees = toBalanceDelta(int128(amount), 0);
      fee0 = amount;
    } else {
      newHookFees = toBalanceDelta(0, int128(amount));
      fee1 = amount;
    }

    CurrentSwapHookFeeCache.add(poolId, newHookFees);
  }

  /// @dev Reinvest pending fees into a full-range LP position via the engine.
  ///
  ///      Per-swap deferral (see `CurrentSwapHookFeeCache` and `_chargeHookFee`) is the
  ///      strict invariant against spending the IN-FLIGHT swap's own fee: that fee is held
  ///      in transient storage and not folded into `_pendingFees` until end of `_afterSwap`,
  ///      so the read inside this function never includes the currently-running swap's
  ///      contribution.
  ///
  ///      The cooldown gate prevents only REPEATED reinvest attempts within the same
  ///      `block.timestamp` — once a reinvest fires (success or caught-failure branch),
  ///      `lastReinvest = block.timestamp` blocks all subsequent attempts until the next
  ///      block.
  ///
  ///      The PM-balance guard (`_canPoolManagerPayReinvest`) prevents a residual DoS: if
  ///      PM's underlying ERC20 reserves for either currency are LESS than that currency's
  ///      `_pendingFees` amount, the eventual `take` inside `_payEngineDelta` would revert
  ///      with an underlying ERC20 insufficient-balance error. That revert lands AFTER the
  ///      engine call returned (outside the catch's reachable scope), so it would bubble
  ///      up and brick the swap. The guard skips reinvest silently in that case (no
  ///      `lastReinvest` bump) so the swap completes and a subsequent swap retries reinvest
  ///      once PM's reserves recover. Affected scenarios include sophisticated unlockers
  ///      that thin PM via `poolManager.take` for internal-balance accounting before
  ///      triggering an Aegis swap mid-flow, and very-low-reserve pools.
  function _tryReinvest(PoolId poolId, PoolKey calldata key) private {
    if (paused()) return;

    PoolConfig storage config = _poolConfigs[poolId];

    // Enforce cooldown between reinvestments
    if (block.timestamp < config.lastReinvest + REINVEST_COOLDOWN) return;

    BalanceDelta pending = _pendingFees[poolId];
    (uint256 amount0, uint256 amount1) = pendingFees(poolId);
    if (amount0 < MIN_REINVEST_LIQUIDITY || amount1 < MIN_REINVEST_LIQUIDITY) return;

    // PM-balance guard: see this function's NatSpec for why. Conservative — uses pending
    // amounts as the upper bound on what `_payEngineDelta` will eventually `take`. The
    // engine consumes at most `pending` per side (full-range LP at any price), so
    // `pmBal >= pending` is sufficient.
    if (!_canPoolManagerPayReinvest(key, amount0, amount1)) return;

    (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
    (uint160 minSqrtPriceX96, uint160 maxSqrtPriceX96) = LUnitMath.getActualFullRangePrices(key.tickSpacing);

    uint128 liquidityMintable =
      LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, minSqrtPriceX96, maxSqrtPriceX96, amount0, amount1);

    if (liquidityMintable < MIN_REINVEST_LIQUIDITY) return;

    // Wrapped in try/catch following this contract's defensive-design pattern: AE market init
    // is decoupled from `_afterInitialize`, so there's a window where the AE market isn't yet
    // initialized while swaps can still accumulate hook fees. Without this wrap, the engine's
    // `_syncMarket → checkMarketInitializedInEngine` revert would propagate up through
    // `_afterSwap` and brick all swaps until init. On failure we also bump `lastReinvest` so
    // subsequent swaps don't repeatedly retry within the cooldown window (would otherwise emit
    // `ExternalCallFailed` on every swap during pre-init). The next reinvest attempt happens
    // at most `REINVEST_COOLDOWN` after the most recent failure; pending fees stay accumulated
    // and are reinvested then.
    try AEGIS_ENGINE.modifyLiquidity(poolId, int128(liquidityMintable), address(this)) returns (
      uint256, BalanceDelta modifyFullRangeDelta
    ) {
      _pendingFees[poolId] = pending + modifyFullRangeDelta;
      config.lastReinvest = uint32(block.timestamp);

      _payEngineDelta(key.currency0, modifyFullRangeDelta.amount0());
      _payEngineDelta(key.currency1, modifyFullRangeDelta.amount1());

      emit HookFeeReinvested(
        poolId, address(0), uint128(-modifyFullRangeDelta.amount0()), uint128(-modifyFullRangeDelta.amount1())
      );
    } catch (bytes memory errorData) {
      config.lastReinvest = uint32(block.timestamp);
      emit ExternalCallFailed(poolId, address(AEGIS_ENGINE), "ML", errorData);
    }
  }

  /// @dev See `_tryReinvest` NatSpec for rationale. Uses `pending` amounts as a conservative
  ///      upper bound on the `take` amounts that `_payEngineDelta` will perform.
  function _canPoolManagerPayReinvest(PoolKey calldata key, uint256 amount0, uint256 amount1)
    private
    view
    returns (bool)
  {
    return key.currency0.balanceOf(address(poolManager)) >= amount0
      && key.currency1.balanceOf(address(poolManager)) >= amount1;
  }

  function _payEngineDelta(Currency currency, int128 delta) private {
    if (delta < 0) {
      // we only need to pay the AegisEngine on a negative delta(i.e. AegisEngine owes PoolManager)
      uint256 amountToPay = uint128(-delta);
      // we've got to do this dance as we can't burn ERC6909 with a designated recipient of the positive transient delta
      // See: https://github.com/Uniswap/v4-core/issues/985
      poolManager.burn(address(this), currency.toId(), amountToPay);
      poolManager.take(currency, address(this), amountToPay);

      poolManager.sync(currency);
      if (currency.isAddressZero()) {
        poolManager.settleFor{ value: amountToPay }(address(AEGIS_ENGINE));
      } else {
        // forge-lint: disable-next-line(erc20-unchecked-transfer) -- handled safely in CurrencyLibrary
        currency.transfer(address(poolManager), amountToPay);
        poolManager.settleFor(address(AEGIS_ENGINE));
      }
    }
  }

  // - - - Utils Helpers - - -

  function _checkNonZeroAddress(address addressToCheck) private pure {
    if (addressToCheck == address(0)) revert Errors.ZeroAddress();
  }
}
