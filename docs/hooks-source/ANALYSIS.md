# ANALYSIS — what the hooks' own code says, and what the instrument measured

[`LIMITS.md`](../LIMITS.md) §6(c) said, in as many words: **"We have not read a single line of any hook's source. Not one."** This file is the answer to that sentence. It does not replace LIMITS.md — it closes one paragraph of it and opens several new ones (§5 below).

Three separable, replayable steps:

```bash
cd engine
python3 -m tare.source.cli fetch                            # Sourcify -> docs/hooks-source/<addr>/
python3 -m tare.source.cli analyze --rpc "$BASE_RPC_URL"    # read each declared rate on chain
python3 -m tare.source.cli report                           # write this file
```

**No model produced a number in this file.** The rates in the *"rate in the code"* column were read by `eth_call`  at block **50 614 000** — the corpus block — through the public getter the source shows exists, or they are constants cited line by line. The *concordance* column is a subtraction.

| input | value |
|---|---|
| corpus | `docs/dataset/measurements.jsonl` |
| corpus rows | 4005 |
| corpus sha256 | `1b7c90ee532594b872b32c7860292e1a2d521111496958750c1440ff3fb74e7c` |
| chain | 8453 (Base) |
| block | 50614000 |
| agreement tolerance | ±0.5 bps |

## 1. Source coverage

**14 of 16** measured hooks have a verified source. **2 of 16** does not, and is treated accordingly (§4).

| hook | registry name | source | provider | match | verified at | own files | own lines |
|---|---|---|---|---|---|---|---|
| `0x0469a4bd3724dc86c9542f4694c976da13c450c0` | Zora Hook | yes | sourcify | match | 2026-03-23 | 30 | 2771 |
| `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` | ClankerHookStaticFeeV2 | yes | sourcify | match | 2026-06-18 | 12 | 1306 |
| `0x201c4916c085032fb49f0b778efa98df23672044` | AdvancedFeeHookV5 | yes | sourcify | match | 2026-08-27 | 2 | 567 |
| `0x3b2b979df21036cee51b8debb13100e2cb8deacc` | LaunchHook | yes | sourcify | exact_match | 2026-08-18 | 3 | 730 |
| `0x4951d0e1cfb915f64ab19aed153bd6305a244088` | Vvveity Fee Hook V2 | yes | sourcify | exact_match | 2026-08-21 | 1 | 276 |
| `0x6e4e217ac96721cb12c9ba66e68090a098102acc` | — | **no** | sourcify | — | — | — | — |
| `0x9811f10cd549c754fa9e5785989c422a762c28cc` | LiquidHookStaticFeeV2 | yes | sourcify | match | 2026-03-25 | 12 | 1311 |
| `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` | LaunchHook | yes | sourcify | exact_match | 2026-07-10 | 3 | 730 |
| `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` | Clanker Static Fee Hook v2 (Base) | yes | sourcify | match | 2025-09-16 | 12 | 1283 |
| `0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088` | — | **no** | sourcify | — | — | — | — |
| `0xba83ee6969d09ceb8a4827c3ed77413c75392044` | AdvancedFeeHookV5 | yes | sourcify | match | 2026-09-01 | 2 | 567 |
| `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` | DecayMulticurveInitializerHook | yes | sourcify | match | 2026-02-12 | 18 | 2424 |
| `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` | DopplerHookInitializer | yes | sourcify | match | 2026-03-24 | 18 | 2589 |
| `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` | — | yes | sourcify | exact_match | 2026-08-23 | 2 | 204 |
| `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` | Clanker Static Fee Hook (Base) | yes | sourcify | match | 2025-08-14 | 9 | 995 |
| `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` | LaunchHook | yes | sourcify | exact_match | 2026-08-27 | 4 | 1042 |

Provider: [Sourcify v2](https://sourcify.dev), `/v2/contract/8453/<address>?fields=sources`. Every file returned is stored under `docs/hooks-source/<address>/sources/` and hashed in `provenance.json`; "own files" counts the ones that are not a vendored copy of OpenZeppelin, v4-core, Solady and friends (`engine/tare/source/fetch.py`, `VENDOR_SEGMENTS`).

The Etherscan v2 fallback exists in `fetch.py` and **could not be asked**: no `ETHERSCAN_API_KEY` is configured in this environment. That is recorded as `UNAVAILABLE` in each `provenance.json`, never as `NOT_FOUND`. A provider we could not reach is not evidence about a contract — honesty rule 3, and the reason [`HONESTY.md`](../HONESTY.md) exists at all.

## 2. Hook by hook

| hook | measured bps (median) | rate in the code | concordance | where is it taken | announced | modifiable | source |
|---|---|---|---|---|---|---|---|
| `0x0469a4bd…` Zora Hook | 100 | `LP_FEE_V4 = 10000 pips (constant)` ×157 | **concordant**, 156/157 pools, max gap 0.0203 bps | beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager charges the hook's number as the LP fee for that swap | yes — a named constant with a NatSpec comment saying 1 %, and the decay window is documented in the same file | no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy through the upgrade gate can change it | yes |
| `0x1aea38f0…` ClankerHookStaticFeeV2 | 253.3141 | `LP 10000 pips + carve 0` ×1<br>`LP 69000 pips + carve 0` ×1 | **concordant**, 2/2 pools, max gap 0.0481 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0x201c4916…` AdvancedFeeHookV5 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0x3b2b979d…` LaunchHook | 0 | `baseFeeBps = 100` ×4 | **not resolvable**, 0/4 pools, max gap — bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |
| `0x4951d0e1…` Vvveity Fee Hook V2 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0x6e4e217a…`  | 99.9891 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x9811f10c…` LiquidHookStaticFeeV2 | 19.9361 | `LP 10000 pips + carve 2000 pips (pool already at 10000 pips)` ×4 | **concordant**, 4/4 pools, max gap 0.03 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, capped by a public constant | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0x985c14ba…` LaunchHook | 99.559 | `baseFeeBps = 100` ×25 | **concordant**, 25/25 pools, max gap 0.0044 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |
| `0xb429d62f…` Clanker Static Fee Hook v2 (Base) | 114.004 | `LP 10000 pips + carve 2000 pips` ×15<br>`LP 30000 pips + carve 6000 pips (pool already at 30000 pips)` ×8<br>`LP 100000 pips + carve 20000 pips` ×3<br>+4 more | **partial**, 28/30 pools, max gap 2.2904 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0xb995b9ef…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xba83ee69…` AdvancedFeeHookV5 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0xbb7784a4…` DecayMulticurveInitializerHook | — | — | **not measurable** | beforeSwap — the hook rewrites the pool's liquidity distribution before the swap runs, which is why removing its bytecode removes the venue rather than a fee | there is no per-swap rate to announce; the fee split is beneficiary shares | the curve decay is driven by time and by the initializer's own state | yes |
| `0xbdf93814…` DopplerHookInitializer | 105 | `endFee = 10500 pips` ×60<br>`endFee = 17500 pips` ×10<br>`endFee = 15000 pips` ×8<br>+1 more | **partial**, 78/79 pools, max gap 50 bps | afterSwap — the initializer asks a per-pool delegate for an amount, takes it from the PoolManager and returns it as the unspecified delta | in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and a duration. In the hook the PoolKey names, no: the rate is not there at all | the delegate can push a new dynamic LP fee at any time, capped at 10 %; the schedule itself is written at pool initialization | yes |
| `0xc71b7fa5…` SatoInitGuardHook | 0 | `no swap callback exists` ×1 | **concordant**, 1/1 pools, max gap 0 bps | nowhere — the contract implements `beforeInitialize` and nothing else | not applicable: there is no fee to announce | no — no owner, no setter, no storage; both fields are immutable | yes |
| `0xdd5eeaff…` Clanker Static Fee Hook (Base) | 19.9402 | `LP 10000 pips + carve 2000 pips` ×1 | **concordant**, 1/1 pools, max gap 0.0002 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in `PoolInitialized`; the direction selector is not public in this version | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0xdda9bc41…` LaunchHook | 99.3818 | `baseFeeBps = 100` ×2 | **concordant**, 2/2 pools, max gap 0.0062 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |

Across the 16 hooks: **297 pools where the measurement lands on the number written in the contract**, 2 where it does not, 6 where the pool cannot resolve the rate at all, 0 unverified — **297/299** of the comparable pools, within ±0.5 bps.

The instrument never read any of these contracts. It replaced 89 bytes of bytecode and quoted the same swap twice.

## 3. Each hook, with the lines

### `0x0469a4bd3724dc86c9542f4694c976da13c450c0` — Zora Hook

- **contract**: `ZoraV4CoinHook` — 30 own files, 2771 lines
- **measured**: 1881 MEASURED rows of 2080, 163 pools, median 100 bps
- **concordance**: concordant — 156 concordant / 0 divergent / 1 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0203 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager charges the hook's number as the LP fee for that swap
- **announced**: yes — a named constant with a NatSpec comment saying 1 %, and the decay window is documented in the same file
- **modifiable**: no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy through the upgrade gate can change it

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the steady-state fee is a constant equal to 10 000 pips = 1 % = 100 bps  
  [`node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:54`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant LP_FEE_V4 = 10_000;`
- beforeSwap returns that fee with the override flag  
  [`node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:325`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `return (BaseHook.beforeSwap.selector, BeforeSwapDelta.wrap(0), fee);`
- the override flag makes the pool charge it instead of its stored LP fee  
  [`node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:340`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `return CoinConstants.OVERRIDE_FEE_FLAG | CoinConstants.LP_FEE_V4;`
- for the first 10 seconds of a coin's life the fee starts at 99 % and decays  
  [`node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:70`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant LAUNCH_FEE_START = 990_000;`
- the decay window is 10 seconds  
  [`node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:74`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint256 internal constant LAUNCH_FEE_DURATION = 10 seconds;`
- trend coins settle at 100 pips = 1 bps instead  
  [`node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:58`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant TREND_LP_FEE_V4 = 100;`
- the hook itself returns no swap delta — it collects LP fees from its own positions  
  [`node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:139`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `beforeSwapReturnDelta: false,`

Pools that did not land, one by one:

- `0x265b556b0b5d3a278f70702a9d2a87937f3a423092341fcc4d61544126d0fc1e` — **not resolvable**. Measured 100 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity -0.0876: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here

### `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` — ClankerHookStaticFeeV2

- **contract**: `ClankerHookStaticFeeV2` — 12 own files, 1306 lines
- **measured**: 10 MEASURED rows of 10, 2 pools, median 253.3141 bps
- **concordance**: concordant — 2 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0481 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **announced**: yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant
- **modifiable**: the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the per-swap LP fee is a per-pool stored value, chosen by direction  
  [`src/hooks/ClankerHookStaticFeeV2.sol:46`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- that value is also pushed into the pool as a dynamic LP fee  
  [`src/hooks/ClankerHookStaticFeeV2.sol:50`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);`
- the hook's own cut is 20 % of that LP fee  
  [`src/hooks/ClankerHookV2.sol:55`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public constant MAX_PROTOCOL_FEE_NUMERATOR = 200_000; // ceiling: 20% of the LP fee`
- buying the token, the cut is taken in beforeSwap by shrinking the input  
  [`src/hooks/ClankerHookV2.sol:481`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee);`
- selling the token, it is taken in afterSwap out of the output  
  [`src/hooks/ClankerHookV2.sol:533`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR;`
- the per-pool fees are public and readable by anyone  
  [`src/hooks/ClankerHookStaticFeeV2.sol:12`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public clankerFee;`
- they are announced in an event at pool creation  
  [`src/hooks/ClankerHookStaticFeeV2.sol:37`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `emit PoolInitialized(poolKey.toId(), _poolConfigVars.clankerFee, _poolConfigVars.pairedFee);`
- and hard-capped at 10 % by a public constant  
  [`src/hooks/ClankerHookV2.sol:47`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_LP_FEE = 100_000; // LP fee capped at 10%`
- a MEV module may raise the fee for the first swaps of a pool's life  
  [`src/hooks/ClankerHookV2.sol:48`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_MEV_LP_FEE = 800_000; // Max MEV LP fee at 80%`
- one deployment in this corpus is a fork where the 20 % carve is a per-deployment immutable instead of a constant  
  [`src/hooks/ClankerHookV2.sol:56`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public immutable protocolFeeNumerator;`

Anchors that no longer match the fetched source — the corresponding claim is **dropped**, not guessed: `src/hooks/ClankerHookV2.sol` / `protocolFee = uint24(uint256(lpFee) * PROTOCOL_FEE_NUMERATOR`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc \
  0xf5197d58 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # protocolFeeNumerator()
#   -> LP 10000 pips + carve 0
#      = 100 bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 99.9926 bps at that size (gap -0.0074 bps)
```

### `0x201c4916c085032fb49f0b778efa98df23672044` — AdvancedFeeHookV5

- **contract**: `—` — 2 own files, 567 lines
- **measured**: 96 MEASURED rows of 96, 6 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x3b2b979df21036cee51b8debb13100e2cb8deacc` — LaunchHook

- **contract**: `LaunchHook` — 3 own files, 730 lines
- **measured**: 20 MEASURED rows of 20, 4 pools, median 0 bps
- **concordance**: not resolvable — 0 concordant / 0 divergent / 4 not resolvable / 0 unverified
- **where is it taken**: beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **announced**: yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable**: no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the fee is per-pool state, not a constant  
  [`src/LaunchHook.sol:52`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 baseFeeBps; // split creator/platform/referrer`
- and the whole config is publicly readable  
  [`src/LaunchHook.sol:75`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `mapping(PoolId => PoolConfig) public poolConfig;`
- an unregistered pool is charged nothing — first line of beforeSwap  
  [`src/LaunchHook.sol:235`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow  
  [`src/LaunchHook.sol:249`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side  
  [`src/LaunchHook.sol:250`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side  
  [`src/LaunchHook.sol:291`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee  
  [`src/LaunchHook.sol:387`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 %  
  [`src/LaunchHook.sol:42`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 %  
  [`src/LaunchHook.sol:44`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`
- a pool's config can never be rewritten  
  [`src/LaunchHook.sol:152`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `if (poolConfig[id].initialized) revert AlreadyRegistered();`
- every swap emits the fee actually taken  
  [`src/LaunchHook.sol:341`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `emit Trade(id, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);`

Pools that did not land, one by one:

- `0x5110f10d5ef39d1e417f35ab690a5f2438c7c31caab3e43fe0398f618505ce12` — **not resolvable**. Measured 0.0007 bps at amount_in 100000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8ffcf6bbe89c36ab57d5b0d8459e3239e55bb240b458301bc871c9c49096facd` — **not resolvable**. Measured 0.0007 bps at amount_in 100000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe13c158616734f4b3368da7a016ba6fd677195364f6f318818e662c355d9b943` — **not resolvable**. Measured 0.0008 bps at amount_in 100000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.47e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfbab36f7dd2edf414886016fa8954ede227e34463f596d8d51290799626d5ead` — **not resolvable**. Measured 0.0019 bps at amount_in 100000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 1.84e-06: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here

### `0x4951d0e1cfb915f64ab19aed153bd6305a244088` — Vvveity Fee Hook V2

- **contract**: `—` — 1 own files, 276 lines
- **measured**: 8 MEASURED rows of 16, 1 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x9811f10cd549c754fa9e5785989c422a762c28cc` — LiquidHookStaticFeeV2

- **contract**: `LiquidHookStaticFeeV2` — 12 own files, 1311 lines
- **measured**: 20 MEASURED rows of 20, 4 pools, median 19.9361 bps
- **concordance**: concordant — 4 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.03 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **announced**: yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, capped by a public constant
- **modifiable**: written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the per-swap LP fee is a per-pool stored value, chosen by direction  
  [`src/hooks/LiquidHookStaticFeeV2.sol:45`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- the per-pool fees are public and readable by anyone  
  [`src/hooks/LiquidHookStaticFeeV2.sol:12`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public liquidFee;`
- the hook's own cut is 20 % of the LP fee  
  [`src/hooks/LiquidHookV2.sol:50`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- the direction selector is public here  
  [`src/hooks/LiquidHookV2.sol:59`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol) — `mapping(PoolId => bool) public liquidIsToken0;`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0x9811f10cd549c754fa9e5785989c422a762c28cc \
  0x334e8367 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # PROTOCOL_FEE_NUMERATOR()
#   -> LP 10000 pips + carve 2000 pips (pool already at 10000 pips)
#      = 19.9601 bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0x3cfa8fbe43657c466ebb19f6975e3a49c01a2c4d179d8618c8921cbf8786a862' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 19.9583 bps at that size (gap -0.0018 bps)
```

### `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` — LaunchHook

- **contract**: `LaunchHook` — 3 own files, 730 lines
- **measured**: 125 MEASURED rows of 125, 25 pools, median 99.559 bps
- **concordance**: concordant — 25 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0044 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **announced**: yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable**: no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the fee is per-pool state, not a constant  
  [`src/LaunchHook.sol:52`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 baseFeeBps; // split creator/platform/referrer`
- and the whole config is publicly readable  
  [`src/LaunchHook.sol:75`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `mapping(PoolId => PoolConfig) public poolConfig;`
- an unregistered pool is charged nothing — first line of beforeSwap  
  [`src/LaunchHook.sol:235`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow  
  [`src/LaunchHook.sol:249`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side  
  [`src/LaunchHook.sol:250`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side  
  [`src/LaunchHook.sol:291`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee  
  [`src/LaunchHook.sol:387`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 %  
  [`src/LaunchHook.sol:42`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 %  
  [`src/LaunchHook.sol:44`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`
- a pool's config can never be rewritten  
  [`src/LaunchHook.sol:152`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `if (poolConfig[id].initialized) revert AlreadyRegistered();`
- every swap emits the fee actually taken  
  [`src/LaunchHook.sol:341`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `emit Trade(id, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0x985c14baa2a18316ffda0aefb3a632fadfca2acc \
  0x0885f732145db3fe9affafb5acc654891a47d56ea487441ff664f65b2c6459a28fedf353 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # poolConfig(bytes32)
#   -> baseFeeBps = 100
#      = 100 bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0x145db3fe9affafb5acc654891a47d56ea487441ff664f65b2c6459a28fedf353' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 99.9956 bps at that size (gap -0.0044 bps)
```

### `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` — Clanker Static Fee Hook v2 (Base)

- **contract**: `ClankerHookStaticFeeV2` — 12 own files, 1283 lines
- **measured**: 156 MEASURED rows of 166, 31 pools, median 114.004 bps
- **concordance**: partial — 28 concordant / 1 divergent / 1 not resolvable / 0 unverified
- **largest gap measured − code**: 2.2904 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **announced**: yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant
- **modifiable**: the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the per-swap LP fee is a per-pool stored value, chosen by direction  
  [`src/hooks/ClankerHookStaticFeeV2.sol:45`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- that value is also pushed into the pool as a dynamic LP fee  
  [`src/hooks/ClankerHookStaticFeeV2.sol:49`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);`
- the hook's own cut is 20 % of that LP fee  
  [`src/hooks/ClankerHookV2.sol:49`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- and is computed from it, not configured separately  
  [`src/hooks/ClankerHookV2.sol:99`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `protocolFee = uint24(uint256(lpFee) * PROTOCOL_FEE_NUMERATOR / uint128(FEE_DENOMINATOR));`
- buying the token, the cut is taken in beforeSwap by shrinking the input  
  [`src/hooks/ClankerHookV2.sol:465`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee);`
- selling the token, it is taken in afterSwap out of the output  
  [`src/hooks/ClankerHookV2.sol:517`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR;`
- the per-pool fees are public and readable by anyone  
  [`src/hooks/ClankerHookStaticFeeV2.sol:12`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public clankerFee;`
- they are announced in an event at pool creation  
  [`src/hooks/ClankerHookStaticFeeV2.sol:36`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `emit PoolInitialized(poolKey.toId(), _poolConfigVars.clankerFee, _poolConfigVars.pairedFee);`
- and hard-capped at 10 % by a public constant  
  [`src/hooks/ClankerHookV2.sol:47`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_LP_FEE = 100_000; // LP fee capped at 10%`
- a MEV module may raise the fee for the first swaps of a pool's life  
  [`src/hooks/ClankerHookV2.sol:48`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_MEV_LP_FEE = 800_000; // Max MEV LP fee at 80%`

Anchors that no longer match the fetched source — the corresponding claim is **dropped**, not guessed: `src/hooks/ClankerHookV2.sol` / `uint256 public immutable protocolFeeNumerator`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc \
  0x334e8367 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # PROTOCOL_FEE_NUMERATOR()
#   -> LP 10000 pips + carve 2000 pips
#      = 119.7605 bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0x0375e335589620f118ffa99c946441b1b62db25493ac0e627be43e753ce23045' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 119.7593 bps at that size (gap -0.0012 bps)
```

Pools that did not land, one by one:

- `0x67443869ce12cb2fa90aa8a2a522bc89360caa3aeec2063751fd3fcf4681f2ab` — **not resolvable**. Measured 0 bps at amount_in 1000000000000; the code says 0 bps. the quote at this pool is insensitive to size (elasticity 1.72e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6be731a245a7ae0bf1221359e2da551aa80857ef70198eede0fb030f2a1e0cf3` — **divergent**. Measured 17.6697 bps at amount_in 100000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap

### `0xba83ee6969d09ceb8a4827c3ed77413c75392044` — AdvancedFeeHookV5

- **contract**: `—` — 2 own files, 567 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` — DecayMulticurveInitializerHook

- **contract**: `DecayMulticurveInitializerHook` — 18 own files, 2424 lines
- **measured**: 0 MEASURED rows of 15, 3 pools, median — bps
- **concordance**: not measurable — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: beforeSwap — the hook rewrites the pool's liquidity distribution before the swap runs, which is why removing its bytecode removes the venue rather than a fee
- **announced**: there is no per-swap rate to announce; the fee split is beneficiary shares
- **modifiable**: the curve decay is driven by time and by the initializer's own state

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the hook rebalances liquidity inside beforeSwap  
  [`src/initializers/DecayMulticurveInitializerHook.sol:117`](0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializerHook.sol) — `function _beforeSwap(`
- which is the custom-accounting class the stub counterfactual cannot price  
  [`src/initializers/DecayMulticurveInitializer.sol:61`](0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializer.sol) — `contract DecayMulticurveInitializer is UniswapV4MulticurveInitializer {`

### `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` — DopplerHookInitializer

- **contract**: `DopplerHookInitializer` — 18 own files, 2589 lines
- **measured**: 812 MEASURED rows of 1272, 129 pools, median 105 bps
- **concordance**: partial — 78 concordant / 1 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 50 bps (tolerance ±0.5)
- **where is it taken**: afterSwap — the initializer asks a per-pool delegate for an amount, takes it from the PoolManager and returns it as the unspecified delta
- **announced**: in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and a duration. In the hook the PoolKey names, no: the rate is not there at all
- **modifiable**: the delegate can push a new dynamic LP fee at any time, capped at 10 %; the schedule itself is written at pool initialization

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the initializer takes nothing of its own: it asks a per-pool delegate  
  [`src/initializers/DopplerHookInitializer.sol:543`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `(feeCurrency, delta) = IDopplerHook(dopplerHook).onSwap(sender, key, params, balanceDelta, data);`
- and returns whatever the delegate asked for as the afterSwap delta  
  [`src/initializers/DopplerHookInitializer.sol:546`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `poolManager.take(feeCurrency, address(this), uint128(delta));`
- the delegate address is per pool and publicly readable  
  [`src/initializers/DopplerHookInitializer.sol:187`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `mapping(address asset => PoolState state) public getState;`
- only that delegate may move the pool's LP fee, and only up to 10 %  
  [`src/initializers/DopplerHookInitializer.sol:429`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `require(lpFee <= MAX_LP_FEE, LPFeeTooHigh(MAX_LP_FEE, lpFee));`
- MAX_LP_FEE is 100 000 pips = 10 %  
  [`src/initializers/DopplerHookInitializer.sol:171`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `uint24 constant MAX_LP_FEE = 100_000;`

The rate is **not in this contract**. It is delegated per pool to `0x9982538f41f2ae29ddb9d3d9307010052984fdbb`, whose source is `FOUND`:

- the delegate's fee schedule is a public mapping  
  [`src/dopplerHooks/RehypeDopplerHookInitializer.sol:82`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `mapping(PoolId poolId => FeeSchedule feeSchedule) public getFeeSchedule;`
- the fee decays linearly from startFee to endFee over durationSeconds  
  [`src/dopplerHooks/RehypeDopplerHookInitializer.sol:757`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `uint256 feeDelta_ = feeRange * elapsed / schedule.durationSeconds;`
- on exact input the fee is taken out of the output  
  [`src/dopplerHooks/RehypeDopplerHookInitializer.sol:831`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `feeBase = uint256(outputAmount);`
- at currentFee / 1e6 of it  
  [`src/dopplerHooks/RehypeDopplerHookInitializer.sol:839`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `uint256 feeAmount = FullMath.mulDiv(feeBase, currentFee, SWAP_FEE_DENOMINATOR);`
- the denominator is 1e6, so the schedule is in pips  
  [`src/types/RehypeTypes.sol:49`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant SWAP_FEE_DENOMINATOR = 1e6;`
- 5 % of every fee is routed to the Airlock owner  
  [`src/types/RehypeTypes.sol:58`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant AIRLOCK_OWNER_FEE_BPS = 500;`
- and the swap fee is capped at 80 %  
  [`src/types/RehypeTypes.sol:46`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant MAX_SWAP_FEE = 0.8e6;`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0x9982538f41f2ae29ddb9d3d9307010052984fdbb \
  0xb43df6e301756ca64967ab669b4a07a77c2ab73e315e0f55dd53d77b2ee5699c110cd89c \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # getFeeSchedule(bytes32)
#   -> endFee = 17500 pips
#      = 175 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x01756ca64967ab669b4a07a77c2ab73e315e0f55dd53d77b2ee5699c110cd89c' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 175 bps at that size (gap 0 bps)
```

Pools that did not land, one by one:

- `0x560e3510d8637aa841308f3b73e83bb686cff5ec2bd21b5919365a8d38905266` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule

### `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` — SatoInitGuardHook

- **contract**: `SatoInitGuardHook` — 2 own files, 204 lines
- **measured**: 5 MEASURED rows of 5, 1 pools, median 0 bps
- **concordance**: concordant — 1 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0 bps (tolerance ±0.5)
- **where is it taken**: nowhere — the contract implements `beforeInitialize` and nothing else
- **announced**: not applicable: there is no fee to announce
- **modifiable**: no — no owner, no setter, no storage; both fields are immutable

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- exactly one permission bit, and it is not a swap bit  
  [`src/modela/SatoInitGuardHook.sol:56`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `uint160 internal constant BEFORE_INITIALIZE_FLAG = uint160(1 << 13);`
- the address itself is checked to carry only that bit  
  [`src/modela/SatoInitGuardHook.sol:72`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `if (uint160(address(this)) & ALL_HOOK_MASK != BEFORE_INITIALIZE_FLAG) revert BadHookAddress();`
- the only external entry point is beforeInitialize  
  [`src/modela/SatoInitGuardHook.sol:79`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `function beforeInitialize(address sender, PoolKey calldata poolKey, uint160 sqrtPriceX96)`
- and it is `view` — it cannot move value  
  [`src/modela/SatoInitGuardHook.sol:98`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `return SatoInitGuardHook.beforeInitialize.selector;`

### `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` — Clanker Static Fee Hook (Base)

- **contract**: `ClankerHookStaticFee` — 9 own files, 995 lines
- **measured**: 5 MEASURED rows of 5, 1 pools, median 19.9402 bps
- **concordance**: concordant — 1 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0002 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **announced**: yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in `PoolInitialized`; the direction selector is not public in this version
- **modifiable**: written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- the per-swap LP fee is a per-pool stored value, chosen by direction  
  [`src/hooks/ClankerHookStaticFee.sol:42`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol) — `? pairedFee[poolKey.toId()]`
- the per-pool fees are public and readable by anyone  
  [`src/hooks/ClankerHookStaticFee.sol:12`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol) — `mapping(PoolId => uint24) public clankerFee;`
- the direction selector is internal in v1, so the branch cannot be read on chain  
  [`src/hooks/ClankerHook.sol:49`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `mapping(PoolId => bool) internal clankerIsToken0;`
- the hook's own cut is 20 % of the LP fee  
  [`src/hooks/ClankerHook.sol:41`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- capped at 30 % in v1 (10 % in v2)  
  [`src/hooks/ClankerHook.sol:40`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `uint24 public constant MAX_LP_FEE = 300_000; // LP fee capped at 30%`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc \
  0x334e8367 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # PROTOCOL_FEE_NUMERATOR()
#   -> LP 10000 pips + carve 2000 pips
#      = — bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0xff3bddf9647ea19d4563fcb5db0023dc48098e4d127505ac1963a2641a7031f9' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 19.9599 bps at that size (gap 0.0002 bps)
```

### `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` — LaunchHook

- **contract**: `LaunchHook` — 4 own files, 1042 lines
- **measured**: 10 MEASURED rows of 10, 2 pools, median 99.3818 bps
- **concordance**: concordant — 2 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0062 bps (tolerance ±0.5)
- **where is it taken**: beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **announced**: yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable**: no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Each claim above rests on one of these lines. The line numbers were resolved by searching the fetched file when this report was generated, so every one of them is checkable with a single `sed -n`:

- an unregistered pool is charged nothing — first line of beforeSwap  
  [`src/LaunchHook.sol:363`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow  
  [`src/LaunchHook.sol:384`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side  
  [`src/LaunchHook.sol:385`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side  
  [`src/LaunchHook.sol:438`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee  
  [`src/LaunchHook.sol:561`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 %  
  [`src/LaunchHook.sol:47`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 %  
  [`src/LaunchHook.sol:49`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`

Anchors that no longer match the fetched source — the corresponding claim is **dropped**, not guessed: `src/LaunchHook.sol` / `uint16 baseFeeBps; // split creator/platform/referrer`, `src/LaunchHook.sol` / `mapping(PoolId => PoolConfig) public poolConfig`, `src/LaunchHook.sol` / `if (poolConfig[id].initialized) revert AlreadyRegistered()`, `src/LaunchHook.sol` / `emit Trade(id, sender,`

One replayable example — what the contract stores, then what the instrument read:

```bash
# the contract says:
cast call 0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc \
  0x0885f732221a4ef99beb7d37d31662976ac927151aab59e60826c02da1ea646f7d4ef2e6 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # poolConfig(bytes32)
#   -> baseFeeBps = 100
#      = 100 bps on this pool, this direction, amount_in 100000000000000

# the instrument, which never read the contract, says:
grep '0x221a4ef99beb7d37d31662976ac927151aab59e60826c02da1ea646f7d4ef2e6' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 99.9938 bps at that size (gap -0.0062 bps)
```

## 4. The hooks whose source we do not have

These keep the label **"behaviour not read"**. No intent, no mechanism, no rate and no concordance is attributed to them. The measurement stays true; the reading does not exist. `engine/tare/source/classify.py` enforces this by construction — a record with `read=False` carries no classification field at all — and `engine/tests/test_source.py` fails if it ever does.

- **`0x6e4e217ac96721cb12c9ba66e68090a098102acc`** — 8 MEASURED rows of 16, 1 pool(s), median 99.9891 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088`** — 5 MEASURED rows of 5, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment

A Sourcify `NOT_FOUND` means: Sourcify holds no verified source for that address. It does **not** mean the contract is unverified everywhere, and it certainly does not mean the hook takes nothing — one of the addresses above measures 0.00 bps on every row, and that number is a measurement, not an exoneration.

## 5. What this file still does not say

1. **A concordant rate is not a legitimate rate.** Recovering the 100 bps written in a contract proves the instrument reads the right number. It says nothing about whether that number was shown to the person who signed the swap. LIMITS.md §6 stands, unchanged, except for its last sentence.
2. **Each family's model is hand-written from the source.** It is cited line by line and it lands on 297 of 299 comparable pools, but it is a re-implementation of the arithmetic, not the bytecode. Where it disagrees, either the model or the world is wrong, and this file does not assume which.
3. **One block, one size per pool, one direction.** The reference size for a pool is the smallest measured size whose rounding noise is below a tenth of the tolerance (`QUANT_FRACTION` = 0.1); one pool in this corpus quotes 2 458 units of output at 1e14 in, where a single unit is worth 4 bps. The other sizes bend away from the rate for the reason LIMITS.md §6 already gives, and that is not a disagreement.
4. **Some pools cannot resolve a rate at all.** Where the quote does not respond to size (elasticity below 0.05: ten times the input buys the same output), a fee taken out of the *input* cannot move the quote, so the counterfactual has nothing to measure. Those pools are `NOT_RESOLVABLE`, not `0`, and not `DIVERGENT`.
5. **These hooks do more during a swap than take a fee.** Several claim accrued fees or call a pool extension inside the same callback; those calls move the pool's state before the swap runs with the hook and do not run at all with the stub. The models do not price them, and that is a candidate explanation for a residual gap — a candidate, not a finding.
6. **`hookData` is always empty** (`engine/tare/quote.py`), so any router-driven branch is unexercised: LaunchHook's referrals, Clanker's MEV-module payload, Doppler's swap data.

Unchanged: [`LIMITS.md`](../LIMITS.md) for what the measurement cannot tell you, [`HONESTY.md`](../HONESTY.md) for the labels and the eight false results that produced them, [`METHOD.md`](../METHOD.md) for how the number is made.

