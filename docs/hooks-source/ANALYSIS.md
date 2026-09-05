# ANALYSIS — ce que le code des hooks dit, et ce que la mesure a trouve

`docs/LIMITS.md` §6(c) disait, en toutes lettres : « **We have not read a single line of any hook's source. Not one.** » Ce fichier est la reponse. Il ne remplace pas LIMITS.md — il en ferme un paragraphe et en ouvre d'autres.

Trois etapes, separees et rejouables :

```bash
python3 -m tare.source.cli fetch                      # Sourcify -> docs/hooks-source/<addr>/
python3 -m tare.source.cli analyze --rpc "$BASE_RPC_URL"   # lit le taux declare on-chain
python3 -m tare.source.cli report                     # ecrit ce fichier
```

**Le modele ne produit aucun chiffre ici.** Les taux de la colonne « taux dans le code » sont lus par `eth_call` sur le getter public que le source designe  au bloc **50 614 000** (le bloc du corpus), ou sont des constantes citees ligne par ligne. La colonne « concordance » est une soustraction.

## 1. Couverture des sources

**11 sur 12** hooks mesures ont un source verifie recupere. 1 sur 12 n'en a pas.

| hook | nom registre | source verifiee | fournisseur | match | verifie le | fichiers (propres/total) |
|---|---|---|---|---|---|---|
| `0x0469a4bd3724dc86c9542f4694c976da13c450c0` | Zora Hook | oui | sourcify | match | 2026-03-23 | 30/ |
| `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` | ClankerHookStaticFeeV2 | oui | sourcify | match | 2026-06-18 | 12/ |
| `0x3b2b979df21036cee51b8debb13100e2cb8deacc` | LaunchHook | oui | sourcify | exact_match | 2026-08-18 | 3/ |
| `0x9811f10cd549c754fa9e5785989c422a762c28cc` | LiquidHookStaticFeeV2 | oui | sourcify | match | 2026-03-25 | 12/ |
| `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` | LaunchHook | oui | sourcify | exact_match | 2026-07-10 | 3/ |
| `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` | Clanker Static Fee Hook v2 (Base) | oui | sourcify | match | 2025-09-16 | 12/ |
| `0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088` | — | **non** | sourcify | — | — | 0/0 |
| `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` | DecayMulticurveInitializerHook | oui | sourcify | match | 2026-02-12 | 18/ |
| `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` | DopplerHookInitializer | oui | sourcify | match | 2026-03-24 | 18/ |
| `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` | — | oui | sourcify | exact_match | 2026-08-23 | 2/ |
| `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` | Clanker Static Fee Hook (Base) | oui | sourcify | match | 2025-08-14 | 9/ |
| `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` | LaunchHook | oui | sourcify | exact_match | 2026-08-27 | 4/ |

Le fournisseur est [Sourcify v2](https://sourcify.dev) (`/v2/contract/8453/<addr>?fields=sources`). Le repli Etherscan v2 existe dans `engine/tare/source/fetch.py` et n'a pas pu etre interroge : aucune cle `ETHERSCAN_API_KEY` n'est configuree. **Ce n'est pas une preuve d'absence** — c'est consigne comme `UNAVAILABLE` dans chaque `provenance.json`, pas comme `NOT_FOUND`.

## 2. Tableau hook par hook

| hook | bps mesure (mediane) | taux dans le code | concordance | ou est-il pris | annonce | modifiable | source |
|---|---|---|---|---|---|---|---|
| `0x0469a4bd…` Zora Hook | 100 | — | **concordant** 51/51 pools, ecart max 0.0203 bps | beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager charges the hook's number as the LP fee for that swap | yes — a named constant with a NatSpec comment saying 1 %, and the decay window is documented in the same file | no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy through the upgrade gate can change it | oui |
| `0x1aea38f0…` ClankerHookStaticFeeV2 | 253.3141 | — | **concordant** 2/2 pools, ecart max 0.0481 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | oui |
| `0x3b2b979d…` LaunchHook | 0 | — | **non resolvable** 0/4 pools, ecart max — bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | oui |
| `0x9811f10c…` LiquidHookStaticFeeV2 | 19.9361 | — | **concordant** 4/4 pools, ecart max 0.03 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, capped by a public constant | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | oui |
| `0x985c14ba…` LaunchHook | 99.559 | — | **concordant** 25/25 pools, ecart max 0.0044 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | oui |
| `0xb429d62f…` Clanker Static Fee Hook v2 (Base) | 114.004 | — | **partiel** 28/30 pools, ecart max 2.2904 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | oui |
| `0xb995b9ef…`  | 0 | **comportement non lu** | — | **non lu** | **non lu** | **non lu** | non |
| `0xbb7784a4…` DecayMulticurveInitializerHook | — | — | **non mesurable** | beforeSwap — the hook rewrites the pool's liquidity distribution before the swap runs, which is why removing its bytecode removes the venue rather than a fee | there is no per-swap rate to announce; the fee split is beneficiary shares | the curve decay is driven by time and by the initializer's own state | oui |
| `0xbdf93814…` DopplerHookInitializer | 105 | — | **concordant** 23/23 pools, ecart max 0.0058 bps | afterSwap — the initializer asks a per-pool delegate for an amount, takes it from the PoolManager and returns it as the unspecified delta | in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and a duration. In the hook the PoolKey names, no: the rate is not there at all | the delegate can push a new dynamic LP fee at any time, capped at 10 %; the schedule itself is written at pool initialization | oui |
| `0xc71b7fa5…` SatoInitGuardHook | 0 | — | **concordant** 1/1 pools, ecart max 0 bps | nowhere — the contract implements `beforeInitialize` and nothing else | not applicable: there is no fee to announce | no — no owner, no setter, no storage; both fields are immutable | oui |
| `0xdd5eeaff…` Clanker Static Fee Hook (Base) | 19.9402 | — | **concordant** 1/1 pools, ecart max 0.0002 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in `PoolInitialized`; the direction selector is not public in this version | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | oui |
| `0xdda9bc41…` LaunchHook | 99.3818 | — | **concordant** 2/2 pools, ecart max 0.0062 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | oui |

Total sur les 12 hooks : **137 pools concordants**, **1 divergent**, 5 non resolvables, 0 non verifie(s) — soit 137/138 des pools comparables, a ±0.5 bps pres.

## 3. Hook par hook, avec les lignes de code

### `0x0469a4bd3724dc86c9542f4694c976da13c450c0` — Zora Hook

- **contrat** : `ZoraV4CoinHook` (30 fichiers propres, 2771 lignes)
- **mesure** : 269 lignes MEASURED sur 274, 52 pools, mediane 100 bps
- **concordance** : concordant — 51 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0203 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager charges the hook's number as the LP fee for that swap
- **annonce** : yes — a named constant with a NatSpec comment saying 1 %, and the decay window is documented in the same file
- **modifiable** : no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy through the upgrade gate can change it

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the steady-state fee is a constant equal to 10 000 pips = 1 % = 100 bps — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:54`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant LP_FEE_V4 = 10_000;`
- beforeSwap returns that fee with the override flag — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:325`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `return (BaseHook.beforeSwap.selector, BeforeSwapDelta.wrap(0), fee);`
- the override flag makes the pool charge it instead of its stored LP fee — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:340`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `return CoinConstants.OVERRIDE_FEE_FLAG | CoinConstants.LP_FEE_V4;`
- for the first 10 seconds of a coin's life the fee starts at 99 % and decays — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:70`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant LAUNCH_FEE_START = 990_000;`
- the decay window is 10 seconds — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:74`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint256 internal constant LAUNCH_FEE_DURATION = 10 seconds;`
- trend coins settle at 100 pips = 1 bps instead — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol:58`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/libs/CoinConstants.sol) — `uint24 internal constant TREND_LP_FEE_V4 = 100;`
- the hook itself returns no swap delta — it collects LP fees from its own positions — [`0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol:139`](0x0469a4bd3724dc86c9542f4694c976da13c450c0/sources/node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol) — `beforeSwapReturnDelta: false,`

### `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` — ClankerHookStaticFeeV2

- **contrat** : `ClankerHookStaticFeeV2` (12 fichiers propres, 1306 lignes)
- **mesure** : 10 lignes MEASURED sur 10, 2 pools, mediane 253.3141 bps
- **concordance** : concordant — 2 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0481 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **annonce** : yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant
- **modifiable** : the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the per-swap LP fee is a per-pool stored value, chosen by direction — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:46`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- that value is also pushed into the pool as a dynamic LP fee — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:50`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);`
- the hook's own cut is 20 % of that LP fee — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:55`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public constant MAX_PROTOCOL_FEE_NUMERATOR = 200_000; // ceiling: 20% of the LP fee`
- buying the token, the cut is taken in beforeSwap by shrinking the input — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:481`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee);`
- selling the token, it is taken in afterSwap out of the output — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:533`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR;`
- the per-pool fees are public and readable by anyone — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:12`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public clankerFee;`
- they are announced in an event at pool creation — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:37`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `emit PoolInitialized(poolKey.toId(), _poolConfigVars.clankerFee, _poolConfigVars.pairedFee);`
- and hard-capped at 10 % by a public constant — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:47`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_LP_FEE = 100_000; // LP fee capped at 10%`
- a MEV module may raise the fee for the first swaps of a pool's life — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:48`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_MEV_LP_FEE = 800_000; // Max MEV LP fee at 80%`
- one deployment in this corpus is a fork where the 20 % carve is a per-deployment immutable instead of a constant — [`0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol:56`](0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public immutable protocolFeeNumerator;`

Ancres non retrouvees dans le source recupere (l'affirmation correspondante est retiree, pas devinee) : `src/hooks/ClankerHookV2.sol` / `protocolFee = uint24(uint256(lpFee) * PROTOCOL_FEE_NUMERATOR`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc \
  0x2c78f493706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # clankerFee(bytes32)
# -> None
#    soit 100 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x706140c978c382cda318ba3d1282368231e580a3d7b13803d09ca3593caca8cf' docs/dataset/measurements.jsonl | head -1
# -> bps = 99.9926   (ecart -0.0074 bps)
```

### `0x3b2b979df21036cee51b8debb13100e2cb8deacc` — LaunchHook

- **contrat** : `LaunchHook` (3 fichiers propres, 730 lignes)
- **mesure** : 20 lignes MEASURED sur 20, 4 pools, mediane 0 bps
- **concordance** : non resolvable — 0 concordants / 0 divergents / 4 non resolvables / 0 non verifies
- **ou est-il pris** : beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **annonce** : yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable** : no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the fee is per-pool state, not a constant — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:52`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 baseFeeBps; // split creator/platform/referrer`
- and the whole config is publicly readable — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:75`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `mapping(PoolId => PoolConfig) public poolConfig;`
- an unregistered pool is charged nothing — first line of beforeSwap — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:235`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:249`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:250`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:291`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:387`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 % — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:42`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 % — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:44`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`
- a pool's config can never be rewritten — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:152`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `if (poolConfig[id].initialized) revert AlreadyRegistered();`
- every swap emits the fee actually taken — [`0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol:341`](0x3b2b979df21036cee51b8debb13100e2cb8deacc/sources/src/LaunchHook.sol) — `emit Trade(id, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);`

Pools qui ne concordent pas, un par un :

- `0x5110f10d5ef39d1e417f35ab690a5f2438c7c31caab3e43fe0398f618505ce12` — **non resolvable** : mesure 0.0007 bps, code 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8ffcf6bbe89c36ab57d5b0d8459e3239e55bb240b458301bc871c9c49096facd` — **non resolvable** : mesure 0.0007 bps, code 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe13c158616734f4b3368da7a016ba6fd677195364f6f318818e662c355d9b943` — **non resolvable** : mesure 0.0008 bps, code 100 bps. the quote at this pool is insensitive to size (elasticity 7.47e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfbab36f7dd2edf414886016fa8954ede227e34463f596d8d51290799626d5ead` — **non resolvable** : mesure 0.0019 bps, code 100 bps. the quote at this pool is insensitive to size (elasticity 1.84e-06: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here

### `0x9811f10cd549c754fa9e5785989c422a762c28cc` — LiquidHookStaticFeeV2

- **contrat** : `LiquidHookStaticFeeV2` (12 fichiers propres, 1311 lignes)
- **mesure** : 20 lignes MEASURED sur 20, 4 pools, mediane 19.9361 bps
- **concordance** : concordant — 4 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.03 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **annonce** : yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, capped by a public constant
- **modifiable** : written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the per-swap LP fee is a per-pool stored value, chosen by direction — [`0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol:45`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- the per-pool fees are public and readable by anyone — [`0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol:12`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public liquidFee;`
- the hook's own cut is 20 % of the LP fee — [`0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol:50`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- the direction selector is public here — [`0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol:59`](0x9811f10cd549c754fa9e5785989c422a762c28cc/sources/src/hooks/LiquidHookV2.sol) — `mapping(PoolId => bool) public liquidIsToken0;`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0x9811f10cd549c754fa9e5785989c422a762c28cc \
  0xe1f6e19e3cfa8fbe43657c466ebb19f6975e3a49c01a2c4d179d8618c8921cbf8786a862 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # liquidFee(bytes32)
# -> None
#    soit 19.9601 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x3cfa8fbe43657c466ebb19f6975e3a49c01a2c4d179d8618c8921cbf8786a862' docs/dataset/measurements.jsonl | head -1
# -> bps = 19.9583   (ecart -0.0018 bps)
```

### `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` — LaunchHook

- **contrat** : `LaunchHook` (3 fichiers propres, 730 lignes)
- **mesure** : 125 lignes MEASURED sur 125, 25 pools, mediane 99.559 bps
- **concordance** : concordant — 25 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0044 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **annonce** : yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable** : no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the fee is per-pool state, not a constant — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:52`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 baseFeeBps; // split creator/platform/referrer`
- and the whole config is publicly readable — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:75`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `mapping(PoolId => PoolConfig) public poolConfig;`
- an unregistered pool is charged nothing — first line of beforeSwap — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:235`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:249`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:250`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:291`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:387`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 % — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:42`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 % — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:44`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`
- a pool's config can never be rewritten — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:152`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `if (poolConfig[id].initialized) revert AlreadyRegistered();`
- every swap emits the fee actually taken — [`0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol:341`](0x985c14baa2a18316ffda0aefb3a632fadfca2acc/sources/src/LaunchHook.sol) — `emit Trade(id, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0x985c14baa2a18316ffda0aefb3a632fadfca2acc \
  0x0885f732145db3fe9affafb5acc654891a47d56ea487441ff664f65b2c6459a28fedf353 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # poolConfig(bytes32)
# -> None
#    soit 100 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x145db3fe9affafb5acc654891a47d56ea487441ff664f65b2c6459a28fedf353' docs/dataset/measurements.jsonl | head -1
# -> bps = 99.9956   (ecart -0.0044 bps)
```

### `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` — Clanker Static Fee Hook v2 (Base)

- **contrat** : `ClankerHookStaticFeeV2` (12 fichiers propres, 1283 lignes)
- **mesure** : 156 lignes MEASURED sur 166, 31 pools, mediane 114.004 bps
- **concordance** : partiel — 28 concordants / 1 divergents / 1 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 2.2904 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **annonce** : yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant
- **modifiable** : the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the per-swap LP fee is a per-pool stored value, chosen by direction — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:45`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `? pairedFee[poolKey.toId()]`
- that value is also pushed into the pool as a dynamic LP fee — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:49`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);`
- the hook's own cut is 20 % of that LP fee — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:49`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- and is computed from it, not configured separately — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:99`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `protocolFee = uint24(uint256(lpFee) * PROTOCOL_FEE_NUMERATOR / uint128(FEE_DENOMINATOR));`
- buying the token, the cut is taken in beforeSwap by shrinking the input — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:465`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint128 scaledProtocolFee = uint128(protocolFee) * 1e18 / (1_000_000 + protocolFee);`
- selling the token, it is taken in afterSwap out of the output — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:517`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `unspecifiedDelta = amountOut * int24(protocolFee) / FEE_DENOMINATOR;`
- the per-pool fees are public and readable by anyone — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:12`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `mapping(PoolId => uint24) public clankerFee;`
- they are announced in an event at pool creation — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol:36`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookStaticFeeV2.sol) — `emit PoolInitialized(poolKey.toId(), _poolConfigVars.clankerFee, _poolConfigVars.pairedFee);`
- and hard-capped at 10 % by a public constant — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:47`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_LP_FEE = 100_000; // LP fee capped at 10%`
- a MEV module may raise the fee for the first swaps of a pool's life — [`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol:48`](0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc/sources/src/hooks/ClankerHookV2.sol) — `uint24 public constant MAX_MEV_LP_FEE = 800_000; // Max MEV LP fee at 80%`

Ancres non retrouvees dans le source recupere (l'affirmation correspondante est retiree, pas devinee) : `src/hooks/ClankerHookV2.sol` / `uint256 public immutable protocolFeeNumerator`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc \
  0x2c78f4930375e335589620f118ffa99c946441b1b62db25493ac0e627be43e753ce23045 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # clankerFee(bytes32)
# -> None
#    soit 119.7605 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x0375e335589620f118ffa99c946441b1b62db25493ac0e627be43e753ce23045' docs/dataset/measurements.jsonl | head -1
# -> bps = 119.7593   (ecart -0.0012 bps)
```

Pools qui ne concordent pas, un par un :

- `0x67443869ce12cb2fa90aa8a2a522bc89360caa3aeec2063751fd3fcf4681f2ab` — **non resolvable** : mesure 0 bps, code 0 bps. the quote at this pool is insensitive to size (elasticity 1.72e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6be731a245a7ae0bf1221359e2da551aa80857ef70198eede0fb030f2a1e0cf3` — **divergent** : mesure 17.6697 bps, code 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap

### `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` — DecayMulticurveInitializerHook

- **contrat** : `DecayMulticurveInitializerHook` (18 fichiers propres, 2424 lignes)
- **mesure** : 0 lignes MEASURED sur 15, 3 pools, mediane — bps
- **concordance** : non mesurable — 0 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ou est-il pris** : beforeSwap — the hook rewrites the pool's liquidity distribution before the swap runs, which is why removing its bytecode removes the venue rather than a fee
- **annonce** : there is no per-swap rate to announce; the fee split is beneficiary shares
- **modifiable** : the curve decay is driven by time and by the initializer's own state

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the hook rebalances liquidity inside beforeSwap — [`0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializerHook.sol:117`](0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializerHook.sol) — `function _beforeSwap(`
- which is the custom-accounting class the stub counterfactual cannot price — [`0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializer.sol:61`](0xbb7784a4d481184283ed89619a3e3ed143e1adc0/sources/src/initializers/DecayMulticurveInitializer.sol) — `contract DecayMulticurveInitializer is UniswapV4MulticurveInitializer {`

### `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` — DopplerHookInitializer

- **contrat** : `DopplerHookInitializer` (18 fichiers propres, 2589 lignes)
- **mesure** : 126 lignes MEASURED sur 376, 73 pools, mediane 105 bps
- **concordance** : concordant — 23 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0058 bps (tolerance 0.5 bps)
- **ou est-il pris** : afterSwap — the initializer asks a per-pool delegate for an amount, takes it from the PoolManager and returns it as the unspecified delta
- **annonce** : in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and a duration. In the hook the PoolKey names, no: the rate is not there at all
- **modifiable** : the delegate can push a new dynamic LP fee at any time, capped at 10 %; the schedule itself is written at pool initialization

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the initializer takes nothing of its own: it asks a per-pool delegate — [`0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol:543`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `(feeCurrency, delta) = IDopplerHook(dopplerHook).onSwap(sender, key, params, balanceDelta, data);`
- and returns whatever the delegate asked for as the afterSwap delta — [`0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol:546`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `poolManager.take(feeCurrency, address(this), uint128(delta));`
- the delegate address is per pool and publicly readable — [`0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol:187`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `mapping(address asset => PoolState state) public getState;`
- only that delegate may move the pool's LP fee, and only up to 10 % — [`0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol:429`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `require(lpFee <= MAX_LP_FEE, LPFeeTooHigh(MAX_LP_FEE, lpFee));`
- MAX_LP_FEE is 100 000 pips = 10 % — [`0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol:171`](0xbdf938149ac6a781f94faa0ed45e6a0e984c6544/sources/src/initializers/DopplerHookInitializer.sol) — `uint24 constant MAX_LP_FEE = 100_000;`

Le taux n'est pas dans ce contrat : il est delegue a `0x9982538f41f2ae29ddb9d3d9307010052984fdbb` (source : FOUND).

- the delegate's fee schedule is a public mapping — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol:82`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `mapping(PoolId poolId => FeeSchedule feeSchedule) public getFeeSchedule;`
- the fee decays linearly from startFee to endFee over durationSeconds — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol:757`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `uint256 feeDelta_ = feeRange * elapsed / schedule.durationSeconds;`
- on exact input the fee is taken out of the output — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol:831`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `feeBase = uint256(outputAmount);`
- at currentFee / 1e6 of it — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol:839`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/dopplerHooks/RehypeDopplerHookInitializer.sol) — `uint256 feeAmount = FullMath.mulDiv(feeBase, currentFee, SWAP_FEE_DENOMINATOR);`
- the denominator is 1e6, so the schedule is in pips — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol:49`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant SWAP_FEE_DENOMINATOR = 1e6;`
- 5 % of every fee is routed to the Airlock owner — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol:58`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant AIRLOCK_OWNER_FEE_BPS = 500;`
- and the swap fee is capped at 80 % — [`0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol:46`](0x9982538f41f2ae29ddb9d3d9307010052984fdbb/sources/src/types/RehypeTypes.sol) — `uint256 constant MAX_SWAP_FEE = 0.8e6;`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0xbdf938149ac6a781f94faa0ed45e6a0e984c6544 \
  0x1bab58f5000000000000000000000000394c40c964bafb9508256a5e9d8469cd12c42ba3 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # getState(address)
# -> None
#    soit 105 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x0e9f86c2c58f80977c80b3de27da50fa69c6f2214ed1e583bdcbb7f50e64f8f1' docs/dataset/measurements.jsonl | head -1
# -> bps = 105   (ecart 0 bps)
```

### `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` — SatoInitGuardHook

- **contrat** : `SatoInitGuardHook` (2 fichiers propres, 204 lignes)
- **mesure** : 5 lignes MEASURED sur 5, 1 pools, mediane 0 bps
- **concordance** : concordant — 1 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0 bps (tolerance 0.5 bps)
- **ou est-il pris** : nowhere — the contract implements `beforeInitialize` and nothing else
- **annonce** : not applicable: there is no fee to announce
- **modifiable** : no — no owner, no setter, no storage; both fields are immutable

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- exactly one permission bit, and it is not a swap bit — [`0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol:56`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `uint160 internal constant BEFORE_INITIALIZE_FLAG = uint160(1 << 13);`
- the address itself is checked to carry only that bit — [`0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol:72`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `if (uint160(address(this)) & ALL_HOOK_MASK != BEFORE_INITIALIZE_FLAG) revert BadHookAddress();`
- the only external entry point is beforeInitialize — [`0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol:79`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `function beforeInitialize(address sender, PoolKey calldata poolKey, uint160 sqrtPriceX96)`
- and it is `view` — it cannot move value — [`0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol:98`](0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000/sources/src/modela/SatoInitGuardHook.sol) — `return SatoInitGuardHook.beforeInitialize.selector;`

### `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` — Clanker Static Fee Hook (Base)

- **contrat** : `ClankerHookStaticFee` (9 fichiers propres, 995 lignes)
- **mesure** : 5 lignes MEASURED sur 5, 1 pools, mediane 19.9402 bps
- **concordance** : concordant — 1 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0002 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap
- **annonce** : yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in `PoolInitialized`; the direction selector is not public in this version
- **modifiable** : written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- the per-swap LP fee is a per-pool stored value, chosen by direction — [`0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol:42`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol) — `? pairedFee[poolKey.toId()]`
- the per-pool fees are public and readable by anyone — [`0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol:12`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHookStaticFee.sol) — `mapping(PoolId => uint24) public clankerFee;`
- the direction selector is internal in v1, so the branch cannot be read on chain — [`0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol:49`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `mapping(PoolId => bool) internal clankerIsToken0;`
- the hook's own cut is 20 % of the LP fee — [`0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol:41`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `uint256 public constant PROTOCOL_FEE_NUMERATOR = 200_000; // 20% of the imposed LP fee`
- capped at 30 % in v1 (10 % in v2) — [`0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol:40`](0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc/sources/src/hooks/ClankerHook.sol) — `uint24 public constant MAX_LP_FEE = 300_000; // LP fee capped at 30%`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc \
  0x2c78f493ff3bddf9647ea19d4563fcb5db0023dc48098e4d127505ac1963a2641a7031f9 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # clankerFee(bytes32)
# -> None
#    soit — bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0xff3bddf9647ea19d4563fcb5db0023dc48098e4d127505ac1963a2641a7031f9' docs/dataset/measurements.jsonl | head -1
# -> bps = 19.9599   (ecart 0.0002 bps)
```

### `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` — LaunchHook

- **contrat** : `LaunchHook` (4 fichiers propres, 1042 lignes)
- **mesure** : 10 lignes MEASURED sur 10, 2 pools, mediane 99.3818 bps
- **concordance** : concordant — 2 concordants / 0 divergents / 0 non resolvables / 0 non verifies
- **ecart maximum mesure − code** : 0.0062 bps (tolerance 0.5 bps)
- **ou est-il pris** : beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output
- **annonce** : yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it
- **modifiable** : no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch

Chaque affirmation ci-dessus tient a ces lignes — toutes verifiees a la generation de ce fichier :

- an unregistered pool is charged nothing — first line of beforeSwap — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:363`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);`
- the fee is taken in beforeSwap by minting a claim to the escrow — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:384`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);`
- and returned as a BeforeSwapDelta on the specified side — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:385`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);`
- otherwise it is taken in afterSwap out of the unspecified side — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:438`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `return (IHooks.afterSwap.selector, totalFee.toInt128());`
- the total decays from an anti-snipe surcharge down to the base fee — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:561`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;`
- the admin-settable base fee is capped at 10 % — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:47`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_BASE_FEE_BPS = 1_000;`
- the total per-swap fee is capped strictly below 100 % — [`0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol:49`](0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc/sources/src/LaunchHook.sol) — `uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;`

Ancres non retrouvees dans le source recupere (l'affirmation correspondante est retiree, pas devinee) : `src/LaunchHook.sol` / `uint16 baseFeeBps; // split creator/platform/referrer`, `src/LaunchHook.sol` / `mapping(PoolId => PoolConfig) public poolConfig`, `src/LaunchHook.sol` / `if (poolConfig[id].initialized) revert AlreadyRegistered()`, `src/LaunchHook.sol` / `emit Trade(id, sender,`

Un exemple rejouable — le taux lu dans le contrat, puis la mesure :

```bash
# le contrat dit :
cast call 0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc \
  0x0885f732221a4ef99beb7d37d31662976ac927151aab59e60826c02da1ea646f7d4ef2e6 \
  --rpc-url "$BASE_RPC_URL" --block 50614000   # poolConfig(bytes32)
# -> None
#    soit 100 bps sur ce pool, cette direction, cette taille

# la mesure dit :
grep '0x221a4ef99beb7d37d31662976ac927151aab59e60826c02da1ea646f7d4ef2e6' docs/dataset/measurements.jsonl | head -1
# -> bps = 99.9938   (ecart -0.0062 bps)
```

## 4. Les hooks dont on n'a pas le source

Ces hooks gardent l'etiquette **« comportement non lu »**. Aucune intention, aucun mecanisme, aucun taux ne leur est attribue — la mesure reste vraie, la lecture n'existe pas.

- `0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088` — 5 lignes MEASURED sur 5, mediane 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - sourcify : `NOT_FOUND`
    - etherscan : `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment

Un `NOT_FOUND` de Sourcify veut dire : Sourcify n'a pas de source verifie pour cette adresse. Il ne veut pas dire que le contrat n'est verifie nulle part, et il ne veut surtout pas dire que le hook ne prend rien.

## 5. Ce que ce fichier ne dit toujours pas

1. **Un taux concordant n'est pas un taux legitime.** Retrouver 100 bps ecrits dans le contrat prouve que la mesure lit le bon nombre. Cela ne dit rien de la question de savoir si ce nombre etait annonce a l'utilisateur au moment du swap.
2. **Le modele de chaque famille est ecrit a la main a partir du source.** Il est cite ligne par ligne et il tombe juste sur 137 pools sur 138, mais c'est une re-implementation, pas le bytecode.
3. **La comparaison est faite a un seul bloc, une seule taille par pool, un seul sens.** La taille de reference est la plus petite dont le bruit d'arrondi est inferieur au dixieme de la tolerance ; les autres tailles s'ecartent du taux pour la raison decrite dans `LIMITS.md` §6, et ce n'est pas un desaccord.
4. **Les hooks font autre chose que prelever pendant le swap.** Plusieurs reclament des frais accumules ou appellent une extension de pool dans le meme callback ; ces appels bougent l'etat du pool avant le swap avec le hook et pas avec le stub. Le modele ne les chiffre pas.
5. **`hookData` est toujours vide** (`engine/tare/quote.py`), donc toute branche pilotee par le routeur n'est pas exercee — y compris les referrals de LaunchHook et les donnees du module MEV de Clanker.

Le reste des limites n'a pas bouge : [`../LIMITS.md`](../LIMITS.md). Les etiquettes : [`../HONESTY.md`](../HONESTY.md). La methode de mesure : [`../METHOD.md`](../METHOD.md).

