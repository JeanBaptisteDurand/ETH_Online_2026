// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice One point on the size-impact curve.
/// @param notionalQuote Notional threshold, in QUOTE base units (USDC, 6dp).
/// @param bps           Spread contribution at or above this notional.
struct SizePoint {
    uint128 notionalQuote;
    uint16 bps;
}

/// @notice Per-pool bounds. Every field here is a BOUND that protects the pool from our own
///         off-chain service misbehaving — never a policy knob. Policy (the spread we actually
///         quote inside `[baseSpreadBps, maxTotalSpreadBps]`, the push cadence, the inventory
///         target) lives off-chain. Owner-set and timelocked.
struct PoolConfig {
    // ── identity ────────────────────────────────────────────────────────────
    bool enabled;
    /// @dev True when currency0 is the QUOTE token (USDC). v4 sorts currencies by address, so
    ///      this differs per pool: wBRL/USDC has USDC as currency0, wARS/USDC has wARS as
    ///      currency0. Every notional normalisation keys off this flag, which is what keeps
    ///      caps configured in one unit (USDC) regardless of ordering.
    bool quoteIsCurrency0;
    /// @dev Kill-switch for exact-output swaps. The delta algebra supports them, but this
    ///      exists so a routing-layer surprise can be shut off without a redeploy.
    bool allowExactOutput;
    // ── staleness ───────────────────────────────────────────────────────────
    /// @dev Seconds after which the price is refused outright. A stale pool stops quoting; it
    ///      never quotes stale.
    uint32 maxAge;
    // ── spread ──────────────────────────────────────────────────────────────
    uint16 baseSpreadBps; // floor, must exceed hedge cost at source (~20 for wBRL)
    uint16 stalenessSlopeBpsPerMin;
    uint16 maxStalenessSpreadBps;
    uint16 maxTotalSpreadBps; // hard ceiling; setConfig requires < BPS
    SizePoint[4] sizeCurve; // monotone non-decreasing in both fields
    // ── price-move bounds ───────────────────────────────────────────────────
    uint16 maxDeviationBps; // largest single push
    uint16 maxWindowMoveBps; // largest CUMULATIVE move per moveWindowLength
    uint32 moveWindowLength; // seconds
    int64 maxAbsSkewBps; // clamp on operator-supplied inventory lean
    // ── notional caps ───────────────────────────────────────────────────────
    uint128 maxSwapAmountQuote; // per swap, QUOTE base units
    uint128 windowCapQuote; // per window, QUOTE base units
    uint32 windowLength; // seconds
}

/// @notice The operator-pushed quote.
/// @param priceQ128 currency1 base-units per ONE currency0 base-unit, Q128. Folding the decimal
///        mismatch (USDC 6, wFiat 18) into this one number means `beforeSwap` does no decimal
///        juggling at all.
/// @param updatedAt Unix seconds of the last push. Zero means never pushed.
/// @param skewBps   Signed inventory lean applied to the mid before the spread.
struct PriceData {
    uint256 priceQ128;
    uint32 updatedAt;
    int64 skewBps;
}

/// @notice Absolute price bounds. `maxDeviationBps` limits ONE push; a compromised operator key
///         simply pushes fifty times. This band is the bound that a walk cannot cross, and
///         widening it is a timelocked governance action — which is exactly the human-review gate
///         a step devaluation should trip.
struct PriceBand {
    uint256 minQ128;
    uint256 maxQ128;
}

/// @notice Immutable ceilings above every owner-tunable bound, fixed at deployment.
///
/// `PoolConfig` fields are bounds on the OPERATOR; nothing in v1 bounded the OWNER, and the live
/// deployment's owner is the same hot key as the operator -- so against the realistic compromise
/// the bounds bounded nothing. These ceilings close that: `setConfig` and `setPriceBand` revert
/// on anything above them, and no owner action, at any later time, can raise them. Tunable policy
/// lives in `PoolConfig`; the credibility lives here. (The pattern is Aqua0's: every governance
/// tunable clamped under an immutable ceiling -- see docs/08.)
///
/// Zero is not "no ceiling": the constructor rejects any zero field. A deployment that wants a
/// loose bound must say the loose number out loud.
struct Ceilings {
    /// @dev Per-swap notional cap ceiling, QUOTE base units.
    uint128 maxSwapAmountQuoteCeil;
    /// @dev Per-window notional cap ceiling, QUOTE base units.
    uint128 windowCapQuoteCeil;
    uint16 maxTotalSpreadBpsCeil;
    uint16 maxDeviationBpsCeil;
    uint16 maxWindowMoveBpsCeil;
    int64 maxAbsSkewBpsCeil;
    /// @dev Half-width of the widest legal price band, in bps of the pool's write-once anchor.
    uint16 maxBandWidthBps;
}

/// @notice A rolling accumulator over `length` seconds. Used for both the notional cap and the
///         cumulative price-move budget.
struct Window {
    uint128 used;
    uint32 startedAt;
}
