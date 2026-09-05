// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {ProtocolFeeLibrary} from "@uniswap/v4-core/src/libraries/ProtocolFeeLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @notice Stateful per-pool sell-tax engine kept outside the hook's EIP-170
/// budget. Only the canonical hook may initialize, configure, or touch it.
contract FlashTaxModule {
    using StateLibrary for IPoolManager;
    using ProtocolFeeLibrary for uint16;

    error NotHook();
    error TaxTooHigh();
    error ZeroAddress();
    error ProtocolFeeInactive();
    error InvalidObservation();

    uint256 private constant BPS = 10_000;
    uint256 private constant PRICE_SCALE = 1e18;
    uint16 public constant DEFAULT_BASE_BPS = 10;
    uint16 public constant MAX_BASE_BPS = 100;
    uint256 public constant MAX_AGGREGATE_BPS = 2_500;
    uint256 private constant AGGREGATOR_PROTOCOL_FEE_MULTIPLIER = 25;

    struct PoolInfo {
        uint128 lowVolStored;
        uint64 lastTouchAt;
        uint160 anchorSqrtPrice;
        uint64 anchorAt;
        bool tokenIsCurrency0;
        uint160 observedSqrtPrice;
        uint128 observedLiquidity;
    }

    struct TaxParams {
        uint16 baseBps;
        uint16 impactCapBps;
        uint16 rollingCapBps;
        uint16 lowVolMaxBps;
        uint32 lowVolTau;
        uint32 anchorWindow;
    }

    IPoolManager public immutable poolManager;
    address public immutable hook;
    mapping(bytes32 => PoolInfo) public pools;
    mapping(bytes32 => TaxParams) public taxOf;

    constructor(IPoolManager pm, address hook_) {
        if (address(pm) == address(0) || hook_ == address(0)) revert ZeroAddress();
        poolManager = pm;
        hook = hook_;
    }

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    function initializePool(bytes32 rawId, uint160 sqrtPriceX96, bool tokenIsCurrency0) external onlyHook {
        PoolInfo storage info = pools[rawId];
        info.anchorSqrtPrice = sqrtPriceX96;
        info.anchorAt = uint64(block.timestamp);
        info.lastTouchAt = uint64(block.timestamp);
        info.tokenIsCurrency0 = tokenIsCurrency0;
        taxOf[rawId].baseBps = DEFAULT_BASE_BPS;
    }

    function setTax(bytes32 rawId, TaxParams calldata params) external onlyHook {
        if (
            params.baseBps > MAX_BASE_BPS
                || uint256(params.baseBps) + params.impactCapBps + params.rollingCapBps + params.lowVolMaxBps
                    > MAX_AGGREGATE_BPS
        ) revert TaxTooHigh();
        taxOf[rawId] = params;
    }

    /// @notice Fail-closed launch guard for this custom-accounting hook. It is
    /// kept in the module so PoolManager slot-reading code is not duplicated
    /// into the size-constrained immutable hook.
    function requireProtocolFee(bytes32 rawId, bool zeroForOne) external view onlyHook {
        (,, uint24 protocolFee,) = poolManager.getSlot0(PoolId.wrap(rawId));
        uint16 directionalFee = zeroForOne
            ? ProtocolFeeLibrary.getZeroForOneFee(protocolFee)
            : ProtocolFeeLibrary.getOneForZeroFee(protocolFee);
        if (directionalFee == 0) revert ProtocolFeeInactive();
    }

    /// @notice Captures the pre-swap price for exact-output sells and buys.
    /// Nested aggregator swaps intentionally cannot overwrite this observation
    /// because their sender is bypassed by the canonical hook.
    function beginObservation(bytes32 rawId) external onlyHook {
        PoolInfo storage info = pools[rawId];
        if (info.observedSqrtPrice != 0) revert InvalidObservation();
        PoolId id = PoolId.wrap(rawId);
        (info.observedSqrtPrice,,,) = poolManager.getSlot0(id);
        info.observedLiquidity = poolManager.getLiquidity(id);
    }

    /// @notice Quotes an exact-input sell from the current pre-swap state.
    function quoteAndTouch(bytes32 rawId, uint256 amount, bool zeroForOne) external onlyHook returns (uint256 bps) {
        PoolId id = PoolId.wrap(rawId);
        (uint160 current,,,) = poolManager.getSlot0(id);
        bps = _quoteAt(rawId, id, current, poolManager.getLiquidity(id), amount, zeroForOne);
        _touchAt(rawId, current);
    }

    /// @notice Route-aware exact-input quote. `amount` is the seller's gross
    /// notional, while `v4ImpactAmount` is only the portion selected for the
    /// native hooked curve. External liquidity must not create a hypothetical
    /// impact charge on a thin v4 pool.
    function quoteRouted(bytes32 rawId, uint256 amount, uint256 v4ImpactAmount, bool zeroForOne)
        external
        view
        returns (uint256 bps)
    {
        PoolId id = PoolId.wrap(rawId);
        (uint160 current,,,) = poolManager.getSlot0(id);
        bps = _quoteAtRouted(rawId, id, current, poolManager.getLiquidity(id), amount, v4ImpactAmount, zeroForOne);
    }

    /// @notice Fleet-aware quote. `routeImpactBps` is calculated from every
    /// selected curve at its own pre-swap price and weighted by token input.
    function quoteRoutedImpact(bytes32 rawId, uint256 amount, uint256 routeImpactBps, bool zeroForOne)
        external
        view
        returns (uint256 bps)
    {
        PoolId id = PoolId.wrap(rawId);
        (uint160 current,,,) = poolManager.getSlot0(id);
        bps = _quoteAtRouteImpact(rawId, id, current, amount, routeImpactBps, zeroForOne);
    }

    /// @notice Quotes an exact-output sell from the price observed before its
    /// swap. This prevents the realized input from being applied a second time
    /// to the already-moved post-swap curve.
    function quoteObservedAndTouch(bytes32 rawId, uint256 amount, bool zeroForOne)
        external
        onlyHook
        returns (uint256 bps)
    {
        PoolId id = PoolId.wrap(rawId);
        PoolInfo storage info = pools[rawId];
        uint160 observed = info.observedSqrtPrice;
        if (observed == 0) revert InvalidObservation();
        uint128 observedLiquidity = info.observedLiquidity;
        info.observedSqrtPrice = 0;
        info.observedLiquidity = 0;
        bps = _quoteAt(rawId, id, observed, observedLiquidity, amount, zeroForOne);
        (uint160 current,,,) = poolManager.getSlot0(id);
        _touchAt(rawId, current);
    }

    /// @notice Route-aware exact-output realization. The total seller input
    /// remains the tax basis; only actual native-v4 input determines impact.
    function quoteObservedRoutedAndTouch(bytes32 rawId, uint256 amount, uint256 v4ImpactAmount, bool zeroForOne)
        external
        onlyHook
        returns (uint256 bps)
    {
        PoolId id = PoolId.wrap(rawId);
        PoolInfo storage info = pools[rawId];
        uint160 observed = info.observedSqrtPrice;
        if (observed == 0) revert InvalidObservation();
        uint128 observedLiquidity = info.observedLiquidity;
        info.observedSqrtPrice = 0;
        info.observedLiquidity = 0;
        bps = _quoteAtRouted(rawId, id, observed, observedLiquidity, amount, v4ImpactAmount, zeroForOne);
        (uint160 current,,,) = poolManager.getSlot0(id);
        _touchAt(rawId, current);
    }

    /// @notice Exact-output fleet-aware realization using the route impact
    /// recorded against pre-swap venue state by the sell planner.
    function quoteObservedRouteImpactAndTouch(bytes32 rawId, uint256 amount, uint256 routeImpactBps, bool zeroForOne)
        external
        onlyHook
        returns (uint256 bps)
    {
        PoolId id = PoolId.wrap(rawId);
        PoolInfo storage info = pools[rawId];
        uint160 observed = info.observedSqrtPrice;
        if (observed == 0) revert InvalidObservation();
        info.observedSqrtPrice = 0;
        info.observedLiquidity = 0;
        bps = _quoteAtRouteImpact(rawId, id, observed, amount, routeImpactBps, zeroForOne);
        (uint160 current,,,) = poolManager.getSlot0(id);
        _touchAt(rawId, current);
    }

    /// @notice Records a completed buy. Low-volume pressure is reduced by the
    /// real percentage price recovery, not by raw token units. Rolling pressure
    /// simultaneously falls as the current token price approaches its anchor.
    function finishObservation(bytes32 rawId, bool buy) external onlyHook {
        PoolId id = PoolId.wrap(rawId);
        PoolInfo storage info = pools[rawId];
        uint160 observed = info.observedSqrtPrice;
        if (observed == 0) revert InvalidObservation();
        info.observedSqrtPrice = 0;
        info.observedLiquidity = 0;
        (uint160 current,,,) = poolManager.getSlot0(id);
        if (!buy) {
            _touchAt(rawId, current);
            return;
        }

        TaxParams storage params = taxOf[rawId];
        uint256 accrued = _lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau);
        uint256 recovery = _tokenRiseBps(observed, current, info.tokenIsCurrency0);
        info.lowVolStored = uint128(recovery >= accrued ? 0 : accrued - recovery);
        info.lastTouchAt = uint64(block.timestamp);
        _updateAnchor(info, params.anchorWindow, current);
    }

    function touch(bytes32 rawId) external onlyHook {
        PoolId id = PoolId.wrap(rawId);
        (uint160 current,,,) = poolManager.getSlot0(id);
        _touchAt(rawId, current);
    }

    /// @notice Read-only component quote used by monitoring and invariant tests.
    function quoteBreakdown(bytes32 rawId, uint256 amount, bool zeroForOne)
        external
        view
        returns (uint256 baseBps, uint256 impactBps, uint256 rollingBps, uint256 lowVolumeBps, uint256 totalBps)
    {
        PoolId id = PoolId.wrap(rawId);
        TaxParams storage params = taxOf[rawId];
        (uint160 current,,,) = poolManager.getSlot0(id);
        baseBps = params.baseBps;
        impactBps = _impactBps(rawId, current, poolManager.getLiquidity(id), amount, params.impactCapBps);
        rollingBps = _rollingBps(rawId, current, params.rollingCapBps, params.anchorWindow);
        lowVolumeBps = _lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau);
        totalBps = baseBps + impactBps + rollingBps + lowVolumeBps;
        uint256 cap = _hookTaxCapBps(id, zeroForOne);
        if (totalBps > cap) totalBps = cap;
    }

    function _quoteAt(bytes32 rawId, PoolId id, uint160 start, uint128 liquidity, uint256 amount, bool zeroForOne)
        private
        view
        returns (uint256 bps)
    {
        TaxParams storage params = taxOf[rawId];
        bps = params.baseBps;
        bps += _impactBps(rawId, start, liquidity, amount, params.impactCapBps);
        bps += _rollingBps(rawId, start, params.rollingCapBps, params.anchorWindow);
        bps += _lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau);
        uint256 cap = _hookTaxCapBps(id, zeroForOne);
        if (bps > cap) bps = cap;
    }

    function _quoteAtRouted(
        bytes32 rawId,
        PoolId id,
        uint160 start,
        uint128 liquidity,
        uint256 amount,
        uint256 v4ImpactAmount,
        bool zeroForOne
    ) private view returns (uint256 bps) {
        TaxParams storage params = taxOf[rawId];
        bps = params.baseBps;
        bps += _impactBps(rawId, start, liquidity, v4ImpactAmount, params.impactCapBps);
        bps += _rollingBps(rawId, start, params.rollingCapBps, params.anchorWindow);
        bps += _lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau);
        uint256 cap = _hookTaxCapBps(id, zeroForOne);
        if (bps > cap) bps = cap;
        // `amount` intentionally remains explicit in this interface: it is the
        // gross basis used by FlashHook after this rate is returned.
        amount;
    }

    function _quoteAtRouteImpact(
        bytes32 rawId,
        PoolId id,
        uint160 current,
        uint256 amount,
        uint256 routeImpactBps,
        bool zeroForOne
    ) private view returns (uint256 bps) {
        TaxParams storage params = taxOf[rawId];
        uint256 boundedImpact = routeImpactBps > params.impactCapBps ? params.impactCapBps : routeImpactBps;
        bps = params.baseBps + boundedImpact;
        bps += _rollingBps(rawId, current, params.rollingCapBps, params.anchorWindow);
        bps += _lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau);
        uint256 cap = _hookTaxCapBps(id, zeroForOne);
        if (bps > cap) bps = cap;
        // The hook applies the returned rate to this gross token basis.
        amount;
    }

    function _hookTaxCapBps(PoolId id, bool zeroForOne) private view returns (uint256) {
        (,, uint24 packedProtocolFee, uint24 lpFee) = poolManager.getSlot0(id);
        uint16 protocolFee = zeroForOne
            ? ProtocolFeeLibrary.getZeroForOneFee(packedProtocolFee)
            : ProtocolFeeLibrary.getOneForZeroFee(packedProtocolFee);
        uint256 nativePips = protocolFee.calculateSwapFee(lpFee);
        uint256 externalPips = uint256(protocolFee) * AGGREGATOR_PROTOCOL_FEE_MULTIPLIER;
        uint256 upperPips = nativePips > externalPips ? nativePips : externalPips;
        uint256 upperBpsRoundedUp = (upperPips + 99) / 100;
        return upperBpsRoundedUp >= MAX_AGGREGATE_BPS ? 0 : MAX_AGGREGATE_BPS - upperBpsRoundedUp;
    }

    function _impactBps(bytes32 rawId, uint160 start, uint128 liquidity, uint256 amount, uint256 cap)
        private
        view
        returns (uint256)
    {
        if (cap == 0 || amount == 0) return 0;
        if (liquidity == 0) return cap;
        bool tokenIsCurrency0 = pools[rawId].tokenIsCurrency0;
        uint160 next = SqrtPriceMath.getNextSqrtPriceFromInput(start, liquidity, amount, tokenIsCurrency0);
        uint256 value = _tokenDeclineBps(start, next, tokenIsCurrency0);
        return value > cap ? cap : value;
    }

    function _rollingBps(bytes32 rawId, uint160 current, uint256 cap, uint256 window) private view returns (uint256) {
        if (cap == 0) return 0;
        PoolInfo storage info = pools[rawId];
        uint160 anchor = info.anchorSqrtPrice;
        if (anchor == 0 || (window != 0 && block.timestamp > uint256(info.anchorAt) + window)) return 0;
        uint256 dropBps = _tokenDeclineBps(anchor, current, info.tokenIsCurrency0);
        uint256 value = dropBps * 2;
        return value > cap ? cap : value;
    }

    function _lowVolumeBps(bytes32 rawId, uint256 maxBps, uint256 tau) private view returns (uint256) {
        if (maxBps == 0) return 0;
        PoolInfo storage info = pools[rawId];
        if (info.lastTouchAt == 0) return 0;
        uint256 accrued = info.lowVolStored;
        if (tau == 0) return maxBps;
        uint256 elapsed = block.timestamp > info.lastTouchAt ? block.timestamp - info.lastTouchAt : 0;
        accrued += maxBps * elapsed / tau;
        return accrued > maxBps ? maxBps : accrued;
    }

    function _touchAt(bytes32 rawId, uint160 current) private {
        PoolInfo storage info = pools[rawId];
        TaxParams storage params = taxOf[rawId];
        if (params.lowVolMaxBps != 0) {
            info.lowVolStored = uint128(_lowVolumeBps(rawId, params.lowVolMaxBps, params.lowVolTau));
        }
        info.lastTouchAt = uint64(block.timestamp);
        _updateAnchor(info, params.anchorWindow, current);
    }

    function _updateAnchor(PoolInfo storage info, uint256 window, uint160 current) private {
        bool newHigh = info.tokenIsCurrency0 ? current > info.anchorSqrtPrice : current < info.anchorSqrtPrice;
        if (newHigh || info.anchorSqrtPrice == 0 || (window != 0 && block.timestamp > uint256(info.anchorAt) + window))
        {
            info.anchorSqrtPrice = current;
            info.anchorAt = uint64(block.timestamp);
        }
    }

    function _tokenDeclineBps(uint160 beforePrice, uint160 afterPrice, bool tokenIsCurrency0)
        private
        pure
        returns (uint256)
    {
        if (beforePrice == 0 || afterPrice == 0) return 0;
        uint256 ratio;
        if (tokenIsCurrency0) {
            if (afterPrice >= beforePrice) return 0;
            ratio = FullMath.mulDiv(afterPrice, PRICE_SCALE, beforePrice);
        } else {
            if (afterPrice <= beforePrice) return 0;
            ratio = FullMath.mulDiv(beforePrice, PRICE_SCALE, afterPrice);
        }
        uint256 ratioSquared = FullMath.mulDiv(ratio, ratio, PRICE_SCALE);
        return ratioSquared >= PRICE_SCALE ? 0 : (PRICE_SCALE - ratioSquared) * BPS / PRICE_SCALE;
    }

    function _tokenRiseBps(uint160 beforePrice, uint160 afterPrice, bool tokenIsCurrency0)
        private
        pure
        returns (uint256)
    {
        return _tokenDeclineBps(afterPrice, beforePrice, tokenIsCurrency0);
    }
}
