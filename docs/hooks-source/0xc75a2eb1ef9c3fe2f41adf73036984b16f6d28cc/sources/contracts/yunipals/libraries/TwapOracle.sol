// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title TwapOracle - per-pool manipulation-resistant price TWAP for V4 hooks
/// @notice Prices are Q96 "currency1 per currency0" (= sqrtPriceX96² / 2⁹⁶). `accumulate` folds
///         elapsed time into the price integral; `consult` returns the time-weighted average over a
///         trailing window, interpolating the cumulative at the window's start via binary search.
///         Callers derive a `minOut` from it to bound permissionless buy-and-burn swaps against
///         sandwiching (mirrors `BuyBurnRecycler`/`AnchorPoolHook.minYpalOut`).
/// @dev    H-02 hardening (security review 2026-07-13). Two changes close the manipulation vectors
///         the previous port exposed:
///
///         1. **Integrate at the *previously-recorded* spot, not the freshly-observed one.** Each call
///            charges the interval [lastTs, now] at `lastSpotX96` — the price that actually prevailed
///            during it — and only *then* records the new spot for the *next* interval. So a hook that
///            calls `accumulate` in `afterSwap` (post-swap price) no longer retroactively attributes a
///            quiet interval to a freshly manipulated price: a manipulated spot moves the TWAP only in
///            proportion to how long the attacker can *hold* it, which is the whole point of a TWAP.
///
///         2. **Bucketed ring so pokes cannot evict the window.** The running integral
///            (`priceCumulative`/`lastTs`/`lastSpotX96`) advances on every call, but a checkpoint is
///            pushed into the bounded ring at most once per `MIN_CHECKPOINT_SPACING`. With
///            `(CARDINALITY - 2) · MIN_CHECKPOINT_SPACING ≥` any supported window, the buffer always
///            spans the window once warm, so permissionless `poke` spam can no longer blow the history
///            away and force `minOut` back to its unprotected cold state. Cold history is therefore a
///            genuine genesis-only condition, not an attacker-inducible one.
library TwapOracle {
    // 48 checkpoints × 60s min spacing ⇒ the ring spans ≥ (48−2)·60 = 2760s, comfortably covering the
    // 1800s (30-min) buy-and-burn window with margin for the up-to-one-spacing lag at the tip. 60s
    // granularity on a 1800s TWAP bounds the window-edge interpolation error to ~3%, immaterial next
    // to the callers' 10% slippage tolerance.
    uint16 internal constant CARDINALITY = 48;
    uint256 internal constant MIN_CHECKPOINT_SPACING = 60;
    uint256 internal constant Q96 = 2 ** 96;
    uint256 internal constant BPS = 10_000;

    // L-03: cap the Q96 spot folded into the integral so `spot * dt` (dt is bounded by uint40 time)
    // can never overflow uint256 and revert a hook near a V4 price extreme — which would freeze swaps
    // at the boundary. `>> 48` leaves ~2^208 headroom, far above any realistic YPAL-denominated price
    // (even a price of 1e12 is ~2^136), so the clamp only ever engages in a degenerate/adversarial pool.
    uint256 internal constant MAX_SPOT_X96 = type(uint256).max >> 48;

    struct Obs {
        uint40 ts;
        uint256 cum; // ∫ priceX96 dt up to `ts`
    }

    struct Oracle {
        uint256 priceCumulative; // ∫ priceX96 dt up to lastTs (advances every call)
        uint256 lastSpotX96; // spot recorded at lastTs; used to integrate the NEXT interval
        uint40 lastTs;
        uint16 head;
        uint16 count;
        Obs[CARDINALITY] observations;
    }

    /// @notice Fold the interval [lastTs, now] into the integral at the LAST recorded spot, then record
    ///         `spotX96` for the next interval. Call on every swap (incl. core swaps, so the TWAP
    ///         reflects all price movement) and on `poke`.
    function accumulate(Oracle storage o, uint256 spotX96, uint256 nowTs) internal {
        if (spotX96 > MAX_SPOT_X96) spotX96 = MAX_SPOT_X96; // L-03: overflow-safe integral
        if (o.lastTs == 0) {
            // First touch: anchor the buffer at (now, cum=0) and seed the spot. No interval to fold yet.
            o.lastTs = uint40(nowTs);
            o.lastSpotX96 = spotX96;
            o.observations[0] = Obs(uint40(nowTs), 0);
            o.head = 0;
            o.count = 1;
            return;
        }
        uint256 dt = nowTs - o.lastTs;
        if (dt == 0) {
            // Same-timestamp update: the interval was already folded, but record the LATEST spot so
            // the price carried into the NEXT interval is the block's final settled price. Without
            // this, only the first swap of a timestamp is remembered, letting an attacker pump then
            // revert within one block and poison the following interval with the transient price (H-02).
            o.lastSpotX96 = spotX96;
            return;
        }
        // Charge the elapsed interval at the price that prevailed during it (the previously recorded
        // spot) — NOT the value passed in this call, which may be a just-manipulated post-swap price.
        o.priceCumulative += o.lastSpotX96 * dt;
        o.lastTs = uint40(nowTs);
        o.lastSpotX96 = spotX96;

        // Checkpoint into the ring at most once per MIN_CHECKPOINT_SPACING (measured from the last
        // pushed checkpoint, which is untouched between pushes). Rapid pokes therefore advance the
        // integral but cannot evict older checkpoints, so the window's history survives.
        if (nowTs - o.observations[o.head].ts >= MIN_CHECKPOINT_SPACING) {
            o.head = uint16((uint256(o.head) + 1) % CARDINALITY);
            o.observations[o.head] = Obs(uint40(nowTs), o.priceCumulative);
            if (o.count < CARDINALITY) o.count++;
        }
    }

    /// @notice (ok, priceX96) TWAP of currency1-per-currency0 over `window` seconds. `ok=false` when
    ///         the window predates the oldest observation (genesis cold start) — callers treat that as
    ///         "no floor". Post-warm this can no longer be forced by history eviction (see bucketing).
    function consult(Oracle storage o, uint256 nowTs, uint256 window) internal view returns (bool, uint256) {
        if (window == 0 || o.count == 0) return (false, 0);
        uint256 target = nowTs - window;
        uint256 oldest = o.count == CARDINALITY ? (uint256(o.head) + 1) % CARDINALITY : 0;
        if (target < o.observations[oldest].ts) return (false, 0);
        uint256 cumNow = o.priceCumulative + o.lastSpotX96 * (nowTs - o.lastTs);
        uint256 cumThen = _cumulativeAt(o, target, oldest, nowTs, cumNow);
        return (true, (cumNow - cumThen) / window);
    }

    /// @notice Minimum acceptable output for swapping `amountIn` of the input side at the TWAP, less
    ///         `slippageBps`. `zeroForOne` = selling currency0 for currency1. Returns 0 on cold start.
    function minOut(Oracle storage o, uint256 nowTs, bool zeroForOne, uint256 amountIn, uint256 window, uint256 slippageBps)
        internal
        view
        returns (uint256)
    {
        (bool ok, uint256 p) = consult(o, nowTs, window); // p = currency1 per currency0, Q96
        if (!ok || p == 0) return 0;
        // out(c1) = in(c0) · p / Q96 ; out(c0) = in(c1) · Q96 / p
        uint256 ideal = zeroForOne ? FullMath.mulDiv(amountIn, p, Q96) : FullMath.mulDiv(amountIn, Q96, p);
        return FullMath.mulDiv(ideal, BPS - slippageBps, BPS); // L-03: avoid `ideal * BPS` overflow surface
    }

    /// @dev Interpolated cumulative at `target`, binary search over the ring for the newest checkpoint
    ///      at or before `target`. The segment to its right is either the next checkpoint or, past the
    ///      newest checkpoint, the tip (nowTs, cumNow) — `cumNow` already folds the open interval at the
    ///      last recorded spot. `target` is guaranteed ≥ the oldest checkpoint ts by `consult`.
    function _cumulativeAt(Oracle storage o, uint256 target, uint256 oldest, uint256 nowTs, uint256 cumNow)
        private
        view
        returns (uint256)
    {
        uint256 n = o.count;
        uint256 lo = 0;
        uint256 hi = n - 1;
        uint256 res = 0;
        while (lo <= hi) {
            uint256 mid = (lo + hi) / 2;
            uint256 phys = (oldest + mid) % CARDINALITY;
            if (o.observations[phys].ts <= target) {
                res = mid;
                if (mid == n - 1) break;
                lo = mid + 1;
            } else {
                if (mid == 0) break;
                hi = mid - 1;
            }
        }

        Obs memory ob = o.observations[(oldest + res) % CARDINALITY];
        uint256 nextTs;
        uint256 nextCum;
        if (res == n - 1) {
            // Tip segment: from the newest checkpoint to (now, cumNow).
            nextTs = nowTs;
            nextCum = cumNow;
        } else {
            Obs memory nx = o.observations[(oldest + res + 1) % CARDINALITY];
            nextTs = nx.ts;
            nextCum = nx.cum;
        }
        if (nextTs == ob.ts) return ob.cum;
        // L-03: mulDiv (512-bit intermediate) — `nextCum - ob.cum` can already hold a clamped extreme
        // spot times a long interval, so multiplying by the offset before dividing could overflow.
        return ob.cum + FullMath.mulDiv(nextCum - ob.cum, target - ob.ts, nextTs - ob.ts);
    }
}
