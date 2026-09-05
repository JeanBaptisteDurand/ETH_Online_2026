"""One profile per hook family: what the source says, and how to turn it into a predicted bps.

A profile is the only place in TARE where a human read Solidity. Everything it asserts is either

  * a **citation** — a file plus an *anchor string*, resolved to a line number at run time by
    searching the fetched file. An anchor that no longer matches is reported as UNRESOLVED and the
    claim is dropped; a citation in a report is therefore always checkable with one `sed -n`.
  * a **reader** — the public getter the source shows exists, called on chain at the pinned block.
  * a **model** — the arithmetic the source performs, re-implemented here, fed only by the reader.

The predicted bps is produced by that arithmetic on those on-chain values. No model, and no author,
supplies a number: `LP_FEE_V4`, `endFee`, `baseFeeBps`, `clankerFee` are all read, not typed.

Units. Uniswap v4 fees are **pips**: 1_000_000 pips = 100 %, so 10_000 pips = 1 % = 100 bps.
LaunchHook's own config is already in bps (10_000 bps = 100 %). Each profile says which it uses.

Direction. TARE only ever quotes **exact input** (`engine/tare/quote.py`), so every model below is
the exact-input branch and says so.
"""
PIPS = 1_000_000          # v4 fee denominator: 1e6 pips = 100 %
BPS = 10_000

# --------------------------------------------------------------------------------------------
# generic helpers
# --------------------------------------------------------------------------------------------

def ratio_to_bps(ratio: float) -> float:
    """(out_with / out_without) -> the bps TARE would report. Mirrors engine/tare/measure.py."""
    return (1.0 - ratio) * BPS


def lp_fee_ratio(fee_pips: int, stored_lp_fee_pips: int) -> float:
    """Effect on the quote of the hook setting the LP fee to `fee_pips`.

    With the stub in place the hook never calls `updateDynamicLPFee`, so the pool keeps the LP fee
    already in slot0 — which is exactly the `stored_lp_fee` field recorded on every measurement row
    (engine/tare/measure.py). The counterfactual therefore divides the two, it does not assume 0.
    """
    return (PIPS - fee_pips) / (PIPS - stored_lp_fee_pips)


# --------------------------------------------------------------------------------------------
# Clanker / Liquid static-fee family
# --------------------------------------------------------------------------------------------
# Same code, three deployments and one rename (Liquid is a fork with `liquid` for `clanker`).
#   fee selector           StaticFee.sol   `zeroForOne != isToken0 ? pairedFee : clankerFee`
#   protocol fee           HookV2.sol      `protocolFee = lpFee * 200_000 / 1_000_000`  (20 % of it)
#   taken, buying the token  beforeSwap    input is reduced by a scaled protocol fee, minted to the hook
#   taken, selling the token afterSwap     output is reduced by `protocolFee/1e6`, minted to the hook
# Both branches also make the pool charge `fee` as its LP fee for this one swap.

UPSTREAM_PROTOCOL_FEE_NUMERATOR = 200_000     # asserted by a citation on each Clanker profile


def clanker_predict(vals: dict, row: dict) -> dict:
    """Exact-input model for the Clanker/Liquid static-fee hooks.

    The protocol-fee numerator is READ, not assumed. Upstream it is the constant
    `PROTOCOL_FEE_NUMERATOR = 200_000` (20 % of the LP fee); the cc0strategy fork made it an
    immutable set at construction, and that deployment sets it to **zero**. Both are public getters,
    so `declared.py` tries `protocolFeeNumerator()` then `PROTOCOL_FEE_NUMERATOR()` and uses
    whichever answers. Hard-coding 20 % here would have mispriced a whole hook.
    """
    stored = int(row["stored_lp_fee"])
    zero_for_one = bool(row["zero_for_one"])
    is_token0 = vals.get("is_token0")
    numerator = vals.get("protocol_fee_numerator")
    if numerator is None:
        numerator = UPSTREAM_PROTOCOL_FEE_NUMERATOR
        numerator_source = "source constant (no public getter answered)"
    else:
        numerator = int(numerator)
        numerator_source = "read on chain at the measured block"
    branches = []
    if is_token0 is None:
        candidates = [True, False]          # v1 keeps the selector `internal`; both branches priced
    else:
        candidates = [bool(is_token0)]
    for tok0 in candidates:
        swapping_for_token = (zero_for_one != tok0)
        fee = int(vals["paired_fee"]) if swapping_for_token else int(vals["token_fee"])
        protocol_fee = fee * numerator // PIPS
        lp = lp_fee_ratio(fee, stored)
        if swapping_for_token:
            # beforeSwap: input shaved by protocolFee/(1e6+protocolFee), then the LP swap runs.
            scaled = protocol_fee * 10**18 // (PIPS + protocol_fee) if protocol_fee else 0
            ratio = (1.0 - scaled / 10**18) * lp
            side = "input"
        else:
            # afterSwap: the LP swap runs, then protocolFee/1e6 of the output is taken.
            ratio = lp * (1.0 - protocol_fee / PIPS)
            side = "output"
        branches.append({"is_token0": tok0, "fee_pips": fee, "protocol_fee_pips": protocol_fee,
                         "protocol_fee_numerator": numerator,
                         "numerator_source": numerator_source,
                         "stored_lp_fee_pips": stored,
                         "taken_at": "beforeSwap" if swapping_for_token else "afterSwap",
                         "side": side,
                         "predicted_bps": round(ratio_to_bps(ratio), 4)})
    if len(branches) == 1:
        b = branches[0]
        return {"predicted_bps": b["predicted_bps"], "detail": b, "side": b["side"],
                "declared_summary": (f"LP {b['fee_pips']} pips"
                                     + (f" + carve {b['protocol_fee_pips']} pips"
                                        if b['protocol_fee_pips'] else " + carve 0")
                                     + (f" (pool already at {stored} pips)" if stored else "")),
                "note": f"LP fee {b['fee_pips']} pips against a stored {stored} pips, plus a "
                        f"protocol carve of {b['protocol_fee_pips']} pips "
                        f"({numerator} / 1e6 of the LP fee, {numerator_source}), taken in "
                        f"{b['taken_at']}"}
    lo = min(b["predicted_bps"] for b in branches)
    hi = max(b["predicted_bps"] for b in branches)
    sides = {b["side"] for b in branches}
    return {"predicted_bps": None, "predicted_bps_range": [lo, hi], "detail": branches,
            "side": sides.pop() if len(sides) == 1 else "unknown",
            "declared_summary": f"LP {branches[0]['fee_pips']} pips + carve "
                                f"{branches[0]['protocol_fee_pips']} pips",
            "note": "the token0/token1 selector is `internal` in this version, so both directional "
                    "branches are priced and the prediction is the interval between them"}


PROTOCOL_FEE_NUMERATOR_READ = {
    "name": "protocol_fee_numerator", "to": "hook",
    "sigs": ["protocolFeeNumerator()", "PROTOCOL_FEE_NUMERATOR()"],
    "sig": "PROTOCOL_FEE_NUMERATOR()", "arg": "none", "type": "uint",
    "optional": True, "fallback": None,
}


CLANKER_V2 = {
    "key": "clanker_static_v2",
    "hooks": ["0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
              "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc"],
    "contract": "ClankerHookStaticFeeV2",
    "taken_where": "beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), "
                   "plus the pool's LP fee set for the swap",
    "announced": "yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in "
                 "`PoolInitialized`, and capped by a public constant",
    "modifiable": "the per-pool fees are written once at pool initialization by the factory; the "
                  "protocol-fee share is a public constant in the bytecode",
    "rate_unit": "pips (1e6 = 100 %)",
    "read": [
        {"name": "token_fee", "to": "hook", "sig": "clankerFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "paired_fee", "to": "hook", "sig": "pairedFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "is_token0", "to": "hook", "sig": "clankerIsToken0(bytes32)", "arg": "pool_id",
         "type": "bool", "optional": True},
        PROTOCOL_FEE_NUMERATOR_READ,
    ],
    "predict": clanker_predict,
    "citations": [
        {"claim": "the per-swap LP fee is a per-pool stored value, chosen by direction",
         "file": "src/hooks/ClankerHookStaticFeeV2.sol",
         "anchor": "? pairedFee[poolKey.toId()]"},
        {"claim": "that value is also pushed into the pool as a dynamic LP fee",
         "file": "src/hooks/ClankerHookStaticFeeV2.sol",
         "anchor": "updateDynamicLPFee(poolKey, fee)"},
        {"claim": "the hook's own cut is 20 % of that LP fee",
         "file": "src/hooks/ClankerHookV2.sol", "anchor": "PROTOCOL_FEE_NUMERATOR = 200_000"},
        {"claim": "and is computed from it, not configured separately",
         "file": "src/hooks/ClankerHookV2.sol",
         "anchor": "protocolFee = uint24(uint256(lpFee) * PROTOCOL_FEE_NUMERATOR"},
        {"claim": "buying the token, the cut is taken in beforeSwap by shrinking the input",
         "file": "src/hooks/ClankerHookV2.sol",
         "anchor": "uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee)"},
        {"claim": "selling the token, it is taken in afterSwap out of the output",
         "file": "src/hooks/ClankerHookV2.sol",
         "anchor": "unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR"},
        {"claim": "the per-pool fees are public and readable by anyone",
         "file": "src/hooks/ClankerHookStaticFeeV2.sol", "anchor": "mapping(PoolId => uint24) public clankerFee"},
        {"claim": "they are announced in an event at pool creation",
         "file": "src/hooks/ClankerHookStaticFeeV2.sol", "anchor": "emit PoolInitialized"},
        {"claim": "and hard-capped at 10 % by a public constant",
         "file": "src/hooks/ClankerHookV2.sol", "anchor": "MAX_LP_FEE = 100_000"},
        {"claim": "a MEV module may raise the fee for the first swaps of a pool's life",
         "file": "src/hooks/ClankerHookV2.sol", "anchor": "MAX_MEV_LP_FEE = 800_000"},
        {"claim": "one deployment in this corpus is a fork where the 20 % carve is a "
                  "per-deployment immutable instead of a constant",
         "file": "src/hooks/ClankerHookV2.sol", "anchor": "uint256 public immutable protocolFeeNumerator",
         "optional": True},
    ],
}

CLANKER_V1 = {
    "key": "clanker_static_v1",
    "hooks": ["0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc"],
    "contract": "ClankerHookStaticFee",
    "taken_where": "beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), "
                   "plus the pool's LP fee set for the swap",
    "announced": "yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in "
                 "`PoolInitialized`; the direction selector is not public in this version",
    "modifiable": "written once at pool initialization by the factory; the protocol-fee share is a "
                  "public constant in the bytecode",
    "rate_unit": "pips (1e6 = 100 %)",
    "read": [
        {"name": "token_fee", "to": "hook", "sig": "clankerFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "paired_fee", "to": "hook", "sig": "pairedFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "is_token0", "to": "hook", "sig": "clankerIsToken0(bytes32)", "arg": "pool_id",
         "type": "bool", "optional": True},
        PROTOCOL_FEE_NUMERATOR_READ,
    ],
    "predict": clanker_predict,
    "citations": [
        {"claim": "the per-swap LP fee is a per-pool stored value, chosen by direction",
         "file": "src/hooks/ClankerHookStaticFee.sol", "anchor": "? pairedFee[poolKey.toId()]"},
        {"claim": "the per-pool fees are public and readable by anyone",
         "file": "src/hooks/ClankerHookStaticFee.sol", "anchor": "mapping(PoolId => uint24) public clankerFee"},
        {"claim": "the direction selector is internal in v1, so the branch cannot be read on chain",
         "file": "src/hooks/ClankerHook.sol", "anchor": "mapping(PoolId => bool) internal clankerIsToken0"},
        {"claim": "the hook's own cut is 20 % of the LP fee",
         "file": "src/hooks/ClankerHook.sol", "anchor": "PROTOCOL_FEE_NUMERATOR = 200_000"},
        {"claim": "capped at 30 % in v1 (10 % in v2)",
         "file": "src/hooks/ClankerHook.sol", "anchor": "MAX_LP_FEE = 300_000"},
    ],
}

LIQUID_V2 = {
    "key": "liquid_static_v2",
    "hooks": ["0x9811f10cd549c754fa9e5785989c422a762c28cc"],
    "contract": "LiquidHookStaticFeeV2",
    "taken_where": "beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), "
                   "plus the pool's LP fee set for the swap",
    "announced": "yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in "
                 "`PoolInitialized`, capped by a public constant",
    "modifiable": "written once at pool initialization by the factory; the protocol-fee share is a "
                  "public constant in the bytecode",
    "rate_unit": "pips (1e6 = 100 %)",
    "read": [
        {"name": "token_fee", "to": "hook", "sig": "liquidFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "paired_fee", "to": "hook", "sig": "pairedFee(bytes32)", "arg": "pool_id", "type": "uint"},
        {"name": "is_token0", "to": "hook", "sig": "liquidIsToken0(bytes32)", "arg": "pool_id",
         "type": "bool", "optional": True},
        PROTOCOL_FEE_NUMERATOR_READ,
    ],
    "predict": clanker_predict,
    "citations": [
        {"claim": "the per-swap LP fee is a per-pool stored value, chosen by direction",
         "file": "src/hooks/LiquidHookStaticFeeV2.sol", "anchor": "? pairedFee[poolKey.toId()]"},
        {"claim": "the per-pool fees are public and readable by anyone",
         "file": "src/hooks/LiquidHookStaticFeeV2.sol", "anchor": "mapping(PoolId => uint24) public liquidFee"},
        {"claim": "the hook's own cut is 20 % of the LP fee",
         "file": "src/hooks/LiquidHookV2.sol", "anchor": "PROTOCOL_FEE_NUMERATOR = 200_000"},
        {"claim": "the direction selector is public here",
         "file": "src/hooks/LiquidHookV2.sol", "anchor": "mapping(PoolId => bool) public liquidIsToken0"},
    ],
}


# --------------------------------------------------------------------------------------------
# Zora coin hook
# --------------------------------------------------------------------------------------------
# The rate is a *constant in the bytecode*, not a stored value, so there is nothing to read on
# chain: the source itself is the declaration. `_beforeSwap` returns `OVERRIDE_FEE_FLAG | fee` and
# the pool charges it for that one swap.

ZORA_LP_FEE_PIPS = 10_000        # CoinConstants.sol — value asserted by a citation below


def zora_predict(vals: dict, row: dict) -> dict:
    stored = int(row["stored_lp_fee"])
    fee = int(vals["lp_fee_pips"])
    ratio = lp_fee_ratio(fee, stored)
    return {"predicted_bps": round(ratio_to_bps(ratio), 4), "side": "input",
            "declared_summary": f"LP_FEE_V4 = {fee} pips (constant)",
            "detail": {"fee_pips": fee, "stored_lp_fee_pips": stored,
                       "taken_at": "beforeSwap (dynamic-fee override)", "side": "input"},
            "note": "steady-state fee; the first 10 seconds after a coin is created carry a "
                    "decaying launch fee that starts at 99 %"}


ZORA = {
    "key": "zora_coin",
    "hooks": ["0x0469a4bd3724dc86c9542f4694c976da13c450c0"],
    "contract": "ZoraV4CoinHook",
    "taken_where": "beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager "
                   "charges the hook's number as the LP fee for that swap",
    "announced": "yes — a named constant with a NatSpec comment saying 1 %, and the decay window "
                 "is documented in the same file",
    "modifiable": "no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy "
                  "through the upgrade gate can change it",
    "rate_unit": "pips (1e6 = 100 %)",
    "read": [],
    "constants": {"lp_fee_pips": ZORA_LP_FEE_PIPS},
    "predict": zora_predict,
    "citations": [
        {"claim": "the steady-state fee is a constant equal to 10 000 pips = 1 % = 100 bps",
         "file": "node_modules/@zoralabs/coins/src/libs/CoinConstants.sol",
         "anchor": "LP_FEE_V4 = 10_000", "asserts_value": ZORA_LP_FEE_PIPS},
        {"claim": "beforeSwap returns that fee with the override flag",
         "file": "node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol",
         "anchor": "return (BaseHook.beforeSwap.selector, BeforeSwapDelta.wrap(0), fee)"},
        {"claim": "the override flag makes the pool charge it instead of its stored LP fee",
         "file": "node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol",
         "anchor": "CoinConstants.OVERRIDE_FEE_FLAG | CoinConstants.LP_FEE_V4"},
        {"claim": "for the first 10 seconds of a coin's life the fee starts at 99 % and decays",
         "file": "node_modules/@zoralabs/coins/src/libs/CoinConstants.sol",
         "anchor": "LAUNCH_FEE_START = 990_000"},
        {"claim": "the decay window is 10 seconds",
         "file": "node_modules/@zoralabs/coins/src/libs/CoinConstants.sol",
         "anchor": "LAUNCH_FEE_DURATION = 10 seconds"},
        {"claim": "trend coins settle at 100 pips = 1 bps instead",
         "file": "node_modules/@zoralabs/coins/src/libs/CoinConstants.sol",
         "anchor": "TREND_LP_FEE_V4 = 100"},
        {"claim": "the hook itself returns no swap delta — it collects LP fees from its own positions",
         "file": "node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol",
         "anchor": "beforeSwapReturnDelta: false"},
    ],
}


# --------------------------------------------------------------------------------------------
# B20 LaunchHook
# --------------------------------------------------------------------------------------------
# The rate is per-pool state, frozen at launch, and the whole config struct is a public mapping —
# so the number the hook will charge is readable by anyone, before swapping.

def launchhook_predict(vals: dict, row: dict) -> dict:
    """Exact-input model for LaunchHook. Field names come from the struct parsed out of the source."""
    cfg = vals["pool_config"]
    if not cfg["initialized"]:
        return {"predicted_bps": 0.0, "side": "none",
                "declared_summary": "pool not registered (initialized = false)",
                "detail": {"initialized": False},
                "note": "the pool is not registered with this hook, so both swap callbacks return "
                        "a zero delta on their first line — the code predicts exactly nothing taken"}
    block_ts = int(vals["block_timestamp"])
    base = int(cfg["baseFeeBps"])
    window = int(cfg["antiSnipeWindowSeconds"])
    start_total = int(cfg["antiSnipeStartTotalBps"])
    launch = int(cfg["launchTime"])
    elapsed = block_ts - launch
    if window == 0 or elapsed >= window:
        total = base
        phase = "steady state (anti-snipe window closed)"
    else:
        surcharge = (start_total - base) * (window - elapsed) // window
        total = min(base + surcharge, 9_900)
        phase = f"anti-snipe window open, {window - elapsed}s left"
    # Which side the fee lands on decides whether the pool's own price response can hide it.
    # quoteCurrency = tokenIsCurrency0 ? currency1 : currency0 ; exact input specifies currency0
    # when zeroForOne. If the quote currency IS the specified one, beforeSwap shaves the input.
    quote_is_currency0 = not bool(cfg["tokenIsCurrency0"])
    specified_is_currency0 = bool(row["zero_for_one"])
    side = "input" if quote_is_currency0 == specified_is_currency0 else "output"
    return {"predicted_bps": float(total), "side": side,
            "declared_summary": f"baseFeeBps = {base}" + ("" if total == base else f" -> total {total}"),
            "detail": {"base_fee_bps": base, "total_fee_bps": total, "elapsed_s": elapsed,
                       "window_s": window, "token_is_currency0": bool(cfg["tokenIsCurrency0"]),
                       "taken_at": "beforeSwap" if side == "input" else "afterSwap",
                       "side": side},
            "note": phase}


LAUNCHHOOK = {
    "key": "launchhook",
    "hooks": ["0x985c14baa2a18316ffda0aefb3a632fadfca2acc",
              "0x3b2b979df21036cee51b8debb13100e2cb8deacc",
              "0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc"],
    "contract": "LaunchHook",
    "taken_where": "beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on "
                   "the input, minted to a FeeEscrow), otherwise afterSwap on the output",
    "announced": "yes — the whole per-pool config is a public mapping, a `PoolRegistered` event "
                 "carries the fee, every swap emits `Trade` with the amount, and two public "
                 "constants cap it",
    "modifiable": "no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a "
                  "config, and there is no setter; the config is frozen at launch",
    "rate_unit": "bps (10 000 = 100 %)",
    "read": [
        {"name": "pool_config", "to": "hook", "sig": "poolConfig(bytes32)", "arg": "pool_id",
         "type": "struct", "struct": {"file": "src/LaunchHook.sol", "name": "PoolConfig"}},
    ],
    "needs_block_timestamp": True,
    "predict": launchhook_predict,
    "citations": [
        {"claim": "the fee is per-pool state, not a constant",
         "file": "src/LaunchHook.sol", "anchor": "uint16 baseFeeBps; // split creator/platform/referrer"},
        {"claim": "and the whole config is publicly readable",
         "file": "src/LaunchHook.sol", "anchor": "mapping(PoolId => PoolConfig) public poolConfig"},
        {"claim": "an unregistered pool is charged nothing — first line of beforeSwap",
         "file": "src/LaunchHook.sol",
         "anchor": "if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0)"},
        {"claim": "the fee is taken in beforeSwap by minting a claim to the escrow",
         "file": "src/LaunchHook.sol", "anchor": "poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee)"},
        {"claim": "and returned as a BeforeSwapDelta on the specified side",
         "file": "src/LaunchHook.sol", "anchor": "toBeforeSwapDelta(totalFee.toInt128(), 0)"},
        {"claim": "otherwise it is taken in afterSwap out of the unspecified side",
         "file": "src/LaunchHook.sol", "anchor": "return (IHooks.afterSwap.selector, totalFee.toInt128())"},
        {"claim": "the total decays from an anti-snipe surcharge down to the base fee",
         "file": "src/LaunchHook.sol", "anchor": "uint256 surcharge = maxSurcharge *"},
        {"claim": "the admin-settable base fee is capped at 10 %",
         "file": "src/LaunchHook.sol", "anchor": "MAX_BASE_FEE_BPS = 1_000"},
        {"claim": "the total per-swap fee is capped strictly below 100 %",
         "file": "src/LaunchHook.sol", "anchor": "MAX_TOTAL_FEE_BPS = 9_900"},
        {"claim": "a pool's config can never be rewritten",
         "file": "src/LaunchHook.sol", "anchor": "if (poolConfig[id].initialized) revert AlreadyRegistered()"},
        {"claim": "every swap emits the fee actually taken",
         "file": "src/LaunchHook.sol", "anchor": "emit Trade(id, sender,"},
    ],
}


# --------------------------------------------------------------------------------------------
# Doppler multicurve initializer + its per-pool Doppler hook
# --------------------------------------------------------------------------------------------
# The hook named in the PoolKey does **not** contain the rate. It calls out to a per-pool
# `dopplerHook` contract, and *that* contract holds a public, decaying fee schedule. The reader
# below therefore resolves the delegate on chain first, then reads its schedule.

def doppler_predict(vals: dict, row: dict) -> dict:
    sched = vals.get("fee_schedule")
    if sched is None:
        return {"predicted_bps": None, "detail": {},
                "note": "the delegate hook that holds the rate could not be resolved for this pool"}
    block_ts = int(vals["block_timestamp"])
    start_fee, end_fee = int(sched["start_fee"]), int(sched["end_fee"])
    last_fee, dur, t0 = int(sched["last_fee"]), int(sched["duration_seconds"]), int(sched["starting_time"])
    if start_fee == end_fee or dur == 0:
        cur, why = start_fee, "flat schedule"
    elif last_fee == end_fee:
        cur, why = end_fee, "already fully decayed"
    elif block_ts <= t0:
        cur, why = start_fee, "before the schedule starts"
    elif block_ts - t0 >= dur:
        cur, why = end_fee, f"decay finished {block_ts - t0 - dur}s before the measured block"
    else:
        cur = start_fee - (start_fee - end_fee) * (block_ts - t0) // dur
        why = "mid-decay"
    # Exact input: the fee is taken out of the output, in the unspecified currency.
    return {"predicted_bps": round(cur / 100.0, 4), "side": "output",
            "declared_summary": f"endFee = {end_fee} pips" if cur == end_fee else f"fee = {cur} pips",
            "detail": {"current_fee_pips": cur, "side": "output", "start_fee_pips": start_fee,
                       "end_fee_pips": end_fee, "duration_s": dur,
                       "delegate": vals.get("delegate"), "taken_at": "afterSwap"},
            "note": why}


DOPPLER = {
    "key": "doppler_multicurve",
    "hooks": ["0xbdf938149ac6a781f94faa0ed45e6a0e984c6544"],
    "contract": "DopplerHookInitializer",
    "taken_where": "afterSwap — the initializer asks a per-pool delegate for an amount, takes it "
                   "from the PoolManager and returns it as the unspecified delta",
    "announced": "in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and "
                 "a duration. In the hook the PoolKey names, no: the rate is not there at all",
    "modifiable": "the delegate can push a new dynamic LP fee at any time, capped at 10 %; the "
                  "schedule itself is written at pool initialization",
    "rate_unit": "pips (1e6 = 100 %)",
    "read": [
        {"name": "delegate", "to": "hook", "sig": "getState(address)", "arg": "currency_probe",
         "type": "doppler_state"},
        {"name": "fee_schedule", "to": "delegate", "sig": "getFeeSchedule(bytes32)", "arg": "pool_id",
         "type": "doppler_schedule"},
    ],
    "needs_block_timestamp": True,
    "predict": doppler_predict,
    "citations": [
        {"claim": "the initializer takes nothing of its own: it asks a per-pool delegate",
         "file": "src/initializers/DopplerHookInitializer.sol",
         "anchor": "IDopplerHook(dopplerHook).onSwap(sender, key, params, balanceDelta, data)"},
        {"claim": "and returns whatever the delegate asked for as the afterSwap delta",
         "file": "src/initializers/DopplerHookInitializer.sol",
         "anchor": "poolManager.take(feeCurrency, address(this), uint128(delta))"},
        {"claim": "the delegate address is per pool and publicly readable",
         "file": "src/initializers/DopplerHookInitializer.sol",
         "anchor": "mapping(address asset => PoolState state) public getState"},
        {"claim": "only that delegate may move the pool's LP fee, and only up to 10 %",
         "file": "src/initializers/DopplerHookInitializer.sol",
         "anchor": "require(lpFee <= MAX_LP_FEE, LPFeeTooHigh(MAX_LP_FEE, lpFee))"},
        {"claim": "MAX_LP_FEE is 100 000 pips = 10 %",
         "file": "src/initializers/DopplerHookInitializer.sol", "anchor": "MAX_LP_FEE = 100_000"},
    ],
    "delegate_citations": [
        {"claim": "the delegate's fee schedule is a public mapping",
         "file": "src/dopplerHooks/RehypeDopplerHookInitializer.sol",
         "anchor": "mapping(PoolId poolId => FeeSchedule feeSchedule) public getFeeSchedule"},
        {"claim": "the fee decays linearly from startFee to endFee over durationSeconds",
         "file": "src/dopplerHooks/RehypeDopplerHookInitializer.sol",
         "anchor": "uint256 feeDelta_ = feeRange * elapsed / schedule.durationSeconds"},
        {"claim": "on exact input the fee is taken out of the output",
         "file": "src/dopplerHooks/RehypeDopplerHookInitializer.sol",
         "anchor": "feeBase = uint256(outputAmount)"},
        {"claim": "at currentFee / 1e6 of it",
         "file": "src/dopplerHooks/RehypeDopplerHookInitializer.sol",
         "anchor": "FullMath.mulDiv(feeBase, currentFee, SWAP_FEE_DENOMINATOR)"},
        {"claim": "the denominator is 1e6, so the schedule is in pips",
         "file": "src/types/RehypeTypes.sol", "anchor": "SWAP_FEE_DENOMINATOR = 1e6"},
        {"claim": "5 % of every fee is routed to the Airlock owner",
         "file": "src/types/RehypeTypes.sol", "anchor": "AIRLOCK_OWNER_FEE_BPS = 500"},
        {"claim": "and the swap fee is capped at 80 %",
         "file": "src/types/RehypeTypes.sol", "anchor": "MAX_SWAP_FEE = 0.8e6"},
    ],
}


# --------------------------------------------------------------------------------------------
# Hooks with a source but no swap-path take at all
# --------------------------------------------------------------------------------------------

def zero_predict(vals: dict, row: dict) -> dict:
    return {"predicted_bps": 0.0, "side": "none", "detail": {"swap_callbacks": 0},
            "declared_summary": "no swap callback exists",
            "note": "no swap callback exists in the code, so the code predicts a swap is untouched"}


SATO = {
    "key": "sato_init_guard",
    "hooks": ["0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000"],
    "contract": "SatoInitGuardHook",
    "taken_where": "nowhere — the contract implements `beforeInitialize` and nothing else",
    "announced": "not applicable: there is no fee to announce",
    "modifiable": "no — no owner, no setter, no storage; both fields are immutable",
    "rate_unit": "n/a",
    "read": [],
    "predict": zero_predict,
    "citations": [
        {"claim": "exactly one permission bit, and it is not a swap bit",
         "file": "src/modela/SatoInitGuardHook.sol", "anchor": "BEFORE_INITIALIZE_FLAG = uint160(1 << 13)"},
        {"claim": "the address itself is checked to carry only that bit",
         "file": "src/modela/SatoInitGuardHook.sol",
         "anchor": "if (uint160(address(this)) & ALL_HOOK_MASK != BEFORE_INITIALIZE_FLAG) revert BadHookAddress()"},
        {"claim": "the only external entry point is beforeInitialize",
         "file": "src/modela/SatoInitGuardHook.sol",
         "anchor": "function beforeInitialize(address sender, PoolKey calldata poolKey, uint160 sqrtPriceX96)"},
        {"claim": "and it is `view` — it cannot move value",
         "file": "src/modela/SatoInitGuardHook.sol", "anchor": "return SatoInitGuardHook.beforeInitialize.selector"},
    ],
}


# --------------------------------------------------------------------------------------------
# Custom-accounting hook: source read, but outside what the counterfactual can measure
# --------------------------------------------------------------------------------------------

DECAY_MULTICURVE = {
    "key": "decay_multicurve",
    "hooks": ["0xbb7784a4d481184283ed89619a3e3ed143e1adc0"],
    "contract": "DecayMulticurveInitializerHook",
    "taken_where": "beforeSwap — the hook rewrites the pool's liquidity distribution before the "
                   "swap runs, which is why removing its bytecode removes the venue rather than a fee",
    "announced": "there is no per-swap rate to announce; the fee split is beneficiary shares",
    "modifiable": "the curve decay is driven by time and by the initializer's own state",
    "rate_unit": "n/a",
    "read": [],
    "predict": None,          # no MEASURED row exists for this hook — see LIMITS.md §4
    "citations": [
        {"claim": "the hook rebalances liquidity inside beforeSwap",
         "file": "src/initializers/DecayMulticurveInitializerHook.sol", "anchor": "_beforeSwap"},
        {"claim": "which is the custom-accounting class the stub counterfactual cannot price",
         "file": "src/initializers/DecayMulticurveInitializer.sol", "anchor": "contract DecayMulticurveInitializer"},
    ],
}


ALL_PROFILES = [CLANKER_V2, CLANKER_V1, LIQUID_V2, ZORA, LAUNCHHOOK, DOPPLER, SATO, DECAY_MULTICURVE]

BY_HOOK = {addr.lower(): prof for prof in ALL_PROFILES for addr in prof["hooks"]}


def profile_for(address: str):
    return BY_HOOK.get(address.lower())
