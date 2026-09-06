// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolConfig} from "../types/PoolConfig.sol";
import {SizeCurveLib} from "./SizeCurveLib.sol";
import {Errors} from "./Errors.sol";

/// @notice Quote construction: inventory skew applied to the mid, then a three-part spread
///         applied against the taker.
///
///     mid_skewed = mid * (1 + skewBps/BPS)
///     spread     = baseSpreadBps + staleness + size,  capped at maxTotalSpreadBps
///
/// Skew matters more than spread here, because the replenishment clock is measured in hours: the
/// quote must lean against inventory so flow self-corrects while the slow rebalance leg catches
/// up. Spread is what makes a fill profitable; skew is what keeps the pool from being cornered.
library SpreadMath {
    uint256 internal constant BPS = 10_000;

    /// @notice Apply the signed inventory lean to the raw mid.
    /// @dev Positive skew raises currency1-per-currency0, which makes currency1 cheaper to buy and
    ///      pulls currency1 out of the pool. The operator sets the sign; the hook only bounds it.
    function applySkew(uint256 midQ128, int64 skewBps) internal pure returns (uint256) {
        if (skewBps == 0) return midQ128;
        if (skewBps > 0) {
            // safe: guarded positive on the line above, so the int64 -> uint64 cast preserves value.
            // forge-lint: disable-next-line(unsafe-typecast)
            return midQ128 + FullMath.mulDiv(midQ128, uint256(uint64(skewBps)), BPS);
        }
        // safe: skewBps is strictly negative here, so -skewBps is positive. type(int64).min would
        // revert on negation under checked arithmetic, and maxAbsSkewBps < BPS bounds it long before.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 down = FullMath.mulDiv(midQ128, uint256(uint64(-skewBps)), BPS);
        // `maxAbsSkewBps` is validated below BPS at config time, so this cannot underflow to zero.
        return midQ128 - down;
    }

    /// @notice base + staleness + size, clamped by the pool's ceiling.
    /// @param ageSeconds Seconds since the last price push.
    /// @param refNotionalQuote Reference notional in QUOTE base units (see `PropAMMHook._refNotional`).
    function effectiveSpreadBps(PoolConfig memory cfg, uint256 ageSeconds, uint256 refNotionalQuote)
        internal
        pure
        returns (uint16)
    {
        uint256 staleness = (ageSeconds * cfg.stalenessSlopeBpsPerMin) / 60;
        if (staleness > cfg.maxStalenessSpreadBps) staleness = cfg.maxStalenessSpreadBps;

        uint256 total =
            uint256(cfg.baseSpreadBps) + staleness + uint256(SizeCurveLib.interpolate(cfg.sizeCurve, refNotionalQuote));

        if (total > cfg.maxTotalSpreadBps) total = cfg.maxTotalSpreadBps;
        // safe: clamped above to cfg.maxTotalSpreadBps, itself a uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(total);
    }

    /// @notice Move the skewed mid against the taker by `spreadBps`.
    /// @dev zeroForOne: the taker pays currency0 and receives currency1, and output is
    ///      `amountIn * price`, so a LOWER price gives them less. oneForZero: output is
    ///      `amountIn / price`, so a HIGHER price gives them less. Both directions widen away
    ///      from the mid; neither ever improves on it.
    function againstTaker(uint256 midSkewedQ128, uint16 spreadBps, bool zeroForOne)
        internal
        pure
        returns (uint256)
    {
        if (spreadBps == 0) return midSkewedQ128;
        return zeroForOne
            ? FullMath.mulDiv(midSkewedQ128, BPS - spreadBps, BPS)
            : FullMath.mulDiv(midSkewedQ128, BPS + spreadBps, BPS);
    }

    /// @notice Config-time validation of everything spread-related.
    function validate(PoolConfig memory cfg) internal pure {
        // A spread of BPS or more would zero (or invert) the price.
        if (cfg.maxTotalSpreadBps >= BPS) revert Errors.SpreadCeilingTooHigh();
        if (cfg.baseSpreadBps > cfg.maxTotalSpreadBps) revert Errors.InvalidConfig();
        if (cfg.maxStalenessSpreadBps > cfg.maxTotalSpreadBps) revert Errors.InvalidConfig();
        if (cfg.maxAbsSkewBps < 0 || uint64(cfg.maxAbsSkewBps) >= BPS) revert Errors.InvalidConfig();
        if (cfg.maxAge == 0 || cfg.windowLength == 0 || cfg.moveWindowLength == 0) revert Errors.InvalidConfig();
        if (cfg.maxSwapAmountQuote == 0 || cfg.windowCapQuote == 0) revert Errors.InvalidConfig();
        if (cfg.maxSwapAmountQuote > cfg.windowCapQuote) revert Errors.InvalidConfig();
        if (cfg.maxDeviationBps >= BPS || cfg.maxWindowMoveBps >= BPS) revert Errors.InvalidConfig();
        // A single push may not exceed the cumulative budget it is drawn from.
        if (cfg.maxDeviationBps > cfg.maxWindowMoveBps) revert Errors.InvalidConfig();
        SizeCurveLib.validate(cfg.sizeCurve);
    }
}
