// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

uint256 constant WAD = 1e18;
uint256 constant PIPS_DENOMINATOR = 1_000_000;

// Risk constants (compile-time) shared across engine modules:

uint32 constant TWAP_WINDOW_SECONDS = 30 minutes;

// Minimum active oracle cardinality required to durably serve consult(TWAP_WINDOW_SECONDS).
// With 1-second worst-case blocks (Aegis targets Unichain), a ring of N slots writing once per
// block holds at most N-1 seconds of history after wraparound. Therefore TWAP_WINDOW_SECONDS + 1
// slots guarantee the oldest stored observation is always >= TWAP_WINDOW_SECONDS old, even under
// continuous adversarial overwrites. Future deployments on chains with sub-1s blocktimes must
// raise this floor.
// Cast to uint16 is safe: TWAP_WINDOW_SECONDS = 1800, well below uint16 max (65535).
// forge-lint: disable-next-line(unsafe-typecast)
uint16 constant MIN_CARDINALITY_FOR_TWAP = uint16(TWAP_WINDOW_SECONDS) + 1;
uint256 constant UTILIZATION_CAP_PIPS = 950_000; // 95%
uint256 constant MAX_RATE_PER_SECOND_WAD = 31_688_730_000; // ~100% APR cap (based on 365.24-day year, simple interest)
int24 constant N_TICKS = 5;

uint24 constant MAX_TICK_DEVIATION = 25;
uint24 constant EMERGENCY_TICK_DEVIATION = 250; // 10x normal; for critically unhealthy vaults (LTV >= hardLtvPips)
uint32 constant PEEL_BOUNTY_PIPS = 100; // 0.01%
// Conservative haircut for micro‑liquidation swap sizing at tick‑limit.
// 2% total: covers pool fee (≤ 1%) and keeper fee budget (≤ 1%) with a single haircut.
uint32 constant MICRO_LIQ_CONSERVATIVE_HAIRCUT_PIPS = 20_000; // 2%

// Per-market micro-liquidation LTV thresholds (computed from pool fee at market init)
// Oracle + price band buffer: covers 25-tick normal TWAP deviation + 5-tick swap limit + safety margin
// NOTE: emergency path (EMERGENCY_TICK_DEVIATION = 250) for critically unhealthy vaults exceeds this budget;
// acceptable because the alternative is complete liquidation lockout (TOB-AEGIS-13).
uint24 constant MICRO_LIQ_ORACLE_BUFFER_PIPS = 4_000; // 0.4%
// Minimum LTV ramp width to avoid pathological narrow ramps in low-fee pools
uint24 constant MICRO_LIQ_MIN_RAMP_WIDTH_PIPS = 1_000; // 0.1% (10 bps)
// Maximum swap fee used for LTV threshold calculation (for static fee pools)
uint24 constant MICRO_LIQ_MAX_SWAP_FEE_PIPS = 10_000; // 1.0%
// Maximum keeper fee at per-market hardLtvPips
uint32 constant MICRO_LIQ_FEE_MAX_PIPS = 10_000; // 1%
// Maximum allowed hardLtvPips to ensure safety margin for oracle deviations
uint24 constant MAX_HARD_LTV_PIPS = 998_000; // 99.8%
// Maximum v4 pool swap fee charged when AegisEngine is the sender (micro-liquidations).
// Provides favorable swap terms for protocol-initiated liquidations. Note: the hook fee
// configured per-pool via `AegisHook.setHookFeePpm` may stack on top of this capped pool
// fee — see `AegisHook._beforeSwap` for the rationale and the worst-case all-in math.
uint24 constant ENGINE_MAX_SWAP_FEE_PIPS = 1_000; // 0.1%

uint128 constant MIN_LIQUIDITY = 1_000; // to mint or allowable for NFT attaches

// Permanent holder for the MIN_LIQUIDITY shares locked on the first deposit to each market.
address constant DEAD_SHARES_HOLDER = address(0xdead);

uint8 constant MAX_NFTS_PER_VAULT = 4;
