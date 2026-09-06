// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolConfig} from "../types/PoolConfig.sol";
import {QuoteMath} from "./QuoteMath.sol";
import {SpreadMath} from "./SpreadMath.sol";
import {Errors} from "./Errors.sol";

/// @notice The complete quote composition, as one pure function.
///
/// This is the single on-chain source of quoting truth: the hook calls it, the lens calls it, and
/// the differential parity test calls it against 5,000 vectors emitted by the Python quoter. If
/// the two implementations disagree by one wei the hedger hedges the wrong size and the PnL
/// attribution is silently wrong forever, so there must be exactly one place on each side that
/// defines the composition.
library QuoteEngine {
    struct Result {
        uint256 amountIn;
        uint256 amountOut;
        uint256 notionalQuote;
        uint256 midSkewedQ128;
        uint256 effPriceQ128;
        uint16 spreadBps;
    }

    function priceSwap(
        PoolConfig memory cfg,
        uint256 midQ128,
        int64 skewBps,
        uint256 ageSeconds,
        bool zeroForOne,
        bool exactIn,
        uint256 specified
    ) internal pure returns (Result memory r) {
        if (specified == 0) revert Errors.ZeroAmount();
        if (midQ128 == 0) revert Errors.InvalidPrice();

        r.midSkewedQ128 = SpreadMath.applySkew(midQ128, skewBps);

        uint256 ref = refNotionalQuote(cfg, zeroForOne, exactIn, specified, r.midSkewedQ128);
        r.spreadBps = SpreadMath.effectiveSpreadBps(cfg, ageSeconds, ref);
        r.effPriceQ128 = SpreadMath.againstTaker(r.midSkewedQ128, r.spreadBps, zeroForOne);

        if (exactIn) {
            r.amountIn = specified;
            r.amountOut = QuoteMath.amountOutFor(r.amountIn, r.effPriceQ128, zeroForOne);
        } else {
            r.amountOut = specified;
            r.amountIn = QuoteMath.amountInFor(r.amountOut, r.effPriceQ128, zeroForOne);
        }
        if (r.amountIn == 0 || r.amountOut == 0) revert Errors.ZeroAmount();

        // Normalise the notional to QUOTE units with zero arithmetic. Exactly one leg is the quote
        // token and which one is a pure boolean; converting through the price here (as the
        // reference sketch did for oneForZero) is dimensionally wrong.
        r.notionalQuote = (cfg.quoteIsCurrency0 == zeroForOne) ? r.amountIn : r.amountOut;
    }

    /// @notice Reference notional in QUOTE base units, derived from the SPECIFIED amount alone.
    /// @dev The size premium needs a notional, but for exact-output the input is what we are
    ///      solving for. Iterating to a fixed point would not be reproducible by an off-chain
    ///      quoter, so both sides take one deterministic pass off the specified side instead,
    ///      converting at the pre-spread mid when the specified currency is not the quote token.
    function refNotionalQuote(
        PoolConfig memory cfg,
        bool zeroForOne,
        bool exactIn,
        uint256 specified,
        uint256 midSkewedQ128
    ) internal pure returns (uint256) {
        // exactIn  => the specified currency is the INPUT; exactOut => it is the OUTPUT.
        bool specifiedIsCurrency0 = (exactIn == zeroForOne);
        if (specifiedIsCurrency0 == cfg.quoteIsCurrency0) return specified;
        return cfg.quoteIsCurrency0
            ? QuoteMath.c1ToC0(specified, midSkewedQ128)
            : QuoteMath.c0ToC1(specified, midSkewedQ128);
    }
}
