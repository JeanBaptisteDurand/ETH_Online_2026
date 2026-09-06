// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SizePoint} from "../types/PoolConfig.sol";
import {Errors} from "./Errors.sol";

/// @notice A 4-point piecewise-linear size-impact curve, in QUOTE base units -> bps.
///
/// Flat below the first knot, linear between knots, flat above the last. Four points is enough to
/// express "free up to $5k, widening to 40 bps at $100k" without any on-chain curve fitting, and
/// the off-chain quoter mirrors this function exactly (see the differential parity test).
library SizeCurveLib {
    /// @notice Spread contribution, in bps, for a notional expressed in QUOTE base units.
    function interpolate(SizePoint[4] memory curve, uint256 notionalQuote)
        internal
        pure
        returns (uint16)
    {
        // Below the first knot: no size premium.
        if (notionalQuote <= curve[0].notionalQuote) return curve[0].bps;

        for (uint256 i = 1; i < 4; ++i) {
            uint256 hiN = curve[i].notionalQuote;
            // A zero threshold past index 0 terminates the curve early: everything from here up
            // takes the previous knot's bps. Lets a pool use fewer than four points.
            if (hiN == 0) return curve[i - 1].bps;

            if (notionalQuote <= hiN) {
                uint256 loN = curve[i - 1].notionalQuote;
                uint256 loB = curve[i - 1].bps;
                uint256 hiB = curve[i].bps;
                // safe: hiB is a uint16 field widened to uint256, never modified.
                // forge-lint: disable-next-line(unsafe-typecast)
                if (hiN == loN) return uint16(hiB);
                // Linear, rounded DOWN in the span but the caller's ceiling still applies. The
                // spread widens against the taker, so rounding down here is the conservative
                // direction for the taker and the aggressive one for us -- keep it exact instead.
                // safe: the interpolated term is bounded by (hiB - loB) because
                // (notionalQuote - loN) <= (hiN - loN), so the sum is at most hiB, a uint16.
                // forge-lint: disable-next-line(unsafe-typecast)
                return uint16(loB + ((hiB - loB) * (notionalQuote - loN)) / (hiN - loN));
            }
        }
        // Above the last knot: flat at the maximum.
        return curve[3].bps;
    }

    /// @notice Reverts unless the curve is non-decreasing in both notional and bps.
    /// @dev Called from `setConfig`, never from the swap path. A non-monotone curve would let a
    ///      larger swap quote a tighter spread, which is a free option.
    function validate(SizePoint[4] memory curve) internal pure {
        for (uint256 i = 1; i < 4; ++i) {
            if (curve[i].notionalQuote == 0) {
                // Terminated curve: every remaining knot must also be empty.
                for (uint256 j = i; j < 4; ++j) {
                    if (curve[j].notionalQuote != 0 || curve[j].bps != 0) {
                        revert Errors.NonMonotonicSizeCurve();
                    }
                }
                return;
            }
            if (curve[i].notionalQuote <= curve[i - 1].notionalQuote) revert Errors.NonMonotonicSizeCurve();
            if (curve[i].bps < curve[i - 1].bps) revert Errors.NonMonotonicSizeCurve();
        }
    }
}
