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
| corpus rows | 125072 |
| corpus sha256 | `88311616df9f2c3d62b6aed90c566b9f3d680aefb331be65cfd6548dc3ad198b` |
| chain | 8453 (Base) |
| block | 50614000 |
| agreement tolerance | ±0.5 bps |

## 1. Source coverage

**42 of 112** measured hooks have a verified source. **70 of 112** does not, and is treated accordingly (§4).

| hook | registry name | source | provider | match | verified at | own files | own lines |
|---|---|---|---|---|---|---|---|
| `0x00000000000000000000000000000000dead0030` | — | **no** | sourcify | — | — | — | — |
| `0x0469a4bd3724dc86c9542f4694c976da13c450c0` | Zora Hook | yes | sourcify | match | 2026-03-23 | 30 | 2771 |
| `0x0ae73dfa41f1acacf32ad050924384b295e968cc` | ClankerHookStaticFeeV2 | yes | sourcify | match | 2026-07-30 | 12 | 1315 |
| `0x0b6d076d2c68e6abf26aaf40919e84739b7f4145` | — | **no** | sourcify | — | — | — | — |
| `0x0f69bcb0f8f0c210669641c2f39db5c2ca9e00cc` | — | **no** | sourcify | — | — | — | — |
| `0x100d7855adac79d90a75b7a89cf99a9f2b0100c4` | — | **no** | sourcify | — | — | — | — |
| `0x11f2c555b4ab5aae2b2614efd44e6e5ba50100cc` | — | **no** | sourcify | — | — | — | — |
| `0x128bedebaa9304db74726efba848a98e7fb53a80` | — | yes | sourcify | match | 2026-08-28 | 3 | 1115 |
| `0x13b399b5c738a591ae23039ee1ebbb7f660f80cc` | — | **no** | sourcify | — | — | — | — |
| `0x16238679a909ddddebadde0e4cc6badf70b3a5c7` | — | **no** | sourcify | — | — | — | — |
| `0x16c0a78b6fbbc4ee56074954ba9193d1f31e90c0` | — | **no** | sourcify | — | — | — | — |
| `0x19677dfef06669edc9bd4a8ef1a207227b5760c0` | — | **no** | sourcify | — | — | — | — |
| `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` | ClankerHookStaticFeeV2 | yes | sourcify | match | 2026-06-18 | 12 | 1306 |
| `0x1b12abe48a0e1eeac05dbc4a9288520504d6c5cf` | — | **no** | sourcify | — | — | — | — |
| `0x1d118173e0d717d70746adfe730bd4b89d2de044` | — | yes | sourcify | match | 2026-08-27 | 2 | 567 |
| `0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc` | LaunchHook | yes | sourcify | exact_match | 2026-09-02 | 4 | 1079 |
| `0x201c4916c085032fb49f0b778efa98df23672044` | AdvancedFeeHookV5 | yes | sourcify | match | 2026-08-27 | 2 | 567 |
| `0x23321f11a6d44fd1ab790044fdfde5758c902fdc` | Flaunch POSM v4 (Base) | yes | sourcify | exact_match | 2025-10-07 | 29 | 4794 |
| `0x23a82b4d32c5e253689897d87d632dedcdfe20cc` | — | **no** | sourcify | — | — | — | — |
| `0x24e081f4da1ce6f8c194a031ae7aecb7910968cc` | — | **no** | sourcify | — | — | — | — |
| `0x27e626d191cbc159ee161facbd58b366fb82c8c0` | — | yes | sourcify | match | 2026-08-28 | 11 | 1418 |
| `0x2aa659040c4ca704600f4262cc9d0f432d4aa0cc` | — | **no** | sourcify | — | — | — | — |
| `0x2cfa8e228f59dca14ebc5de0311c656c6cb970cc` | — | **no** | sourcify | — | — | — | — |
| `0x2d0d55e8d4418ce6157cf31d9ffafb88117c0040` | — | **no** | sourcify | — | — | — | — |
| `0x331c79a47ef0409eb05c7142ab3262f68315c0cc` | — | **no** | sourcify | — | — | — | — |
| `0x352740b15f14b3cce38d8c2bc466f57e214620cc` | — | **no** | sourcify | — | — | — | — |
| `0x376b786aa1c1deaae37ad6976784eb12988980cc` | — | **no** | sourcify | — | — | — | — |
| `0x3b2b979df21036cee51b8debb13100e2cb8deacc` | LaunchHook | yes | sourcify | exact_match | 2026-08-18 | 3 | 730 |
| `0x3e342a06f9592459d75721d6956b570f02ef2dc0` | UniswapV4ScheduledMulticurveInitializerHook | yes | sourcify | match | 2026-02-10 | 18 | 2302 |
| `0x3e83479b2276ecfb7c7181f67b5d092d3511e0c4` | TruthMarketHook | yes | sourcify | exact_match | 2026-07-01 | 8 | 714 |
| `0x47668d84d299c7732b1f05798e15583ac4fa25c7` | — | **no** | sourcify | — | — | — | — |
| `0x485f5f338b1c5997925663fe46015bd733a8c044` | — | **no** | sourcify | — | — | — | — |
| `0x48a011cb654327c3209c00110832190a364760cc` | — | **no** | sourcify | — | — | — | — |
| `0x4951d0e1cfb915f64ab19aed153bd6305a244088` | Vvveity Fee Hook V2 | yes | sourcify | exact_match | 2026-08-21 | 1 | 276 |
| `0x4d7bc684cc263abe62e2463eade03104732525c7` | — | **no** | sourcify | — | — | — | — |
| `0x4db263809e6ea36d223161535173a01b5b3240c0` | DynamicFeeHookV2 | yes | sourcify | exact_match | 2026-09-03 | 2 | 320 |
| `0x5641f004773b348b9498bdccb728a9db56bc80c4` | — | **no** | sourcify | — | — | — | — |
| `0x588c683ecc450f8b2aadb13d7f63792b840425dc` | Flaunch PositionManager | yes | sourcify | match | 2026-08-26 | 39 | 5882 |
| `0x5f3e9830be71ced621c62743c8451a37eb2310cc` | — | **no** | sourcify | — | — | — | — |
| `0x6e4e217ac96721cb12c9ba66e68090a098102acc` | — | **no** | sourcify | — | — | — | — |
| `0x702b1fe403ec993a102adde47f2ab52eb2eadacc` | StonkHook | yes | sourcify | exact_match | 2026-08-27 | 2 | 617 |
| `0x78a9763f7dc8c0fb80b037a379e82ddcc54a50cc` | — | **no** | sourcify | — | — | — | — |
| `0x7dbaf6df37436da054d95a845ad5e4cd42c500c4` | — | **no** | sourcify | — | — | — | — |
| `0x7f1d86c9e8811346f85e3e12a42d6d62184c0a44` | — | **no** | sourcify | — | — | — | — |
| `0x802b438db6db843422afc9a8202db8d1521110cc` | — | **no** | sourcify | — | — | — | — |
| `0x805975d27518e3e23c4838802d9dda7302dca044` | AdvancedFeeHook | yes | sourcify | match | 2026-08-17 | 2 | 477 |
| `0x80e2f7dc8c2c880bbc4bdf80a5fb0eb8b1db68cc` | Liquid Dynamic Fee Hook V2 | yes | sourcify | match | 2026-04-11 | 12 | 1532 |
| `0x81afcad9595050c76f96e82ec1ad8c39ddae00c4` | — | **no** | sourcify | — | — | — | — |
| `0x82ff97062ad0c9bbe3d0355831109ed7ac41a044` | — | **no** | sourcify | — | — | — | — |
| `0x84bbab8cac69bf6711ba81f9915dc346f4cf2088` | RwagmiHookV2 | yes | sourcify | match | 2026-06-26 | 5 | 557 |
| `0x892d3c2b4abeaaf67d52a7b29783e2161b7cad40` | UniswapV4MulticurveInitializerHook | yes | sourcify | match | 2025-10-30 | 16 | 2087 |
| `0x899c3260de6f3f8109e6e7ea0eb2d1a751a480c4` | — | **no** | sourcify | — | — | — | — |
| `0x8e7640e6bbcc483be39c9898a41dae86013368cc` | ClankerHookStaticFeeV2 | yes | sourcify | match | 2026-05-20 | 12 | 1290 |
| `0x8f29bd5c8429730fa4c46e6295c4e679ededd0cc` | Aegis | yes | sourcify | match | 2026-05-25 | 68 | 6912 |
| `0x920f85baf26c38993360616f52c4cac798c5c0c4` | — | **no** | sourcify | — | — | — | — |
| `0x92708e7d3b91d7931c437d74743cb586378280cc` | — | **no** | sourcify | — | — | — | — |
| `0x963e91a45148b39737b9df10c5b897b55ca9e8cc` | Bonker Dynamic Fee Hook (Base) | yes | sourcify | match | 2026-06-30 | 12 | 1509 |
| `0x9811f10cd549c754fa9e5785989c422a762c28cc` | LiquidHookStaticFeeV2 | yes | sourcify | match | 2026-03-25 | 12 | 1311 |
| `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` | LaunchHook | yes | sourcify | exact_match | 2026-07-10 | 3 | 730 |
| `0x990500a7354f66454e08fb5967af2a41ba7e00c4` | — | **no** | sourcify | — | — | — | — |
| `0x99a680fbb9010213f356680a3897791aa9f52044` | — | **no** | sourcify | — | — | — | — |
| `0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145` | — | **no** | sourcify | — | — | — | — |
| `0x9d88b5c59a25c3a58566de4ecacb1a2e555270cc` | — | yes | sourcify | exact_match | 2026-08-27 | 2 | 321 |
| `0xa10a6f4b918e963ec8694d37aa22e438706fe8cc` | ClankerHookStaticFeeV2 | **no** | sourcify | — | — | — | — |
| `0xa2d523d2da40f34c5bb58f528218e9cb7f4a40c4` | — | **no** | sourcify | — | — | — | — |
| `0xa3d67ad7458302a87e3f3c0a833ce11185f0c080` | — | **no** | sourcify | — | — | — | — |
| `0xa41844f273c2e624fe80a037c5323f124219c040` | — | **no** | sourcify | — | — | — | — |
| `0xa4b8ceab9b8663394d48f1df0fdcc1e7237680cc` | — | **no** | sourcify | — | — | — | — |
| `0xa74562863529b72b04368ca5efafd96c4741aaec` | — | yes | sourcify | match | 2026-08-18 | 1 | 467 |
| `0xa848e063a63d164f2a25d71446c90449b9ba6040` | — | **no** | sourcify | — | — | — | — |
| `0xac4b3944c351b6641fdd85a192cf6ddf84b3facc` | BDeFiHook | yes | sourcify | match | 2026-08-13 | 17 | 2913 |
| `0xacc700fef049865e42797d9b92e5d7a416dd8040` | — | **no** | sourcify | — | — | — | — |
| `0xacf358b129423f0107b0bf892b3eff6c770128cc` | ZNS Launchpad | yes | sourcify | match | 2026-06-24 | 9 | 962 |
| `0xaf07116f1892c5fae4b55234a57ea20cf4e960cc` | — | yes | sourcify | match | 2026-08-27 | 20 | 6278 |
| `0xb15540c833f49674b5af54f6e8d3f8d65d8bc044` | — | **no** | sourcify | — | — | — | — |
| `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` | Clanker Static Fee Hook v2 (Base) | yes | sourcify | match | 2025-09-16 | 12 | 1283 |
| `0xb6394ef82ce153d351bcee81b9ee310c47348acc` | — | **no** | sourcify | — | — | — | — |
| `0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088` | — | **no** | sourcify | — | — | — | — |
| `0xba83ee6969d09ceb8a4827c3ed77413c75392044` | AdvancedFeeHookV5 | yes | sourcify | match | 2026-09-01 | 2 | 567 |
| `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` | DecayMulticurveInitializerHook | yes | sourcify | match | 2026-02-12 | 18 | 2424 |
| `0xbbecf9319f341deaec5f8454e74dbccf63409040` | — | **no** | sourcify | — | — | — | — |
| `0xbbf0b679aee2d9e158730280a29e31e3875065c7` | — | **no** | sourcify | — | — | — | — |
| `0xbd00cfb22b196ed2d774cc9466715ba23c640a44` | — | **no** | sourcify | — | — | — | — |
| `0xbdf938149ac6a781f94faa0ed45e6a0e984c6544` | DopplerHookInitializer | yes | sourcify | match | 2026-03-24 | 18 | 2589 |
| `0xbe7944e52b97d3b86e975ab8c0b19ea051754040` | — | **no** | sourcify | — | — | — | — |
| `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` | — | yes | sourcify | exact_match | 2026-08-23 | 2 | 204 |
| `0xc75a2eb1ef9c3fe2f41adf73036984b16f6d28cc` | — | yes | sourcify | match | 2026-08-27 | 4 | 496 |
| `0xc783f473fe15f0ffc372930a20096eed28764044` | — | **no** | sourcify | — | — | — | — |
| `0xc90eddf51569270e06270ea98f7efff828dde0cc` | — | **no** | sourcify | — | — | — | — |
| `0xcca1d925ea4e397b6d7b2a0065a316c027d380cc` | — | **no** | sourcify | — | — | — | — |
| `0xccd1eabb94f111e5b7673e5cb7a315dfcda870c4` | — | **no** | sourcify | — | — | — | — |
| `0xcee1c8061f17164390b7f392587d3a53d8acc0cc` | — | **no** | sourcify | — | — | — | — |
| `0xd238b0054a92d96907e8c1f009da24ea560be0cc` | — | **no** | sourcify | — | — | — | — |
| `0xd3200486161288d4ea021c13f32a198bdeb080cc` | — | **no** | sourcify | — | — | — | — |
| `0xd60d6b218116cfd801e28f78d011a203d2b068cc` | Clanker Dynamic Fee Hook v2 (Base) | yes | sourcify | match | 2025-09-16 | 12 | 1504 |
| `0xd734ffd79a9c3719025ec0d39492943b6ef620cc` | — | **no** | sourcify | — | — | — | — |
| `0xd7b5de859876c8c2748271c2f5f7b765d24340cc` | — | **no** | sourcify | — | — | — | — |
| `0xd8a63c167d5509d433d23659ba87cae2b87200c4` | — | **no** | sourcify | — | — | — | — |
| `0xdc786b620004ab27fe37380322416c9b4900f0cc` | — | **no** | sourcify | — | — | — | — |
| `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` | Clanker Static Fee Hook (Base) | yes | sourcify | match | 2025-08-14 | 9 | 995 |
| `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` | LaunchHook | yes | sourcify | exact_match | 2026-08-27 | 4 | 1042 |
| `0xdf5aa675ad2d7dd62b94aafd94ef171c84604044` | — | **no** | sourcify | — | — | — | — |
| `0xdfe0f6d6cdda8f8ea47d6c5bddbdea51425290c0` | HomelanderUniV4Plugin | yes | sourcify | exact_match | 2026-06-26 | 5 | 337 |
| `0xed14ee7501fb212f876714a68308564cd6772000` | — | yes | sourcify | match | 2026-09-06 | 14 | 3563 |
| `0xefc1713454c726cf0f525ae26c6f1688b9e1a0c0` | — | **no** | sourcify | — | — | — | — |
| `0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044` | — | **no** | sourcify | — | — | — | — |
| `0xf52c1d5f3b0e985248870b648dc374a3c77c80cc` | — | **no** | sourcify | — | — | — | — |
| `0xf6ee4dc7d26790f62d617e58094136f9725f8880` | — | **no** | sourcify | — | — | — | — |
| `0xf85f1f3082cfbc5e1149972309b25054e4d420cc` | B20Hook | yes | sourcify | match | 2026-07-31 | 1 | 362 |
| `0xfb4445a99c0ec221791afa991af1297f84b0e0cc` | — | **no** | sourcify | — | — | — | — |
| `0xfdc5cb0ba5c7a7f9724db73d9922912b6ee990cc` | — | **no** | sourcify | — | — | — | — |
| `0xfe2097a7b5a6a5880517987f5a602f583d3700c4` | — | **no** | sourcify | — | — | — | — |

Provider: [Sourcify v2](https://sourcify.dev), `/v2/contract/8453/<address>?fields=sources`. Every file returned is stored under `docs/hooks-source/<address>/sources/` and hashed in `provenance.json`; "own files" counts the ones that are not a vendored copy of OpenZeppelin, v4-core, Solady and friends (`engine/tare/source/fetch.py`, `VENDOR_SEGMENTS`).

The Etherscan v2 fallback exists in `fetch.py` and **could not be asked**: no `ETHERSCAN_API_KEY` is configured in this environment. That is recorded as `UNAVAILABLE` in each `provenance.json`, never as `NOT_FOUND`. A provider we could not reach is not evidence about a contract — honesty rule 3, and the reason [`HONESTY.md`](../HONESTY.md) exists at all.

## 2. Hook by hook

| hook | measured bps (median) | rate in the code | concordance | where is it taken | announced | modifiable | source |
|---|---|---|---|---|---|---|---|
| `0x00000000…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x0469a4bd…` Zora Hook | 100 | `LP_FEE_V4 = 10000 pips (constant)` ×1609 | **partial**, 1583/1609 pools, max gap 99 bps | beforeSwap — returns a fee with `OVERRIDE_FEE_FLAG`, so the PoolManager charges the hook's number as the LP fee for that swap | yes — a named constant with a NatSpec comment saying 1 %, and the decay window is documented in the same file | no — `LP_FEE_V4` is `constant`, fixed in the deployed bytecode; only a redeploy through the upgrade gate can change it | yes |
| `0x0ae73dfa…` ClankerHookStaticFeeV2 | — | — | **no rate in the code** | — | — | — | yes |
| `0x0b6d076d…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x0f69bcb0…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x100d7855…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x11f2c555…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x128bedeb…`  | 0 | — | **no rate in the code** | — | — | — | yes |
| `0x13b399b5…`  | 4999.1029 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x16238679…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x16c0a78b…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x19677dfe…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x1aea38f0…` ClankerHookStaticFeeV2 | 99.2644 | `LP 10000 pips + carve 0` ×10<br>`LP 69000 pips + carve 0 (pool already at 69000 pips)` ×1<br>`LP 69000 pips + carve 0` ×1 | **concordant**, 12/12 pools, max gap 0.0005 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0x1b12abe4…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x1d118173…`  | 100 | — | **no rate in the code** | — | — | — | yes |
| `0x1f91c998…` LaunchHook | 78.4708 | — | **no rate in the code** | — | — | — | yes |
| `0x201c4916…` AdvancedFeeHookV5 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0x23321f11…` Flaunch POSM v4 (Base) | 99.93 | — | **no rate in the code** | — | — | — | yes |
| `0x23a82b4d…`  | 499.9777 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x24e081f4…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x27e626d1…`  | 40.6967 | — | **no rate in the code** | — | — | — | yes |
| `0x2aa65904…`  | 279.9984 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x2cfa8e22…`  | 299.9789 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x2d0d55e8…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x331c79a4…`  | 298.7717 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x352740b1…`  | 0.0002 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x376b786a…`  | 4999.2281 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x3b2b979d…` LaunchHook | 0 | `baseFeeBps = 100` ×280 | **not resolvable**, 0/280 pools, max gap — bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |
| `0x3e342a06…` UniswapV4ScheduledMulticurveInitializerHook | 0 | — | **no rate in the code** | — | — | — | yes |
| `0x3e83479b…` TruthMarketHook | 79.1419 | — | **no rate in the code** | — | — | — | yes |
| `0x47668d84…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x485f5f33…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x48a011cb…`  | 210 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x4951d0e1…` Vvveity Fee Hook V2 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0x4d7bc684…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x4db26380…` DynamicFeeHookV2 | 299.9995 | — | **no rate in the code** | — | — | — | yes |
| `0x5641f004…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x588c683e…` Flaunch PositionManager | 99.9995 | — | **no rate in the code** | — | — | — | yes |
| `0x5f3e9830…`  | 149.9499 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x6e4e217a…`  | 99.9891 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x702b1fe4…` StonkHook | — | — | **no rate in the code** | — | — | — | yes |
| `0x78a9763f…`  | 149.9499 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x7dbaf6df…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x7f1d86c9…`  | 99.9983 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x802b438d…`  | 250 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x805975d2…` AdvancedFeeHook | 200 | — | **no rate in the code** | — | — | — | yes |
| `0x80e2f7dc…` Liquid Dynamic Fee Hook V2 | 64.5422 | — | **no rate in the code** | — | — | — | yes |
| `0x81afcad9…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x82ff9706…`  | 100 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x84bbab8c…` RwagmiHookV2 | 0 | — | **no rate in the code** | — | — | — | yes |
| `0x892d3c2b…` UniswapV4MulticurveInitializerHook | 0 | — | **no rate in the code** | — | — | — | yes |
| `0x899c3260…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x8e7640e6…` ClankerHookStaticFeeV2 | 0 | — | **no rate in the code** | — | — | — | yes |
| `0x8f29bd5c…` Aegis | 29.9597 | — | **no rate in the code** | — | — | — | yes |
| `0x920f85ba…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x92708e7d…`  | 2806.9087 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x963e91a4…` Bonker Dynamic Fee Hook (Base) | 19.5618 | — | **no rate in the code** | — | — | — | yes |
| `0x9811f10c…` LiquidHookStaticFeeV2 | 19.9422 | `LP 10000 pips + carve 2000 pips (pool already at 10000 pips)` ×87<br>`LP 15000 pips + carve 3000 pips (pool already at 15000 pips)` ×7<br>`LP 10000 pips + carve 2000 pips` ×4<br>+1 more | **partial**, 99/100 pools, max gap 1.3775 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `liquidFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, capped by a public constant | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0x985c14ba…` LaunchHook | 99.9557 | `baseFeeBps = 100` ×1218 | **concordant**, 1158/1218 pools, max gap 0.0003 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |
| `0x990500a7…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x99a680fb…`  | 99.9992 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x9ce0e33e…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0x9d88b5c5…`  | 299.9894 | — | **no rate in the code** | — | — | — | yes |
| `0xa10a6f4b…` ClankerHookStaticFeeV2 | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xa2d523d2…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xa3d67ad7…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xa41844f2…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xa4b8ceab…`  | 4999.3272 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xa7456286…`  | 199.9423 | — | **no rate in the code** | — | — | — | yes |
| `0xa848e063…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xac4b3944…` BDeFiHook | 1702.7335 | — | **no rate in the code** | — | — | — | yes |
| `0xacc700fe…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xacf358b1…` ZNS Launchpad | 98.2518 | — | **no rate in the code** | — | — | — | yes |
| `0xaf07116f…`  | 264 | — | **no rate in the code** | — | — | — | yes |
| `0xb15540c8…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xb429d62f…` Clanker Static Fee Hook v2 (Base) | 20.0492 | `LP 10000 pips + carve 2000 pips (pool already at 10000 pips)` ×446<br>`LP 10000 pips + carve 2000 pips` ×414<br>`LP 30000 pips + carve 6000 pips (pool already at 30000 pips)` ×175<br>+9 more | **partial**, 1020/1171 pools, max gap 9979.5279 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings, emitted in `PoolInitialized`, and capped by a public constant | the per-pool fees are written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0xb6394ef8…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xb995b9ef…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xba83ee69…` AdvancedFeeHookV5 | 100 | — | **no rate in the code** | — | — | — | yes |
| `0xbb7784a4…` DecayMulticurveInitializerHook | 0 | — | **not measurable** | beforeSwap — the hook rewrites the pool's liquidity distribution before the swap runs, which is why removing its bytecode removes the venue rather than a fee | there is no per-swap rate to announce; the fee split is beneficiary shares | the curve decay is driven by time and by the initializer's own state | yes |
| `0xbbecf931…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xbbf0b679…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xbd00cfb2…`  | 99.9992 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xbdf93814…` DopplerHookInitializer | 105 | `endFee = 10500 pips` ×528<br>`endFee = 15000 pips` ×327<br>`endFee = 17500 pips` ×58<br>+3 more | **partial**, 914/965 pools, max gap 104.25 bps | afterSwap — the initializer asks a per-pool delegate for an amount, takes it from the PoolManager and returns it as the unspecified delta | in the delegate, yes: `getFeeSchedule` is a public mapping with start/end fee and a duration. In the hook the PoolKey names, no: the rate is not there at all | the delegate can push a new dynamic LP fee at any time, capped at 10 %; the schedule itself is written at pool initialization | yes |
| `0xbe7944e5…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xc71b7fa5…` SatoInitGuardHook | 0 | `no swap callback exists` ×1 | **concordant**, 1/1 pools, max gap 0 bps | nowhere — the contract implements `beforeInitialize` and nothing else | not applicable: there is no fee to announce | no — no owner, no setter, no storage; both fields are immutable | yes |
| `0xc75a2eb1…`  | 198.9972 | — | **no rate in the code** | — | — | — | yes |
| `0xc783f473…`  | 100 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xc90eddf5…`  | 299.7845 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xcca1d925…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xccd1eabb…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xcee1c806…`  | 249.9951 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xd238b005…`  | 499.9694 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xd3200486…`  | 298.7782 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xd60d6b21…` Clanker Dynamic Fee Hook v2 (Base) | 119.7485 | — | **no rate in the code** | — | — | — | yes |
| `0xd734ffd7…`  | 499.9777 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xd7b5de85…`  | 4999.2558 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xd8a63c16…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xdc786b62…`  | 299.9935 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xdd5eeaff…` Clanker Static Fee Hook (Base) | 19.9554 | `LP 10000 pips + carve 2000 pips` ×4 | **concordant**, 4/4 pools, max gap 0 bps | beforeSwap (BeforeSwapDelta on the input) or afterSwap (delta on the output), plus the pool's LP fee set for the swap | yes — per-pool `clankerFee` / `pairedFee` are public mappings and emitted in `PoolInitialized`; the direction selector is not public in this version | written once at pool initialization by the factory; the protocol-fee share is a public constant in the bytecode | yes |
| `0xdda9bc41…` LaunchHook | 99.9938 | `baseFeeBps = 100` ×10 | **concordant**, 10/10 pools, max gap 0.0001 bps | beforeSwap when the quote currency is the specified side (a BeforeSwapDelta on the input, minted to a FeeEscrow), otherwise afterSwap on the output | yes — the whole per-pool config is a public mapping, a `PoolRegistered` event carries the fee, every swap emits `Trade` with the amount, and two public constants cap it | no — `registerPool` reverts with `AlreadyRegistered` if the pool already has a config, and there is no setter; the config is frozen at launch | yes |
| `0xdf5aa675…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xdfe0f6d6…` HomelanderUniV4Plugin | 0 | — | **no rate in the code** | — | — | — | yes |
| `0xed14ee75…`  | 0 | — | **no rate in the code** | — | — | — | yes |
| `0xefc17134…`  | — | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xf4c3801c…`  | 1.0129 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xf52c1d5f…`  | 4994.1452 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xf6ee4dc7…`  | 1788.1454 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xf85f1f30…` B20Hook | 99.9691 | — | **no rate in the code** | — | — | — | yes |
| `0xfb4445a9…`  | 499.9722 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xfdc5cb0b…`  | 249.8998 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |
| `0xfe2097a7…`  | 0 | **behaviour not read** | — | **not read** | **not read** | **not read** | no |

Across the 112 hooks: **4801 pools where the measurement lands on the number written in the contract**, 94 where it does not, 442 where the pool cannot resolve the rate at all, 33 unverified — **4801/4895** of the comparable pools, within ±0.5 bps.

The instrument never read any of these contracts. It replaced 89 bytes of bytecode and quoted the same swap twice.

## 3. Each hook, with the lines

### `0x0469a4bd3724dc86c9542f4694c976da13c450c0` — Zora Hook

- **contract**: `ZoraV4CoinHook` — 30 own files, 2771 lines
- **measured**: 19023 MEASURED rows of 26352, 1647 pools, median 100 bps
- **concordance**: partial — 1583 concordant / 22 divergent / 4 not resolvable / 0 unverified
- **largest gap measured − code**: 99 bps (tolerance ±0.5)
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

- `0x03f83279e7c059155ff96a593c495de752b892af268ea71d69aee012f5f0a0a0` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x096809d3fafb666d90600ad62cabab0601d77f1939a56048ff9141557663fc16` — **divergent**. Measured 33.6831 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x1a2340b6efbc47c21dc1a3b3c574e7bac54cfbafd97fa1ca389e87b7ac4aa778` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x1c9fb85153443e6bd09f30a127fab9cc6f388cf8acbe6ef91bb73b603a169fd3` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x1d769ad618caf5446dfd36ab7c0a01788fb273fce24a4c95b06f1c30e780974d` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x1fe56b32def51b84a6c436591e8b86c197fa82bd57b7697ddd106cfe1be419c9` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x265b556b0b5d3a278f70702a9d2a87937f3a423092341fcc4d61544126d0fc1e` — **not resolvable**. Measured 100 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity -0.0876: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x299ca42fee9c8df553f3d6bc846ef0763bbe29dd36ad925a156b247fe0894a00` — **divergent**. Measured 46.407 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x2bd4afd3ac8bf0b691c22704cbccc1a520e93fc38199f778cc4fe764c4736038` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x33c6bd35d7b94a0b4e09ce45cdd92712571d18f8d8b19905512f370764ab9fff` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x3c9c5f77e090e023fe21aeecf461c5edc9abb74b2c05a72da84f811b8f5c4879` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x3eec65c857da8195a0dd5efd69a40a731c3791d58df87061438c0a9a46bde604` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x578bce7282f87b382ff4e469f3217de0f4ade012f5be029dbe1a11daf1973b29` — **not resolvable**. Measured 100 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity -0.111: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6298cd79fd84377866d3885809ca520ac256fe8a0ea9c60d4d3a4fdf7c3e503d` — **not resolvable**. Measured 100 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity -0.105: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7a07ea00c3b3045b61191c033934365ec2b8c38646b784d54eb943e3f3db92ac` — **not resolvable**. Measured 100 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity -0.111: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x83d6258c6aa43d00f84e2d032ad158a6a41e0159d904d2105a16852f24fa9a2c` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x8980cf2c6de12326050297b1245d89e7b6fe9bd1c0ed270b0222186846025126` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0x98c0dff3ba66e991b7168b235d727ee0ae959e3a993ef3456d1d7051583ae877` — **divergent**. Measured 28.4858 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xbec75e2642746ac5548254203865741f13f70a5c840775444a8fa2f3925f6e62` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xc4f1a97fdd533cc62939984cdccaec9414a9b3f3bd851601e45358383a843095` — **divergent**. Measured 46.4073 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xd2969d4474c373b2bf9d6b68b6d41bce3e1db1af2370f4f8d2ea78cf39ed9a8c` — **divergent**. Measured 25.3477 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xdb7caec6c3f973102b800622f29f50928ea5dc0c1a4183e62b63f8b7a77d7a65` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xdd3cc3a08e5037d92e43ed15396ede62ba883a189f8fad77a78d9fac108d2928` — **divergent**. Measured 26.531 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xe5fc5d16c9c1a7535c66a05db570ae01c867984809131b3dd11e60e3bdf64884` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xef5eecb07994ade6ec8632f9cc13d4e9bcca82b024da11e04420defceb3d4d78` — **divergent**. Measured 1 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %
- `0xfbdb9184555b30f8d1962b928d4987ef088f68774dbdbe6ec8bddf3450a98a71` — **divergent**. Measured 26.2789 bps at amount_in 1000000000000; the code says 100 bps. steady-state fee; the first 10 seconds after a coin is created carry a decaying launch fee that starts at 99 %

### `0x0ae73dfa41f1acacf32ad050924384b295e968cc` — ClankerHookStaticFeeV2

- **contract**: `—` — 12 own files, 1315 lines
- **measured**: 0 MEASURED rows of 16, 1 pools, median — bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x128bedebaa9304db74726efba848a98e7fb53a80` — None

- **contract**: `—` — 3 own files, 1115 lines
- **measured**: 11 MEASURED rows of 16, 1 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc` — ClankerHookStaticFeeV2

- **contract**: `ClankerHookStaticFeeV2` — 12 own files, 1306 lines
- **measured**: 104 MEASURED rows of 192, 12 pools, median 99.2644 bps
- **concordance**: concordant — 12 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0005 bps (tolerance ±0.5)
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
#      = 100 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x2af3a2f295c91c9774a3499207e87febf2cb9a35b18b7f1b9c079502bc17cd85' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 99.9999 bps at that size (gap -0.0001 bps)
```

### `0x1d118173e0d717d70746adfe730bd4b89d2de044` — None

- **contract**: `—` — 2 own files, 567 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc` — LaunchHook

- **contract**: `—` — 4 own files, 1079 lines
- **measured**: 92 MEASURED rows of 144, 9 pools, median 78.4708 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x201c4916c085032fb49f0b778efa98df23672044` — AdvancedFeeHookV5

- **contract**: `—` — 2 own files, 567 lines
- **measured**: 198 MEASURED rows of 240, 15 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x23321f11a6d44fd1ab790044fdfde5758c902fdc` — Flaunch POSM v4 (Base)

- **contract**: `—` — 29 own files, 4794 lines
- **measured**: 144 MEASURED rows of 144, 9 pools, median 99.93 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x27e626d191cbc159ee161facbd58b366fb82c8c0` — None

- **contract**: `—` — 11 own files, 1418 lines
- **measured**: 7 MEASURED rows of 16, 1 pools, median 40.6967 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x3b2b979df21036cee51b8debb13100e2cb8deacc` — LaunchHook

- **contract**: `LaunchHook` — 3 own files, 730 lines
- **measured**: 2446 MEASURED rows of 4480, 280 pools, median 0 bps
- **concordance**: not resolvable — 0 concordant / 0 divergent / 280 not resolvable / 0 unverified
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

- `0x026b6d463b729ddea1556befe99c771f77b59baa276556d6d3dbec3721a90151` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x071701585aeee1d9f5158caf1bd8db2f27575941db4324a0ab6a9e2c6e5d2de9` — **not resolvable**. Measured 0.1893 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000188: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x076f100b2343e220cf6fe39ebbe883ccbb2e68edba3a0736b6569c8df916f8be` — **not resolvable**. Measured 0.1372 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000136: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x089c4618d24f26f65802c8a6f1c0581c2be4e022744d07c57e3c5bf5e0c4d75d` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x09235e2ba74a2820fb6962c84d1f06f497e0677ae4ae9ef27bcfd5126abd3ca8` — **not resolvable**. Measured 0.1862 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000185: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x09d598f4ba6a87470d2251b4671f2aafe282da5c718f8f7950472d835faa5b91` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x09f3501d28c06ed2de0f11aca1d203d246e6ec60a9619ac6489d589d458c04bb` — **not resolvable**. Measured 0.1399 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000139: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0cf1bb7e2692763ada87da890eab6b35863829b676912a20c93713ccc72524f6` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0d7ea7be5a21c030d5fce6d3f6fcf1dfaa9cf406a6a2185bb23a22671fd09f41` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0e28c212b27ad7a69b562f4de0c5d844d0257ed3a04413a7bfd2ba2888d2ddff` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0eeba01f8454d5050e27b0d363bbcb5e429af4efbd6c9ce3a2508c1b66a1578d` — **not resolvable**. Measured 0.1855 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x11120b880f4faf0590d08cacf71f531b8fc3444ba7c6496e9e4972036a4e2f5c` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1148f60d252f1de7923b7c235bb954e7c7eee964bfbadad6cf72d10e47bf24e0` — **not resolvable**. Measured 0.1858 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x11b58083af1852846a9d31360e7f79336cae1fbfc34e287a276ff2e2fc4cf8d7` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1358b26f03a32d3d069016a57a924f09a23ccbf0a3924dadd28402026a35bc01` — **not resolvable**. Measured 0.0865 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 8.57e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1396acaaa9ad975a52798d9bf9f7f7500d8276ab12d87f1a078443050ee699d6` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x14a83f10a9f3981d44d9cfd115d371311c6a24ecee23dbabdcf2be6891811cc7` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x15ade65a3cc172ed198beea8f72828bb59591257fcb45f11df6173a3854269de` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x169010c3f471c24247aae349ad26c05f6ae1ecfd270bc2e937718f49a8545e74` — **not resolvable**. Measured 0.1893 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000188: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x17e4dd8dd4517911132dd758f37ad14ae783dd97dab0ac3a38ebd62445cf42f8` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x182e0013357c41decf81b78a200dab85df3abff0a582ba7d38136bcf8e322dee` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1a566fdb9e9dca079c9356aa91dc0ba881d06dba5d6006ab83e497907e080548` — **not resolvable**. Measured 0.1274 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1ae9edd6cfb6d156916607cb9e173a6481cc8bc51d58718c1e5c612a9555bcfa` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1b8580729640d3e6f25177268f0bae333b7c5740c0863908c133b90329792541` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1bb5e042e1dd4478aa83887ce39d56a8bac806447031bc6d38e1b1cc32310908` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1c700d6ff35e6283d591944908d2606d82d67011b336b53bdb726d3aa399c21a` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1d697269e5f70f3164b5cb7d89904d2ee649797c9468fcd6d7af38af9f601e73` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1e905fb1e1b2e762f9870d5bc02de6d960f5cd46151dca710ffc2a46000946eb` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1e99e9db190f87c99140af55b0671f2221ce48cc33d534b00fe1663926df42fe` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1eac2d87ec11261d48ee319e05f344b1c0b20803473f5b4e6bab4c90b5ff4c57` — **not resolvable**. Measured 0.1172 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1fad50cf1ab8d3bd38a5737193ccbbc8e20f564b7c8ca12e690e81e07e89806e` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x21399eec3586e02ef7e0f07426d2994c5773d98ce9b02d2e055f319d3441c9bd` — **not resolvable**. Measured 0.1483 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000147: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x238021e711697204a31662334b0ee1f2c2c9f7fe8c05cf0cfa9d01e5b5c20538` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2387344f8cd73f352f10f1a075894a76a80479ec1113649d4f4a7d9290fbd981` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x259851901272f41f12bc3c0039a3a889dcc7515518d6403e757b2659316515f6` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x262c82c2465fe237edceb9e5c26aeedcd719481604ab95cd6b0c05c8fe21d69c` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2658cb76f72c52f392956b996664869890e4712ac3d6e080e71c5b45e733216b` — **not resolvable**. Measured 0.1225 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000121: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x27a21865db2ba52e4cb75dd35592c63414bdab15c1b2a57b9c5d358c9055af93` — **not resolvable**. Measured 0.1862 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000185: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x287d12a95524b424f7b50cd56f948cffea533403ab26e7a118d3948cb0297a43` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x28ad8c6fb7675da450415308152220ee8d39dacb869580802cbcc2bc63f02c3b` — **not resolvable**. Measured 0.1902 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000189: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x29115077b6c23df22dc89f490f37e3945c61d7dbd44fe20e839629dae4c01776` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x29eff9950f243f28691c4adef211f3165accc6124f1549a7369da2cba868cb1a` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2a2f77325ede4d836c4b12dd0975b50da977a84206254f5b4a558ef2a5a84867` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2a4e449b1d4e7994092693fdf517ac86e56ad25192cb855c81d9a76a4e469dd3` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2ab53872843560bc7e073432ad6a095992d641487f002ddf24f844b86ae88c25` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2bc73f328d655621b5d61e009a0847fcb58fe8c48facb4719c70146e6a59d596` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2c3b5c818f52a9b022409c3d243fdb97fbddc0d787e4168e630888ba91cd532d` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2db14b1a37b0006b680385f5c214be20acb37a3eb069485ae7e58939762ceffe` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2eb9b1383dab925f8aaedfa02d186fd435102b97c710c734546c265f5093b83d` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2ebc251b5a7c15af65373ea0f2ccda4356251ecbea8e75ae5aec2702457358ea` — **not resolvable**. Measured 0.0665 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 6.59e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2efdc3de3d8392f98134910e76f30f76ae3d87461fb8337731aa6f743de65de0` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x307032d6ca04c10a7460672341833f545c7c65670e08cb3804f314fe1af4ad3c` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x307642edc98ebe72fc06323278355ce3b1f7675f2ea4ca182942b61ae2213b75` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x30e98c3ced09f4e88103992b1a768fd34409ecaaf4046d1f28eab9541c6381aa` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x30efaaa40913ec7d6675a3f78a8971057113103f6b3567332a0b2ad455a6ebc1` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x30fff0f9a7630db9167f21b7a0f476b2cc047161e8c1592f1e72e4bffad28eaa` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x321d0e58b7013e7ab0150c4611a8753a27944bde963916118000dede246cb1d2` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3365d993698b64bf1b52780a6e816569f2a1ef36ca1b9c59dd4f698def3d7356` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x33709f0336dc65fecbb4c004f950d89e855c72172376dbcd06ed71ae16260383` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3376097c85a2deed62580601b0a689553850a216f679e4f92fa766fb35c20d09` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x340599ce42109f5de8ab2658d8c3f328d03350f2f7fa8c860ff72eb8dc9382ae` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x34a0691946c35a1526d81d85ea96fd967b274649f8082fe7c76fb2f9fdcfbd74` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x34b714bb1df8d918f1ca7a62dccdff00f6833f08c98d3e157ee2c9df397399c3` — **not resolvable**. Measured 0.2115 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00021: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x354bc827bf943a9533ed3c9e07bb66fdb016c72cadb9f615263de2ea6972a244` — **not resolvable**. Measured 0.074 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.33e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x368f10ab57d991b033f846099c7e0af67773c1741996d8d2d6fe33fac63e88a5` — **not resolvable**. Measured 0.0742 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.35e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x371fbcf770a2df1b31951c5ef045e04b1faf18c37849d90d2bc821bdc15b9a9c` — **not resolvable**. Measured 0.1388 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000138: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x37c427c3301068fd790e9e7cb70c897c59e2bdc17d5ece93303e5e3da998cb26` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x37cc13d16d20e256abb1fb2eeb58ddf660bbfb7ce6feea26f81b787284749a9d` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x388a8ddc549fe51d4221aa89bf24c8a32873a4c8c4eed439dc8424bd7dac5ef2` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x398808957d099388f31810216d5dec0fa5788f5f19f790a90f779024d78e8507` — **not resolvable**. Measured 0.1668 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000165: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3aa54a1e2012d498402a7fc1a30aa36f3ce46ce66286b3f15718cf370b2b296f` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3b4a1504e59b89dd7dc9d10b792959eaa15f7ffa21cdd48f5a67f3b0d7fa9ee4` — **not resolvable**. Measured 0.1859 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3c4aef2759a19641c2fc5ee70ecb805a49c1f0ddb301705094d57bb63de56bdc` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3d3ace13d6da1167677c97c5fa6ec4f84181237bb8aded665833d9dfb47f0ac9` — **not resolvable**. Measured 0.1899 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000188: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3e53e979effc8f7796b5abaec5a65e341fc845302173b49d949daf0044542d00` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3e6f2b76a79cf08f6657214fe61434c1444cf9d5c958a408886ad3cd822d06fb` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3f61c0e079bdbfad1e7f2580edcb3ff219a5f49897a18bb52895ca9b228e904c` — **not resolvable**. Measured 0.0866 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 8.58e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x407c4f156c19cdd4a3e9b7daede14adf05eeae1ffb6f827a5f3c63b9b428a1c4` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x41fce1bf45ea7816b6691fae03983b523c2cf8916aef32ca29a2c6350bdd98ee` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x43e475378a4179e671eebadc842bcaa7be8f00a7f2c852a374ab19c0ca5fe13c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x44dc93f290e3fe94e7af4a7e5e0010f4d4853b8e2da099cb0b47af90e21e1094` — **not resolvable**. Measured 0.0747 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.4e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x45c5dc944e4a16c263bef2724cb0c1c3039528c0bf06be4af2cd27ac1228f784` — **not resolvable**. Measured 0.2334 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000232: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x47e7091077de1639d894c6f82e959d9d82acb03010d6097cd202e8cbda16e3b8` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x49c91e3cc093e7a46024d4e3244e18f15a2bdd5ba969c5c1ab305972b5da2096` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x49d7afd170989ec29e27bfbd30600c8499f6422cbfcee931b4eb2492f2497b3f` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4bfc860221130084f3ab55569b90d4f19da052f8912a29c27aa416ecc4f1c54b` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4c3e80737a678b2b319b2d659d1e369982bc02bb3ea70079de98f914f763aa47` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4e8a058eb645b2be5a375d1836eb582bd2dbb7e0912c950cb8f3be3c11832d76` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4ed8ac7881b36621b8df5b8c03bad17f12e0d15b2ee76942857b4f415ace1737` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4ee84b9044219978f47a2f1153081b8edf2cd6d3fa76f3c5024d4699ea8b251e` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4f117360dbcba621f0d24e0979fb32c6c9900ffb757e837f70d823a1df66b5eb` — **not resolvable**. Measured 0.1882 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000187: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4f90bb92f166925108754006f878c0f0af3bdf14e1a1e5ea3dc367115c4d2eeb` — **not resolvable**. Measured 0.1854 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5093f5a5fe65b6ebbfd48245ac64c2bc09a072a39440c16ba8f2cc593c8ca0c6` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x50f2564e4a91658ee559598654a3528860b5735e665330a7f5c33e78537b489f` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x510eba05f201dafbe65e8a2080858dfa8b0cf7396f3bbcac0c97318933033d97` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5110f10d5ef39d1e417f35ab690a5f2438c7c31caab3e43fe0398f618505ce12` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5356692f34ff9dc0e3db538d94668dd1ae3ba67f415a9fa225d392dce19bf170` — **not resolvable**. Measured 0.1864 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000185: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x536bf42f88f71f4945e2d914d2e779771da3e6c4d205ef404e5ea849b4c428e8` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x54dab0ed1511bfcadb7e4c6367353560344b10e13c6646f88831509771524aed` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x54fea1639f641daab37c945b5a049a866922d2ca48ee87dedd5f7349213139a4` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x55d06bd5584a6b510ab6a43052c495d392006b748f0b7d5714e7fd3091060e63` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x56c4dfe806624e4207ad17ee3ed8dc28afb3822d47168e278350b280d7f2e4f9` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x589072c823f00a447ee2719891550abfe642b20ce348929e8cd3ba75b9be5ab7` — **not resolvable**. Measured 0.1238 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000123: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x590309111826ef7b1d46767a72ed17ceb7d41852dddb036278479d58a716c538` — **not resolvable**. Measured 0.1483 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000147: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x591f6d0646139b160425690431877728c8da461894357104b827c4ee9fccd973` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x59e8942b12959b2dbf6bbd6e7d5d6c5921024f9f5eb97fa7e4f6c99e3c61e56f` — **not resolvable**. Measured 0.1209 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00012: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5b0826bb13ee372816b1d2b36ea61f1a440acef37a743940aa703843186dbf30` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5b089002779fd0b5d9e1c802f11f688a0262f5f654152bff9c23691f18f05eac` — **not resolvable**. Measured 0.0866 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 8.58e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5c0e998730c8fa210ca4b9fc32c96b9fdbbfde63cec797105a79d5eab9a74c1a` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5d02000eef79dd75cef17714bda3e2d6dcd9765ea40cde7062d063715ded3e2f` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6030bb51bdb79d87b93ac9edacba288b6c064222a478825db9bd59f77dc5212c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6131efbe073c4f8f2fac45434e77d5b435f58df2157daffd85681c8772661578` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x613817628eb3c8748488ddfa1a8ef113bf027f1a351d7ad7989ae06a81352839` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x617b0336693258eb64281ded7c62547f375a1f28fcc834c463808623ddc67856` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x62a3e7726d615ba95db8820a093d7685658e7d084e2fc8f07c61d2b6fc5d63b9` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x63b8a3cae78883e17047eef374950f24e438d32694eb4ab36c58817c92c55473` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6440adf34fb63d8b8a6b49809645ab5c1d9da38e3860a6f19021a690faa2f5d0` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x648a53e593caddc0d2e3438d114e7eba5ac238d438be21b720621a6483d61023` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x64d00cf30180d8248634230d903bf635c62fe6bfe8e1829032b657f93e894e3f` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x65dde7b2baf38a2a1da27895f8fb3ecf74b5ad11b908e329ce6edcabab028766` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x663025ffcc9b329eb320c940a751fd88fe49f54c9e8e692d990e03aec3cb0995` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x672751d23b4650a28dea988af9fba591cf19fb067540be5aeb357fa910684e14` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6816cf725d6572ce9ff52af501f8d1dfe03050901c45be8a52f8023fa23a289c` — **not resolvable**. Measured 0.0592 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 5.86e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x692b7cde2929a7a1f60cecd6d294dc8ecf2a7ddd02c905236f1c2c1ab164df0a` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6a913532f91cfbd04df7d584514a7c5ba2fb5b0b5214662063cec59d346f29aa` — **not resolvable**. Measured 0.1575 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000156: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6b408ddc18fed7788f3c5db1476ad5386bb3fe7fb9249e0783549ee3dfc556ae` — **not resolvable**. Measured 0.1871 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000186: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6bd35050a216fb68f9b084c857b0fe9dfcc002ed1fc127a77b508f0db3be5015` — **not resolvable**. Measured 0.1965 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000195: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6bf7e9af6553bfc4b1ddd691d896c8697e28be2fa9e130011a482b41347e240b` — **not resolvable**. Measured 0.186 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6f2ae943117a1c5db6c999af3a8a87b5b7bbd292f604b6b3bb2859e460e9c5bd` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6fd672b2ef6e32518e161d7106819ec0e951adcd2c44400d4f4959b91a66624f` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x70ab6e2a633ae8b53ca7ec390bcc5f0e3299a5f24b99d196ac85c29747b87ac0` — **not resolvable**. Measured 0.1908 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000189: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x71d7d2d5f8bb22cd7508c6f708cd012d7ea06cb8cdbc3aba54c730adb4b356d1` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7304ab3accc6596e7449aac11a0578976cf2801444ce411ee14fdd3c55db0a3d` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x73b046f0108569c231a7875c8c3f8dd159d6e820534b2ff47d7c89f5cd6f2f25` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x74b719a32887067f8795a1b03c7cec2aac80ffd1094e2522e5f9a71291da8b61` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x75e1cf47c27ea5a5d2c1e66750218b0ca44c8d29fa300cc9a649d62ff96adeed` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x781c8ec8b63ad502589edac30f16d15b11557a263ce914c094c5aedadc8ac051` — **not resolvable**. Measured 0.1354 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000134: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x784b1f9a86357be617bedd28c30b3e3477e1ce3c581c41267ba6f1eb7f2ce4cd` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7bd45c00b3b1ec27ab41ee8af37c55f1478562016a703346330a9b0b07aad539` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7d94e1569f69d926cc7ac65f1a0325dafead322ac32ba7a6b36dfc263c2e9e8c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x81e3c42bbeaf716b19893a5a8d89c6ab0d5ee4100426abab4763d974b312b39e` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x82125ed4bf455f6f13350260c088166fe9d8932d384ad09ff0a9eda062630f86` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8258b9179f5cdb33d14bf71322dcf76fdb17d75655f6cf15b34e769a1cf43820` — **not resolvable**. Measured 0.1854 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x82eb8033f4d3938c21f71007ff1b97afeb0dcbaa460b65595b49e7475e0be033` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x845fee7a093c4d5175506a9b4fa647cadb1cc1d9ad5e4a59ce6abf901baf776f` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8633e8e8fe747e1eb62e5c114928248231c40541f3ab8399114c2722cf488657` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x874d8cb49629c1ca7ab88f421713c394d43bc0180100d44b08c08c635a3c08ef` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x87ae0642a87e22215f27b0cdcddb5d878e79b407c4140719486ec6fd9b75a848` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8822f239dd11dddf094d5d23aeac761692a4da2a521d8e17995edc6807684c67` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8895a22b87d2cfee48407663b729470c2804da9056a1a0a656b2697785c69232` — **not resolvable**. Measured 0.1862 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000185: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x88e0d9880a09821ac42c347803aab980240272d9bd5f97349b5829a08179b4c6` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8c01a48a7f61154e1026efbfedc930e0fa9307be860849a5884b6edf6ff1e568` — **not resolvable**. Measured 0.138 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000137: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8c03d8810e8893529aef71a3e2d159affbac056227b069afbbdbf633634b5cb7` — **not resolvable**. Measured 0.3134 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000311: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8c527ad3cfb710a5511b6f7a52f7eaec29066a5055f84cf18b5e2c0e8a4b9caa` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8f67de3e2aea88b2475967bff69b1f34f10f5d43755407341d2e07156ca9cfe5` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8f8276c8953271feb6282a9daa94eb644e36cc6624a2e7311765c43bf70ce4fb` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8ffcf6bbe89c36ab57d5b0d8459e3239e55bb240b458301bc871c9c49096facd` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x901f0d9c96a7340b45c08a32cdf9434938e9f5f27cb79dc4d5617cfeff295a74` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x925f6fce2d3401b48c3929541358a5225495a6cae12cde53fc2be7773a37259c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x929cdab1a3d34a74557dc54d395dea0b2599c920197b30e87242bc2666b40727` — **not resolvable**. Measured 0.1559 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000155: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x939793794fd5996d55b48d3ebb4d9664b598ec2123a3cf7cfff7deb815a4e2f4` — **not resolvable**. Measured 0.262 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00026: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x93f4e9ebd676350fbb10919eae9fe208525d9fab7e98b344ad0a78182d4d6d3b` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9578b4e8b1e5af3f309256acad4479f0b46382ae4976a1488e74ba6bc6c38e8d` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x962f405d26d091a561ac2bfd0ff652bd1c4c324e18a3b114a2d0570591a9515a` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x98ea639ef500f0fef1b181d99b35dbfbb8f4b605e791c53eb2edfaa4390c77ec` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9983c0d73a3c5f698f10dbca62d0da1b472dfd2468ca9b9a305abb9505608a4a` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9b81f28182b8bea93b99233d58c7e2a561af1eeb513c82b7820852037617a33d` — **not resolvable**. Measured 0.1279 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000127: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9cff97e5fc9b958452f38bbb29a6b25df516613ef41fad435a45d0a3b624d9ae` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9defb708a14acdd5f383ba7cd0f3f3799a0e16d84ea673579d4ae68867cbe1ba` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9f628850e85a40abcac3386a401c7b9e2763c0c22a575ee0eb163c307680d577` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa0b7194fe9c3a811c0cde11b3773bcd449a1f7df793aa62d86480345c941daa0` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa277e9989443509a4a782174242b3d2589b0763b3dcb0771dc4f3bf1b3d825ff` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa3036e98c731e0cbf983c18aaa3a629eccb636b563810a8119df329fb1e6edbf` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa35fe018e5226815a3071ae6905de09a73d80834659556fa8b42acf524c88000` — **not resolvable**. Measured 0.1391 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000138: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa46560cc392e3ad115cd6df982733f9442ea079bbab0ec562cd6b90b93fc3cec` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa4a6c40076f5fc9b265b15d2eac4c37c389dd74e4e037d854af6a8f797a55147` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa5ec6ac89122a0ec737977231e10b2ea891916d843e3f8a71e065c3c33957911` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa61df19f8ba39f3cee5fdb3f9ba978616b97f1d7a99ee7a235536a73b9082f5c` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa65d63488d09e83c20faf3ce7d9f389a744d547e993d3bb508c229c4858096c3` — **not resolvable**. Measured 0.1251 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000124: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa95a0fa1448130fd6a2524bf3cb7c579316f3f19c4c7ac6c6b8dfa6946f3b0c4` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xaae6c438bc1bc1b48df862e7234f9eac5afa76551bcd90b39a70b223bc663d38` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xab7e51d26deefba473961584b17e0b4671edf8bb0b792d60aadd0097ac1211bc` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xabad100d265f6d17c041aa67206d6af7d0f70359e68d63ee829cd5d51f901476` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xad603d52431a2b4e43b94eb5b92766db769289fe076e0bcd09fd23df67a0804b` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xaf432d3878a835fc94112d50acb14f935eef073eb10aa34eec0722230a812010` — **not resolvable**. Measured 0.074 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.33e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xafdf713a5fcf77e28e13e270f467dd926e6195c8a7bfbb128dae70a88af2898c` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb08d39f56030da5e19e15ee1698c62342ea38b39d9918a8f9330483f7bffaf14` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb092bd609543d0b81f8a5f845bbf89f5cc8518704d5f1630a15b54413c26655f` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb0ce320ae4209afdbcaa26be0e063faca3a8d7614f517faadedaf99189cf36a4` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb0dd7d011e284b96c167ed3c3afbe11ca2391624eddc8ddc61585b3a8df7dda1` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb21a4b9e0af2029f14976680bc7c8cb525772464131e4c7b152dffed9f5b8368` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb2776357df459880fe58f7d1712e130d5de0b0f5afe30271162b99a3eef719c0` — **not resolvable**. Measured 0.1993 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000198: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb3a1424559c02df1c8c923a619ed523e90c5f960c53a13195654c823126f8932` — **not resolvable**. Measured 0.1854 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb3e59f58603fa1233b03bd2a13b5f5c71567b4a27c8a4997a1b47d9421c3aa66` — **not resolvable**. Measured 0.074 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.33e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb3f93c9a1428f982e0c875faadc79aa227dfc2988eec8a4656b2266868af2f8e` — **not resolvable**. Measured 0.0744 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.37e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb749388c4b02c9470ff4226af553b2ef06ab24a9fe1a04486075b4896df1a45b` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb7771b8fa8bea0858a6e6bccd6e279c0d727befcfe108e7148afeab01b2b2670` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb7d16a7a4d3411ef9c1fd4c4743429b1fcbc1011aae232121eb34551f13e5a6e` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb7ff98fe6f36d83b02e0baac7087075933197c2ab40cf5253e42f38876f1daae` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbb21b8844659b5b77f40275058253bc3b49b04fb0d7da1658a9a9dad380fb1f5` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbb9dd111500530d525509a9d5e78e4c0019fd9eccdd7b3b87b104f7dba22704e` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbbb2f830a0624f200dcea069cb66c718a8cc948062640f4f7317779f130fbd3f` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbbbd79448bfd9c66823f9000708a89e82cd2aa05b96ad9d6ee7916f96af8d6c5` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbc0646e4ec22acdcf0bf829424e5141ecef162d472320b3d86bc279c75638239` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbc289f76a10953b3be86904b319ddbe7ea9c7277d89f0a7fe911017a75426c58` — **not resolvable**. Measured 0.128 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000127: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbdb0b2b587ae8d37948a0ea056b0e0cc1b3455c0c969ab6b776307a839899b30` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbdfef8cbb3c04acb7f88db49d3ef2b298b3cad6b52db0c125b10b2ac20b0bd38` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbfe7742fb2e5e07e018f128d7e4b06244059844bf25e3a40b868a800f30bc1c3` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc1168454d60ee095325d30d45857f9be090b34725e50ed58be683ed159328ed4` — **not resolvable**. Measured 0.1172 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc122c413863af6484d0664a3496caf4088861ea5abc6e496feaf57ead3f4425c` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc1428013c9546b0abd4477d74521524519ba7a279f485dfe58b3cad6521a5e77` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc4224c8fd7a216719d1ae9711e32b664a2dc734c8c7ea15e38a7dcd01ac2bd83` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc429469ad6a7ccf377ab33aacea2539a714e38e486d76b2d6291478f7aa03dbc` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc52e2a7cffecd5aa96856034494e5a3b55eaabedfcddf594ebadc638c36e3c63` — **not resolvable**. Measured 0.1873 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000186: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc6ba71eb8c45c84d503490ed9b85532b0610865a4e57a7925ffc2c7ff16f30f6` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc735af2ff8fc2d6efddf6e325c039e367295c5a3fa078ea75fb0b338738f1409` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc8beff19629606d392192f57e99ff8035e2426d34b8cead02f6872c927295855` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc90c753c7c2491d7049c93b89b7b236c51836428cf1def151cce430dfec7714c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xca53cfdf12e86ab841c5e379819f1407e40047e9085cbe94a3c21734c7e267d4` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xca8cf5c18b66c1d530367446626823e2d633f68972d6c973a653d801436ef14f` — **not resolvable**. Measured 0.1315 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00013: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcb5561bd3b714981381f7e6325bd796a9c8fe49ec31e60ea76d496b7d7435a83` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcb661b38aeec0ba17734c61483c1d07d282d7f86186c6c0b11803ea5408e713b` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xccabcd197ee30ff776fb5239790dfff83228a909c4c6486627828039f124d332` — **not resolvable**. Measured 0.0748 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.41e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xccf6f64ff39394f45da3ab39cc5d5cfde5338b8e4741c599c3f8ce87b17824fd` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcd667b6d3f013dae258207038c1d6be6b4f803761f90d2cdbfbab45346d8bcbb` — **not resolvable**. Measured 0.1855 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xce6b5b9c0667c74bab7d39d44247157b3a29901df7a675d56747c9cfb4befee8` — **not resolvable**. Measured 0.1196 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000119: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xceb720fcd11bc27134378555c9ff4917d302d370189d7b870f190940c488eb1b` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcf7ac24fca3a252726d8f9b60889b84a0bf7d9711a11e693dd24ccbf76179349` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcffa11c08bcf145ee89cd24e5ce38b8cd4a1ad0f99ccc224b102df8954e87fa7` — **not resolvable**. Measured 0.1896 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000188: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd0177a636c4ea0f3972822e5f1f85ed399c99149e94ae9d61ae19fc0e4ccd116` — **not resolvable**. Measured 0.1854 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd0eb4fd16445e292badf02577e111f0383ab1c3d1f66b3941fa42493903f1f7f` — **not resolvable**. Measured 0.1927 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000191: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd24e0ea5b10ffb4053438a2beac64e342b5a211d02d757591a9d11f2fb25f365` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd2f899496dae6bcc91e1ff61f2e0ae48cee12258e7d7425a080b6490c60a446f` — **not resolvable**. Measured 0.1854 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd3c0ddd53af7de835ea1d3e1861660a03b1c3540e6efe87e854ccc3aab227fbb` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd417e20f7b1a6ce80ae049fe8949ec6d7318162a5e6b142d877a092d2c37b8e5` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd4fdd95c17e271f12990119b9db846e134f5efdf92fe713f353a47caa7ef123c` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd5300b2e192be528978196250eb17e6336ab129afa47b555ff7443d2910e2884` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd58fdd04518548d7bf133e36c46e2625f8c568f4718f1388fa1468ee138b70b0` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd769c748cfcbb09fb9d8ad53706d33bae9e259af0f24944c97d741ff984912cb` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd7786e49bd3a75f034a5eadba84bf0fb9cc253f98177719565e95a74fffc1401` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd78a01a4846667606f9cf6afed480038eb7f6702cd3427324e248f4b65dbfac0` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd8241525e014d93380182094013672b187ac38006377fe04b504ef37454ea125` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd9bd302d4584cec3543cb6502e1a168de9b11329888439a0c100f3212feb23be` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xdb74944de61abd8274751ebce690263656234e9358fd5f25a63f484cc876da7a` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xddc6b924fb88f3d3a18a2a1321e041f57ac53cf2d92caad21855e0b36d34a2f3` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xdf5c449ad9e4bbc5fb1b3520bdace2ef1a5992c88f789e35f781855284a2e49b` — **not resolvable**. Measured 0.1272 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xdfc680ce00919df7163b69f21ff1b94ca03b48f736d3053bc9d3c2a1b5a03614` — **not resolvable**. Measured 0.0773 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.66e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe01e72a7ed8e0dc26ed4056d9c97081ec9c8411557945e2212731f66c4c183aa` — **not resolvable**. Measured 0.1855 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe03a3a9596c742fb48c7d374052cd9bf724d87e2aaeebe2a78a90f910fe790cf` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe0ca9522e2658c09bd6c5f4065557530828a9db34e9e124010af85faa472ab4f` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe13c158616734f4b3368da7a016ba6fd677195364f6f318818e662c355d9b943` — **not resolvable**. Measured 0.0754 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.47e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe1bee577900be9f69530f3f3dcf4f11f77608ce161589fd4c65ea9500589e2ab` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe3aea4b7bfcadf677348f27a62991fbf186772d2445011faf495dea01fe12c62` — **not resolvable**. Measured 0.1929 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000191: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe42295b4a67094ef38b551c0402eaaa4de98a058f640d009a3ba2974fecdce10` — **not resolvable**. Measured 0.118 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000117: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe5e3728fedbf4dfe790d3382688cb9c2e4ae42efc88404d90e5c08c4e8a90df3` — **not resolvable**. Measured 0.1326 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000131: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe6f18a284bccc8e0ba4006eec0da35b7559cd78aedc3612c0f6162c84c1fd18c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe81b6ad34ecbc4cfc91f09d1b8a39cf944b3e14d0f0db725edfe0f77bbaa4d1c` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe892332796590a0afb8e7ac38ec4d4a17d1cc20757be488038d203b85fa7c13b` — **not resolvable**. Measured 0.0757 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.5e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe9e58b939f894f7c45b0da4f5c23b4d32be9748e5351ffc349ce9f8d0077f62a` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xea728a38928dda07af8e445b07512e4cbf55ed234a00367c29e082b58ef0c576` — **not resolvable**. Measured 0.2011 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000199: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xee4ebe2f0fcef22666bcdf18203895d229478335c6e1f48ae1f9136ba0ca00ce` — **not resolvable**. Measured 0.0748 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.41e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xee5310ff244fbe6cb0edc2e13b568a53ca01cbd0d8a5aed1192f2217b89c729e` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xef45d6e010d121b5a992b707958cb6a3e65e6d316e97e09890a59af22f8812c5` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf007ca36655d1ec759351afa14cd430058e7507296c3d1680a01673c5578249f` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf07077c5159007107a332e2cb7e16d92919d27ac0e6bc6e2a2d35b2babc288d8` — **not resolvable**. Measured 0.1269 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf1db653f1807e2f05011a0a436a8a6cd7ee0c8b0e7f53f9a375c4e873d9d0494` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf22f44dfaa7c7339209374e82a43df3663bd891ead58b10e831ac2ffed49366c` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf2c06d617e6b2d7d0f045a3ac5cb8accce6315ee30e4c07e1ca4a06af3e76279` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf38713ece92dcb1ab9aa831251ef893cbffcbde63d557aebce66fc99f1111709` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf38b731c97b7a4c17a794045376ac23cffd0a9e3c19e5c878cc379133cca15dc` — **not resolvable**. Measured 0.126 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000125: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf3cb9cbbc8d4192df3f44196ae543b14ea83f1dc9d3555f557b56b3995ed4af6` — **not resolvable**. Measured 0.1938 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000192: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf56554f88d2a3e6819f02dcc785b0c4daf5a6aafd34f65be0a29ed8781de63d2` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf567a05cdc9fc3c939ee1bb8dccae58ee1750b3353ff8d51a5af220bda82a1ea` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf5f7bf2a5d517b1bff481a3fb2ec6e8efb72e832a17fd315eafec771718ce548` — **not resolvable**. Measured 0.1171 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000116: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf6803cdc04cf74bdcf65b1fdc371d04b360d4aa1cdef69fc9739cdbf32020e6b` — **not resolvable**. Measured 0.1268 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000126: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf7a26e181c266074fc3b4cb139e824fb7426fda10bb885abcf1b52aade711f72` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfbab36f7dd2edf414886016fa8954ede227e34463f596d8d51290799626d5ead` — **not resolvable**. Measured 0.1853 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000184: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfcb1e21cb233a88872610bcc35f6c3e79386198e8e31b853954f69e6ade9b5bf` — **not resolvable**. Measured 0.0739 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.32e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfd310203e20b264d2e7214c5c3a99d8e6efb79c108510e309b1cd89c5eab8381` — **not resolvable**. Measured 0.131 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00013: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfe660d1e5bec5f6d34d3dc666b0326a7dea0e865418cbaac3b33ffd3724c1524` — **not resolvable**. Measured 0.076 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 7.53e-05: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here

### `0x3e342a06f9592459d75721d6956b570f02ef2dc0` — UniswapV4ScheduledMulticurveInitializerHook

- **contract**: `—` — 18 own files, 2302 lines
- **measured**: 26 MEASURED rows of 48, 3 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x3e83479b2276ecfb7c7181f67b5d092d3511e0c4` — TruthMarketHook

- **contract**: `—` — 8 own files, 714 lines
- **measured**: 97 MEASURED rows of 256, 16 pools, median 79.1419 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x4951d0e1cfb915f64ab19aed153bd6305a244088` — Vvveity Fee Hook V2

- **contract**: `—` — 1 own files, 276 lines
- **measured**: 8 MEASURED rows of 32, 2 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x4db263809e6ea36d223161535173a01b5b3240c0` — DynamicFeeHookV2

- **contract**: `—` — 2 own files, 320 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 299.9995 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x588c683ecc450f8b2aadb13d7f63792b840425dc` — Flaunch PositionManager

- **contract**: `—` — 39 own files, 5882 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 99.9995 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x702b1fe403ec993a102adde47f2ab52eb2eadacc` — StonkHook

- **contract**: `—` — 2 own files, 617 lines
- **measured**: 0 MEASURED rows of 32, 2 pools, median — bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x805975d27518e3e23c4838802d9dda7302dca044` — AdvancedFeeHook

- **contract**: `—` — 2 own files, 477 lines
- **measured**: 18 MEASURED rows of 32, 2 pools, median 200 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x80e2f7dc8c2c880bbc4bdf80a5fb0eb8b1db68cc` — Liquid Dynamic Fee Hook V2

- **contract**: `—` — 12 own files, 1532 lines
- **measured**: 168 MEASURED rows of 368, 23 pools, median 64.5422 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x84bbab8cac69bf6711ba81f9915dc346f4cf2088` — RwagmiHookV2

- **contract**: `—` — 5 own files, 557 lines
- **measured**: 65 MEASURED rows of 304, 19 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x892d3c2b4abeaaf67d52a7b29783e2161b7cad40` — UniswapV4MulticurveInitializerHook

- **contract**: `—` — 16 own files, 2087 lines
- **measured**: 32 MEASURED rows of 64, 4 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x8e7640e6bbcc483be39c9898a41dae86013368cc` — ClankerHookStaticFeeV2

- **contract**: `—` — 12 own files, 1290 lines
- **measured**: 11 MEASURED rows of 16, 1 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x8f29bd5c8429730fa4c46e6295c4e679ededd0cc` — Aegis

- **contract**: `—` — 68 own files, 6912 lines
- **measured**: 32 MEASURED rows of 32, 2 pools, median 29.9597 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x963e91a45148b39737b9df10c5b897b55ca9e8cc` — Bonker Dynamic Fee Hook (Base)

- **contract**: `—` — 12 own files, 1509 lines
- **measured**: 112 MEASURED rows of 160, 10 pools, median 19.5618 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0x9811f10cd549c754fa9e5785989c422a762c28cc` — LiquidHookStaticFeeV2

- **contract**: `LiquidHookStaticFeeV2` — 12 own files, 1311 lines
- **measured**: 1552 MEASURED rows of 1600, 100 pools, median 19.9422 bps
- **concordance**: partial — 99 concordant / 1 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 1.3775 bps (tolerance ±0.5)
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
#      = 19.9601 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x026e63b0054794e1dddf245b61362ead34278f4a67a65bb9d84b7baf33926617' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 19.9601 bps at that size (gap 0 bps)
```

Pools that did not land, one by one:

- `0x0a558484791d5952ae9bf578f7af7fd05b6fad469ece0034d53df405d8f41568` — **divergent**. Measured 18.5826 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap

### `0x985c14baa2a18316ffda0aefb3a632fadfca2acc` — LaunchHook

- **contract**: `LaunchHook` — 3 own files, 730 lines
- **measured**: 12408 MEASURED rows of 19488, 1218 pools, median 99.9557 bps
- **concordance**: concordant — 1158 concordant / 0 divergent / 60 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0003 bps (tolerance ±0.5)
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
  0x0885f732001f13704b3fe31a2cdeb26ec87238b316c3f8f7e5e4a7291743c4d1776933bd \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # poolConfig(bytes32)
#   -> baseFeeBps = 100
#      = 100 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x001f13704b3fe31a2cdeb26ec87238b316c3f8f7e5e4a7291743c4d1776933bd' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 100 bps at that size (gap 0 bps)
```

Pools that did not land, one by one:

- `0x01f2e7518f5f8f1c2b65280dc79508cdf585dd16277a8df158738972c47e7746` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0433e7e954fefaa83a68b9ffbd7e26a73368e5e7342a62b53d1cdd9410a408c5` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x048db4d5d33ba60d11433cf41bc813b6b0d9ed0b3b51ceae4ad7ad7f4c43948c` — **not resolvable**. Measured 0.4043 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000402: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x05d9bfcb8cb464e882c8dc5135fb0a1238ebeb0d69c2ec87635ed3cb97659ff3` — **not resolvable**. Measured 0.4039 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x06ae63656424b784b1d5e1254ea6d2865a59e2405f7bb108709f207444ecf226` — **not resolvable**. Measured 0.4356 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000433: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0ad06ce6fc738714557b7f56387343976230be9ff693dc8a3611a4472a139262` — **not resolvable**. Measured 0.4041 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000402: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x24eeb43b421f8e7eed90ce26e13a4003c1ef7a57e19eb7e6349b8010bacf43a3` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x26b746e05ef206b7a956a2d40701191d9bb3ee8f3f3488010115ce9448088993` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2825db760f0193a920e4d33f31b2c6c5d0297d017b2ecec2e105ff2434079c37` — **not resolvable**. Measured 0.4295 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000427: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2862e69780fd63e74dce6d4dcf622b380487031b314252f9349382b833674754` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x28f10c1ba8ab0dd31412cad0de6da6af06a7352af315d778ffcb0a187abfa274` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2a7e2eb68f231b5403891112a3ef518610693cad89f63ae6915c641921b81d8f` — **not resolvable**. Measured 1.6077 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.00162: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2d50806a0c5a3ab5e92c70ba79eff7ba79a8c75136c1ce9bcd549ba9ac6750ca` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2e932ab2ab79fc8350b7c6fdad0f77a2ab93aa9550c69bffdecf4d399318f96f` — **not resolvable**. Measured 0.4057 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000403: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2f9af91f2bffede48c04c3cbf067c39d602f0d98376108f2771a086e4f86aefb` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x318f1e72cf86cafef958d0b5d027a2d5b268c00eb137376c1e1d9c30a9b86dd8` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x33d669b17e17830aed435618cd85b3d64f583e4a38052c832c2732322ad53dc5` — **not resolvable**. Measured 0.5047 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000502: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x36f28f8fa4674bf56d42f40d9abedd1fe975cbcda0e93cebcda1de903925fa92` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3726f4b89a0a5086030889905d8fe28191643aaff4acb5baaee025b733e398ad` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x40ad4e9b7c4461b41229c1eda24513001dbe865fe4fd7407b69cc3ed843881ca` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x50ca2bc73dadce5e31664a6b03459675aae57b3a494af45d0873e7c79e768ba1` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x51185642e0805bc168cf2bfacd44e4cb43737ce82d3c1165e24a4918ca1a949e` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x526449805ed2e56032db5227d4d435ead3020eb25bedfeadd8d23d127b58ab55` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x540841581dd74838e801de8a1b97da4fe59c2e663862bcafecd4d3a59ee1c992` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x57550b8b75563917dcbdf6b7237113a361e6ed45ab86643f8340a0edbfc8ec1f` — **not resolvable**. Measured 0.4034 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x59904ea1cd4b9d51e3430de92a38f961f0e14d6774299c17cd5a50f61c920a58` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5b847ba5ee1b033d62c83209cf4b13badd7056b6be869b42fa659cf4279a6ae5` — **not resolvable**. Measured 0.2988 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000297: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5c2218e77caa9d09a36958371dab4fb3bc4a4974049a2c7a718286fa181f3911` — **not resolvable**. Measured 0.4038 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6582e1cabe17a4e3d677c2094542a3f8101ab6a51299a08a4901b8cf258608b5` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x70c7ad40841dceaf7ab78b154b5e98fad7f5c0d3962b988aa0a023fa76a5de3b` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8037d6dc8f0aa24c6e6de37f187c0ffe68b99197fd70037d222bc453c6497d24` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x821974c0119206fae5a3a431968b35a35effa7db41ffebbab077264a06bad902` — **not resolvable**. Measured 0.4036 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x88a25873ca708c54d1af661e38dfb8b54f41e75f44e202efc71bae43f915b91d` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8abe2a676d67805956bfe28ee2de78f6b61c0d746fb7ca58bd2c3d519c4d82ba` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x92748ac1db578ffdb0ed116a176652295b87e2e26b1c2fd9e53c04030c3c2ddf` — **not resolvable**. Measured 0.4037 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x935ff2663723aae888f96891b2119f9ce069a51f83970455c9cbdd57d55378a5` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x961983bf6d5057cf0b4c2408abb53b42fd8cdda21d2a7721b8dc9340e36039fb` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x974ad55f20735dad616cfd6a78e75ad006c0568035745d4b1cf47609ec1c67e8` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9ab4b097b58091e9c9b023da347cb7d2133be855b96d1f91279a42acaf548559` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9d8bc801cc53357ca180262afd6cf5c57e9683790f1cfec465d5a74171dc8d39` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa8b5dd505b52ce9991ea39b5d5facf1b8e44ada220ca8516da73c40c46569ed5` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb158e8cf6c77a36b00139012c2a74a09ed713a6fc51e1c857d2bae815d4f75b9` — **not resolvable**. Measured 0.4034 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb74b9267525ff8191b7feb766349bbd74224f6433a73c093e4a7c3868fdba023` — **not resolvable**. Measured 0.4344 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000432: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbac545ecfda05b8ef88545b995f453be3d6d16e32eccbbedc24324a69ff52240` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc629099c8bf4d54e73b9d4ab610ab596d736ce18eea0f8d71656a64c7ed2d94e` — **not resolvable**. Measured 0.4038 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xc79222915f478d7c51e4185512e8cd25a5e5e3f51031d83fc453c63f184cd755` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xca700098530817e828ca433ee78ab33d745ebd03eee817b7281aa6148b978569` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcbf5ebb3b104714b635ff30a88aea1bf4ccf9062c7be66cf8f2a268e79af0ea9` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd007323e5fef4cd33ebda576ab93624fda5a4689dcc0481e2361dae962fff44a` — **not resolvable**. Measured 0.4035 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd0ef26816e56298a1c938bc87933416697b6972432b7185888fc2a6c262d163a` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd72afc59be879c713822335fccf3068caa0a3f263118054cb92d94973864deda` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd8a808e4b1e0e14e4dc3a8fd8a47b0ab38cd84221c72502a5aece3692ac9292e` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd8b88b79c08c3609b6f9157f88255faf8a9d27741f0a8b62df61e8e9f7f9ee27` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd97435e603d2da573ba6914e4d1f3e3f3a715d146f04e38dfeafb35663bfd6fd` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xdc9bb7d57c0050f59b4e5f57e4ac8f69f771268f41bf1fc6b868fd02364cbd92` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe546392b0c1e3b8a2091e17de7db3492292c653c03b3a87812e9c3cea4251e88` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe76c5d9cb723e965ac905339b878835836416d44fdeda5e8d3b355e7be186917` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xec3b32d0318715192ab8dbd38f791f2168fddbf756f46b5ff6eae7fe89965995` — **not resolvable**. Measured 0.4254 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000423: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf2df37fc9008a9c827c63d86d43168ea2d85efc30776fb47e81c00261be97557` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf8d756e4058d28b428ffabbb86dd85192c5000f8a47183d1375adb225ae0fc7a` — **not resolvable**. Measured 0.4033 bps at amount_in 1000000000000; the code says 100 bps. the quote at this pool is insensitive to size (elasticity 0.000401: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here

### `0x9d88b5c59a25c3a58566de4ecacb1a2e555270cc` — None

- **contract**: `—` — 2 own files, 321 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 299.9894 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xa74562863529b72b04368ca5efafd96c4741aaec` — None

- **contract**: `—` — 1 own files, 467 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 199.9423 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xac4b3944c351b6641fdd85a192cf6ddf84b3facc` — BDeFiHook

- **contract**: `—` — 17 own files, 2913 lines
- **measured**: 112 MEASURED rows of 112, 7 pools, median 1702.7335 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xacf358b129423f0107b0bf892b3eff6c770128cc` — ZNS Launchpad

- **contract**: `—` — 9 own files, 962 lines
- **measured**: 64 MEASURED rows of 112, 7 pools, median 98.2518 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xaf07116f1892c5fae4b55234a57ea20cf4e960cc` — None

- **contract**: `—` — 20 own files, 6278 lines
- **measured**: 8 MEASURED rows of 32, 2 pools, median 264 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` — Clanker Static Fee Hook v2 (Base)

- **contract**: `ClankerHookStaticFeeV2` — 12 own files, 1283 lines
- **measured**: 14020 MEASURED rows of 18800, 1175 pools, median 20.0492 bps
- **concordance**: partial — 1020 concordant / 53 divergent / 98 not resolvable / 0 unverified
- **largest gap measured − code**: 9979.5279 bps (tolerance ±0.5)
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
#   -> LP 10000 pips + carve 2000 pips (pool already at 10000 pips)
#      = 19.9601 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x00ae911ba0f547c03cee71c4576ff2b630bb46e56e946a984f46088c135c9b92' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 19.9601 bps at that size (gap 0 bps)
```

Pools that did not land, one by one:

- `0x00050dc3a26c0e8f9897035da9721f0689ac1c6dab80a2ff647ed11bebe2b0a2` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0417128d841c5a8f804f2709cfab134896362c54eacfadaec098acd4e0bba0fc` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x055fc289de79c63dda3a196f0c0014900289921d087fe04e3b3dfc6afa738abb` — **divergent**. Measured 9.4713 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x05874b4bde7f2405e1e32bfa791db8e8ae3dd409cbf013c7dc52e9bc16578c7a` — **divergent**. Measured 0 bps at amount_in 10000000000000000000; the code says 60 bps. LP fee 30000 pips against a stored 30000 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in afterSwap
- `0x0982afe20fd1a883a900e280f0c5ec2fbde95eb61660f23268a5ade8114833bf` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x0b6f27daa6c30e8e68dd1264b66c3bf6ffcd0dc337a3e681ad354e58b38a81a9` — **not resolvable**. Measured 23.6952 bps at amount_in 1000000000000; the code says 239.0438 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x0dfcfc9bb24112a5216d16cc8b67e14215c977f80c940094a5f7e6fc1402d626` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x0f041e988192fbd685bceade0ee3f1f3bb565a243174d7bc1f62d106e6aa6bfb` — **divergent**. Measured -46.7448 bps at amount_in 10000000000000000000; the code says -330.9863 bps. LP fee 30000 pips against a stored 66677 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x13f59c9d8c239faac731934549c6270439020bbb67c207fa420e5257543591e9` — **divergent**. Measured 19.4458 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x14bf4ba05b8687383892b1319d2991a48a4e280a1467f96d129093ee1854c57d` — **divergent**. Measured -99.2774 bps at amount_in 10000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x15cd56305750114c2c5e71a90e894d6d33e8cc28d87a95790f21ac21138d7755` — **not resolvable**. Measured 34.3124 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x172b9882a6f612778d98d522bafbaf7e1422b4663bd77244b2191606509efef8` — **not resolvable**. Measured 1.9574 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x17447d5fc5e0c418b3ec3768a2dbd11982b9a67e906b3d9bcea7d525bd032aa9` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x176a4663128d151e3dd789d9f67db2cfbcadac958e62151e7f1230877a7ac5e5` — **not resolvable**. Measured 26.2397 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0213: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x18d194002b7cc9a798146851fcb78cd1682501637036e1266c9c42cd477bc9d8` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x1e02419284e5b2bc1908f72a57401e2f7e1af610c6bd56d3474d7505ff452e0c` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2223fd551fafdb1bf36c906946449069af9fdafe6bba4ea44e997a91b9e34171` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x2446e5e0c9d227599e09654744c15077fac45d0995247ccb11b49770e2c1ce00` — **divergent**. Measured 9.4713 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x2725fe2e9295144f4682e8363d754b665962bbd3d00727c482a835bb80bc979b` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x28f402aafb6fbf59e76867827b26bbd1ce1a53cca4f90b15924c130b83a5687a` — **divergent**. Measured 43.0726 bps at amount_in 1000000000000; the code says 59.6421 bps. LP fee 30000 pips against a stored 30000 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x2ac2747203f6510b0c648750eb02fcddf4b628e1f736d431ef54ee952df73442` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2aff6a73b40cb007925335a30c1cbd550464f9a50cb10ae051f60c1664445713` — **not resolvable**. Measured 1.8727 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x2bf03e0cd92c270e6e2054af74b63aaf73b647c869b117a907f36f01dce54089` — **divergent**. Measured 4.6277 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x2d5cd90663429a7c9a76ecc996a9e18b4f205cca66f7a3df74aae002ad6c9f0d` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x32f98e4a31f6c7edd4ab24bdbffdc6b6dcfd710bec1b8e16757b6f76901c3f0e` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3579f79eb981624a111aa8e25a657a96226196be0355b704513226fe01cb4242` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x382045c8ed0967037315cad29629e87b7e96a8c432e897be9f16c3de5949a252` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x39481e190a47b77c3d185f66603ec1abdb0b08ad69f2de81a63cc945393f8deb` — **not resolvable**. Measured 1.4312 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0213: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x398b6535c44f90b1f9d9f9a30bfb602fd7ffaeb25365f57e27a35fbeb65b6d03` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3c18a371071486a4654f6d258dc38c754dcd2bc2dbc66b8b01d4ccc66b49eff4` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3c2988fb71fef517f1d61edc4b78be5a5a0f1a7cbb039756d0381a06bca8dc29` — **not resolvable**. Measured 11.2383 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x3d92daa9a330405553eb3be315a2707eb365693f2af73b4699184bd344d586ad` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x40dd03b665b199612dd3114c74f09a2edbceea0d5aa805ea11a16d04a79d46c1` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x41eea896cf52ab1956da06d7ea1860fb9ec22847d8674e29210b794abb15613b` — **divergent**. Measured 19.4496 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x429c15f1dbd24cd6f1d32786fc6f6ff0bf165ad2d63672ed76f933412f16cf8d` — **divergent**. Measured 18.978 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x441b71f2dc19b0809673cd8b46071aa430bc74a363fc2b8eb6cfc1e88578e735` — **divergent**. Measured 216.5833 bps at amount_in 10000000000000000000; the code says 20 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in afterSwap
- `0x45ca5ce3ffcf77e65e7a809f7f6549ea9ea84b414cac8c404c5478200ddb5135` — **not resolvable**. Measured -100 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 1.02e-08: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x48141e540aafc1c7dc78854928c8b19c16522bd2dfba8e2c1ca686fdd426c506` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x498ccdec5aca22acd95ddccf2b1a286fc3682a9f2c4363cd8de1fca027890e50` — **not resolvable**. Measured 1.9583 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4a01cadab791836cf1f2251bdcf83c3ee72fe6bb9213d8d6be5b82471582710f` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x4d7759ecbf92bf6071f2989edf6f33f67816057b80af63f053ca2fffc3475568` — **not resolvable**. Measured 32.7462 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.021: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x4dc4fe39482012dfea7a68f0408084c5d81df52cf486e6e72ebb2f30d176e85b` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5131546655547ef97cfee3415084ffcf5e1ac1bf30be0b7132842790f9d0400e` — **not resolvable**. Measured 0.8331 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x523bc28a16c065baf585391f60efaae45e755676e27795b8ef042e751b3336ea` — **not resolvable**. Measured 4.9731 bps at amount_in 1000000000000; the code says 59.6421 bps. the quote at this pool is insensitive to size (elasticity -1e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5336e8a8ab72b77ffd61a3cb5a03d7790abcd02225b5186162298e1d071057bd` — **not resolvable**. Measured 32.7462 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.021: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x53d69a3b7f1b87dc72538f91405b88a27076b4982f00b079cfb2a436fc9dbf47` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x5586d7a4dd946e221e9652e0615473786c1ed7c7aa4182f219bd50d04f2b89c7` — **divergent**. Measured -100 bps at amount_in 10000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x56ba2d43f12cd3dc48eabaa0b8336c2ba2d0e952894480f9933dba4688356f7b` — **divergent**. Measured 59.0389 bps at amount_in 1000000000000; the code says 59.6421 bps. LP fee 30000 pips against a stored 30000 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x594a4c7772410804d7267dee1f9ca6141f45f8b88c7302cb355b44f44918eb03` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5a10e4d3264b00a24b738b8a2e2514c8ed7d007be4e9a812018a9f16b416ba98` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5cceed13549619ce33217c0d4a406d4fcf1f6ab8843eff3abd10dbaf5cb2d790` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x5d8ac2772f68e1b499cca13be14d2e92c0bfd3dbb1687a850288a36d9cf0edb1` — **not resolvable**. Measured 0 bps at amount_in 1000000000000; the code says 0 bps. the quote at this pool is insensitive to size (elasticity 0.025: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x604cabb0391cba03e0014ad33473138799057b10865af55d2c77b05ae02019d5` — **divergent**. Measured -59.7222 bps at amount_in 1000000000000000000; the code says -117.8266 bps. LP fee 30000 pips against a stored 47014 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x6267885c060a2924a2e0cd3e9d91097bc5360cb8109322c6538b157d80bf71e3` — **not resolvable**. Measured 23.6952 bps at amount_in 1000000000000; the code says 239.0438 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x62ae582fe987d8ce0e2ee15d31202077012242f4cf8305331dc2d27d48a32248` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x63bb6bfe68fdb6531813e2bfb655fb58c341de68d8d1f297b7fe96a27bee8c6d` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x63f05d6710726db8fb4c834a72590a8a3cb22387b54cae56329cb728648ec375` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x64def57c250c607465bbf8323c82c34a90c4f1fd74b1b18606212c07c8aa8eaa` — **divergent**. Measured -100 bps at amount_in 10000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x67443869ce12cb2fa90aa8a2a522bc89360caa3aeec2063751fd3fcf4681f2ab` — **not resolvable**. Measured 0 bps at amount_in 1000000000000; the code says 0 bps. the quote at this pool is insensitive to size (elasticity 1.72e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x68ef458f7195934b12ef538bf522bee7680d73308d25995418935748b4165623` — **not resolvable**. Measured -100 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 3.11e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x693bc1e84c7874c253c6455ba3805ce328332fd6a7f9394611abe6db9296edfa` — **divergent**. Measured 19.3111 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x6998781fdf7cbf7fd619a407397183ce481526878d087bd5744eb801991581f5` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6b919d84b0c4002651da6dcc07f593c1b4cba6ef98fba1d861ed508832e30369` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x6be731a245a7ae0bf1221359e2da551aa80857ef70198eede0fb030f2a1e0cf3` — **divergent**. Measured 17.6702 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x6cc85ee9eb74f7f53ab6cc7dd5ea42d99da5a2e203d56cc1089762eeae4550bb` — **divergent**. Measured 17.3964 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x6ebac4fe27593e5ab199c757cf816823f26393269fa35312a4ceb4e56b1b5104` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x72566148c0009a60f5f3762b58c88614ebb95dbe73772b33761d55beba6f5516` — **not resolvable**. Measured 23.6952 bps at amount_in 1000000000000; the code says 239.0438 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x742dae9f8d5f7d1fc92b5de1917dfe602f15933d79a0646dbede1ba388f88c0c` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x749d6b04e30a043d9b6f2547f72e54e3fc33274e53e8fc51e7c18e9330b92611` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x74be468dbf10b184c01f54c7e79d2da228875b34bb9b5b0aec17d5e1e54822b7` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x78626b93b3189b50312f09ed285c8f84f532b992826425f9f5cb5d00ec62440e` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7b7970ede19add796f2beffd3348a5e7ff2485f2333c4fa75622488fed9edbed` — **not resolvable**. Measured 1.6499 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x7beba993bc73bd06f26f651bc4a9e676bc39ff9f7cb068d7aa6d326a0569e285` — **divergent**. Measured 19.4095 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x7c8483ec1568cd5547379acd04a437de4cc5e75ff6b4f65af3a3da260a39da4d` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x7de00f86e5eb9e11ad7c150e95eb3112480dec718547cc27fa168cb67de8142b` — **divergent**. Measured 9.4713 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x800dc900917c5cf1aa5698f228bb69f4f360d8b9a923dcda78ad8acd7c0746dc` — **divergent**. Measured 192.9157 bps at amount_in 1000000000000; the code says 196.0784 bps. LP fee 100000 pips against a stored 100000 pips, plus a protocol carve of 20000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x80218d9ba0e5f561a50bbe073bceff37fe219cb1e9a29e644f616dcc81c39fa1` — **not resolvable**. Measured 1.9397 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x81710fc98a5c7d06aa85c079149d1164062afd04c65e2470ae0f047a5564e821` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x83b4f95bfd88d35d0f06348ceac1df9df9a21c7b5294c8805cad8dc8fbb87c75` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x84bb2202c6bf8bf8cccbf4f8a4f56f8988fef826a13b3019e36d7a75d2f65a36` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x865c1699004a2eff17cd74cbbb216bf3e07ca8ef19beff888ef8c960eb68f8af` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x86a68a940153e796d8a857fc3e9597979724f51ab9eb0f1031c24ea6368414fa` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8a7f0f0a66ad4d05cf06a36fc1d80f7266d6cb43b8033663e0c2df1643f61919` — **divergent**. Measured 195.2298 bps at amount_in 1000000000000; the code says 196.0784 bps. LP fee 100000 pips against a stored 100000 pips, plus a protocol carve of 20000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x8acef003771c773ebc4a66e22460c22ef440d7b63fcd7b0753d7754302c8d5d9` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8b49ea784911550ea30a3b8b54d503cf60c50e3d8ceb7334366c28b4448b46e4` — **not resolvable**. Measured 1.8727 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8c3099a143d9427e913ab1d8c635b1046d9b1b5e80d2a7a3ac23494b1e17caa9` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8d3c0491cb9e2943ada08c75f5f2cb8b4074bb543703dcb557743a6da4dc090d` — **not resolvable**. Measured 11.2383 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8d779ec9856b45675b90b47c06bf510dedcd161aa5917f02c16a584f5a88a0e9` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8dac493e4a2d9d4274d8632738fcf583959344d47fd467f518d349f4e7a2f69a` — **not resolvable**. Measured 1.4312 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0213: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x8f0138efbc849844465aaad86114ef113a926808183a24ea3de1f6ac1a2044de` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x913cc23f0ef4ca93c0bf6de46649c8f36ddd03d9e8b22ccf48067ef6a8330d37` — **not resolvable**. Measured 34.3124 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9302e7ba5d4b72f42a313bedd89df4f224e03519aa6ad0fb9eb9804f427dc763` — **divergent**. Measured -100 bps at amount_in 10000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x933c710bfd88252ab0f930c54d5b481423d9da80835689b67eb97ff829347a6e` — **divergent**. Measured 16.8745 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x96370e0eeb2f9ff539900a86b2b04c0440eb4b7e1980c714b7aa3b7b8e7906a6` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x96eab477f33ca77d9a210c4b3974bee6166299f2e8847152382f12314c5105f5` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9a7dded9ef41580c5a3b5c8f7f03126121053fe2720200205f279a787283dc48` — **not resolvable**. Measured 1.8728 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9ca46a0471f1ca347c31b5b6a9f7e0f80a35979a791043f74d41ba1dd3c0df6d` — **divergent**. Measured 9.4712 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x9de4edda1b0e8018d0872c7e6b6f5869a0ce41f4cf52859dc57cf0e3be8e19c7` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9f247c90b2ee68fdd7d7412974319e4c49be372113552bf3dfe5ce2ada556723` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9f2bc594212cc3d784a0fb024c1d0a2908ec317f326b9fc45eaa6754af902b4f` — **not resolvable**. Measured 35.8553 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0x9f59e83638341e25fdf6672b2b30384aa17827ce4e1f8f4d8cdf1f2c9c82abd9` — **divergent**. Measured 58.4362 bps at amount_in 1000000000000; the code says 59.6421 bps. LP fee 30000 pips against a stored 30000 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0x9faf9b63ae311108487c9a89b1b9f4484ed5cc8507774566f61c4c0bd13b01a8` — **divergent**. Measured 11.0124 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xa127fb02be5c006bc22f8c10e45cf27bfa3704d3b828c653e85a8657c0df3a41` — **not resolvable**. Measured 5.4704 bps at amount_in 1000000000000; the code says 59.6421 bps. the quote at this pool is insensitive to size (elasticity 0.0102: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa1c745d5f23e44b3a78c9453447c7e0d692d6e5a906fbeb83f7af37a7388c277` — **divergent**. Measured 19.3793 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xa691877852f116ae02194109cb33903fbdae44a788dde419b4da203f71b0f3d6` — **not resolvable**. Measured 34.3124 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa71edb1de4aaecdd511438c4e2890c93ce49a0c3fae0a935495cabf616ff2c95` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xa89fbe2ce8d9ae0c28aa5994e601e04c20028fea4289e773dc9f3b3e9ecbc94a` — **not resolvable**. Measured 1.9571 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xabd699b73a8aa194a3e7fc57b68b669f1dac5762ef86df469b33650501ea85aa` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xad76a96d98a6ba7d87b6638f992f2786e8215863db8b51c77303ab60e5b747c5` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xaf18d3abebb264e94aa52b5497508bab4766f6204788fb64a678d42a0a5b9493` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xafb47aa8e8934f89bc090de913d8c22fef5555e17d517618f56542274bd599eb` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb002d23dea29689ce02a3d7d7fee100bb9c486b3788b59ba88d076b201b4ab8e` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb0ebdde275e6a88e04cc6e9c4d67fcd5b711bd11e966aa30f0119d0c74074196` — **not resolvable**. Measured 5.0192 bps at amount_in 1000000000000; the code says 59.6421 bps. the quote at this pool is insensitive to size (elasticity -1e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb359023d4ad4346bfa0d6448af03b7101112823aecf9b0a1ee3720ff18412076` — **not resolvable**. Measured 0 bps at amount_in 1000000000000; the code says 0 bps. the quote at this pool is insensitive to size (elasticity 0.000619: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb3ad45f5f558ead544b4bf30256818202faae8f46acd2e26496cae0c387f4897` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb4d2bb703230aa7809a679eeb74585d812335302efb0b0c2d827a695e3f98bbb` — **divergent**. Measured 194.2788 bps at amount_in 1000000000000; the code says 196.0784 bps. LP fee 100000 pips against a stored 100000 pips, plus a protocol carve of 20000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xb6702913c2eb6d178b7310cc52ad4d836c75204e48d2b027a08c471154f9cdb0` — **not resolvable**. Measured 1.8727 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb7250b67703616acebe5256cc690e184331188805ca24715c5968ac904442c9a` — **divergent**. Measured -86.5827 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xb83b6618b161cb0f0d883b7c62fd30d16e671c9b3e8f5e1283cd674c8665cb36` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xb964a42eeb2fab5590992e02ff347d6878273c588780bb5b53bc3bbb2f1cdf09` — **not resolvable**. Measured 4.2386 bps at amount_in 1000000000000; the code says 59.6421 bps. the quote at this pool is insensitive to size (elasticity 0.0213: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbb1e8d50240faad83e297361e9c96bf6640f4854e5bcac524ef18b9282b2c0c5` — **not resolvable**. Measured 1.8726 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xbf00083c0f1f07a1d3e2b8abaa324b11fad7db6a4e92a21b40cfd3d597941bec` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcac5a39ed9fb396789ff4afc57135f3c414c8661b7ab17a818becfefaf983507` — **not resolvable**. Measured 31.1563 bps at amount_in 1000000000000; the code says 357.8529 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcbe34e2e6a26ac1f8095eb461db4bafd44e0b23cbbce0b175dd9762e7723e9ca` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcc049bffda7d2dbc1bb9e795c4a107070ceab629100bf14ddf0c59487f2c23cb` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xcc0ae2b65f2588d0b1a5c17ef3a0d14b8af8c617108aa3820435b66a096bea5e` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xcc52140b4f989321473f031624018f8e833390fc65c241a7cc5dc06707dcf416` — **not resolvable**. Measured 1.6171 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity -1e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xccd483a43ae2f2ea1b02163319b6396923bef6d03981b66318cf7dd16b526371` — **divergent**. Measured 0 bps at amount_in 10000000000000000000; the code says 20 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in afterSwap
- `0xcdd602639fda57a1d53fc00c528836a050cb6d1b7b0258b5437ff7b6bd4623df` — **divergent**. Measured -1.1252 bps at amount_in 10000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xcfe6e753096ddb0bc84aeef54a7454af4748daa5843b5416b1ad8079d5bab6d9` — **divergent**. Measured -22.1144 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xd01421b5b4e0824bea3c441b60c52032ced3b4975ee8c6adcca7b33d9079767d` — **not resolvable**. Measured 1.8727 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd3008d51a1dc9cab7beec1aa7201cfc270e45f78df5c43cab42ca752ac36dbd5` — **not resolvable**. Measured -100 bps at amount_in 10000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity -1e-06: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd3c48d82b902a5caf88a8c1bbeba6e600b73dda2c3342e6774688ab72e77b6bb` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd55942402dc70461b660e3946a20413e8958b15eda5bcf86cc4a3609642dbdfa` — **divergent**. Measured 2.5768 bps at amount_in 1000000000000; the code says 119.7605 bps. LP fee 10000 pips against a stored 0 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xd8637ef68b7e2ce5913347217d9ace7f74501c4f816587a00f1126619a8201f3` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xd946a6b7971a7f1641b039c528b701704d68e9ce1ee1a2d0986ae8e0b0a3446f` — **not resolvable**. Measured 1.9578 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xda6d6b3b7d03de8ad3c9a63bd82d4060709ae00f329667b631a6699debbf231e` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xdb4f6840bb0451258ee1dd656be86bc2a608025c828158006410a529e4f2a0ca` — **divergent**. Measured 18.1289 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xdc3539d6012cafa36bb679c3b268ce1aed33d5dbce7fc170f7730686886c135d` — **divergent**. Measured 9999.5279 bps at amount_in 1000000000000; the code says 20 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in afterSwap
- `0xdf4ff8784a62e035b6ee935d181469a146d3e556d73f69226f3ca422bc63fd0c` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xe968a540ded7107f2b282027d14e4b08f8a3c4307fb0b5c7698f71070ebb8faf` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xea9a33e14177009b817e0db39acc8fe2c31e053218fedeef1baa7beb21b9c6d6` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xeb0dc96a63eb1aa3e93d00824b4109e336587c2d8ab8d20f051cf82e47c28d8d` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xee3ed72cb405eac7de28835d0ec1bbc98768f34d3f9b40050a5c5d81e729d96b` — **divergent**. Measured 13.2631 bps at amount_in 1000000000000; the code says 19.9601 bps. LP fee 10000 pips against a stored 10000 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xef6ce82b12d0ed0134b75a39a09ebc48682b5bdb67deb240082226708487822d` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf1a9bc72eb5e612a47ce9a46a65e1df477449f2a651fa1d5c95c35414dfc8d00` — **divergent**. Measured 16.8123 bps at amount_in 1000000000000; the code says 39.8406 bps. LP fee 20000 pips against a stored 20000 pips, plus a protocol carve of 4000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xf7126aa13045cb58d7426900a9da810a303f62cc29d0ddf93cba7416c5df3ea5` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf76f80b87a6e8933314c42b22110f143a98ed518a482ef4b9ff23964cdf7f969` — **not resolvable**. Measured 11.7452 bps at amount_in 1000000000000; the code says 119.7605 bps. the quote at this pool is insensitive to size (elasticity 0.0211: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xf9e883406d3de33a1d38c0ab3d40f602da6988f63a17faae1a8f25d816f6fc9d` — **not resolvable**. Measured -99.9996 bps at amount_in 1000000000000; the code says 19.9601 bps. the quote at this pool is insensitive to size (elasticity 9.37e-07: ten times the input buys the same output), and the code takes this fee out of the INPUT — so no input-side rate can be resolved here
- `0xfbd4e4bad104f15abb2dbd03f37ce008010b1ccb9414c10d11a01fdf632c9a81` — **divergent**. Measured 56.4964 bps at amount_in 1000000000000; the code says 59.6421 bps. LP fee 30000 pips against a stored 30000 pips, plus a protocol carve of 6000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap
- `0xff7a04a495badbddcb3c4a6c6ab8a6a5bdf2a44c071866c069863d596846227d` — **divergent**. Measured 2.4506 bps at amount_in 1000000000000; the code says 119.7605 bps. LP fee 10000 pips against a stored 0 pips, plus a protocol carve of 2000 pips (200000 / 1e6 of the LP fee, read on chain at the measured block), taken in beforeSwap

### `0xba83ee6969d09ceb8a4827c3ed77413c75392044` — AdvancedFeeHookV5

- **contract**: `—` — 2 own files, 567 lines
- **measured**: 195 MEASURED rows of 224, 14 pools, median 100 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xbb7784a4d481184283ed89619a3e3ed143e1adc0` — DecayMulticurveInitializerHook

- **contract**: `DecayMulticurveInitializerHook` — 18 own files, 2424 lines
- **measured**: 112 MEASURED rows of 1904, 119 pools, median 0 bps
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
- **measured**: 10220 MEASURED rows of 47056, 2941 pools, median 105 bps
- **concordance**: partial — 914 concordant / 18 divergent / 0 not resolvable / 33 unverified
- **largest gap measured − code**: 104.25 bps (tolerance ±0.5)
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
  0xb43df6e3004e76b178d2910c8b409fcf35a896bb5f6e3b3096fe2e525120da9f04b52026 \
  --rpc-url "$BASE_RPC_URL" --block 50614000      # getFeeSchedule(bytes32)
#   -> endFee = 10500 pips
#      = 105 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x004e76b178d2910c8b409fcf35a896bb5f6e3b3096fe2e525120da9f04b52026' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 105 bps at that size (gap 0 bps)
```

Pools that did not land, one by one:

- `0x00e1c686a7179e5260a414e979011d8c874e0faa66ea933e6dafdef1467fd7aa` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x00f1f02ece4564f30149e5537f39062732f6cf0f2b9c363b099d95d56c9bd2eb` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. already fully decayed
- `0x04e0f9cb702a9f2499080a9ec875cb70e12bf172622e06aeffc2995fedac2bf6` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x066394cc7bf65ac903fd1e5ed759811f909ed7b8c7e30b9178bca2e97ac811f6` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x0b56e95111027f157d1d0ee8a699319f428d0f24feeef25863b419f834251e2b` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x151eb60b4177d5e1017806da9774ca2ede7cbb8dc7d4ebcfd152113f640f2d02` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 317408s before the measured block
- `0x1ea77b5a443b83fe926b750e94299dd6e203e88fdd87fe6fe1266e319b057730` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x23a1052c951e187a4529ee45af6860029464f7b44fff105487412ba863a40a3d` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 44760s before the measured block
- `0x28fe3851ee6ab1a7ce9292f89b2e40c6d664f1b477bfe427486f0a33c4af9ea6` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x2e8f977628820a6739ff379b7752599bf78e9a2e30f9426646638c66864ca9ad` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x34dde84de229ef5b28c3329bf0b7837c69dbc5ce857d5872995647d6fbb5dcf1` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x42500f2f3ad89eecdb5d27c204febc345c8bd135c865a3c6268563470c9855a5` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x42f2ffa589d254841f7a86cffef913e958366ca78041ceb66ea3c6d7b051d64f` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x4435362cad2eefec1148ee9ec3e48cfd43931e82e8eb0ead769180c42cf8c113` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x4f79677dcc4e601cf67bcd39646abb2dbf746dd9e7872c3ea684b5c316dc8df1` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x560e3510d8637aa841308f3b73e83bb686cff5ec2bd21b5919365a8d38905266` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0x5f14f037671f54b87d61e7e00a0a96bc10edab3a7c93d3b96bd4716b2f20a8fd` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 69948s before the measured block
- `0x6780c29337f586c191cb48a303048e4fc0c5e858362f1b6ed674eaf7b1174058` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x69ac240638febf430497858c7284dec9e7c0fe8234d3c55301feaa52ef48701a` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 228916s before the measured block
- `0x6aba2598f85c960ad458de8acceae2f3fa950369e48958c7c12185a3249e8460` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x736aca90b5bb771bd730bdbee7e978f3ace52c9a0426fa38f55797e629aaad83` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 317488s before the measured block
- `0x73e5d98c18ef79ea545c8d16392276fc84ba446a204b729b2a8e45628ee3a906` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x78d4903e4cfb5eed5f74243a1ffe916833bba4de1585ee05fcd6d7112fea3984` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 237902s before the measured block
- `0x7aee8bb5ae6d42232bf50b0be6fb5412ef4a8ebe604aa47261d6a4d8301fdfec` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x7f1311940564bc4a1589636840d7acb169add00e0860795d70851371422315df` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x85e62e294ff3d3d511654bb47253820c129ff3f7fd7e26032693393dc7dd1652` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x88d1d36a4f77a4e8f3fa36a61527559c5e71cfa0a76de7aac14f870e9e3599f9` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 167284s before the measured block
- `0x9167dba687dfe9d43d1e54a4e4f059d24b1fc7dafe059f9bc3d08d6e107764d6` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 70044s before the measured block
- `0x96f8c0adce2e98e15983ad5bb0e77f546e954f8e0785faf33625ebe28f790c60` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0x98903958182c6773e9ee16004dac7b5c58904fce4ac8c0d4c76072f18dbf6c05` — **divergent**. Measured 249.9797 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0x9ceeaeffdbd5bc0b020e4d072132284ef73f43dc98974f5ba8aedd881d31e45a` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0xa2bb105bf22f982d237af2c95f40f703fa9620c11feff50d9c96c792ab26936e` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 69896s before the measured block
- `0xa48bfbdfc92fef120b00c97924d6be1e806f862b35a38597b0d05416b53da55d` — **divergent**. Measured 125 bps at amount_in 1000000000000; the code says 100 bps. already fully decayed
- `0xa732b470ce430347319578bd39b4e4e06f394b03d3ee46be3b1f3447971edce9` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xbfac40e47a80dfd2014286195ba31b4e799143f0cca93a062091e9b83a5ad6f5` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xc1e2d1389984f90f85abae6124de9e0ebbe9c6986ec4a4fbe5581e81d53ea4e5` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0xc801a18bbda4fbc797c8838ede31b5c6768f5be3f68d3130db7d25382a26bdcb` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xc96db101efc542d102a3daaab0a32c6c107898924a9ea43fc0f2e0a892be02f3` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xcd327ffeff9aca4d7266c01981a65eee5ca6767b1371b1104ad1722c05a553dd` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xd21f5da0eee43cbc1e47b5e8b2b3fc712ec02deb65be1f8a77741492f78d5980` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xd23d97b31a53867fe1a7ae60323f7f6415c450ecea393d7e3f66bdeff4a3f679` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xe2241dc1fc4b825e92b2a7c34e9a0756b95a4055f1ab177e1e083cf4f2e8b853` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0xe6606a9a83f6de1120f068cbca90170589b6010d38d84bf4ae50cf7face755a0` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xe7a716a78809ae8510bf3c04546c5ca404dd4e343d566dca1843dde50b208464` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xe7ae3082f572de6d8e60ccc44e046a9bb8c96dec6e5aa5b77cc72cfaebe4cd95` — **divergent**. Measured 250 bps at amount_in 1000000000000; the code says 200 bps. flat schedule
- `0xe91a507a413943c2bd9dea849c5aa50adfe76954ec9893b2798d4e9371adcce7` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xeb6c02fe3cdf87d8b96176c436a3c07747ada4912e3cc1ac63dfec02d876694f` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xef3757b83ba4713cdfff0d7df3cad554451a95fdfc910b61becdb1d91f0819c2` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xf8f89272028df7a2a38a13503c7bee95834b1e5bf901c55e1762cb8e77462845` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xf97c50a63e7393e9c6af4f57dfa9efbd676fa0c100ea3618ec5afb10d2e8c3e7` — **unverified**. Measured 0 bps at amount_in None; the code says — bps. getFeeSchedule(bytes32) on 0x0000000000000000000000000000000000000000: ValueError: empty return ('0x')
- `0xfccf3e0357a1e5ce1bbc237eebebc3bedc4fd86ed6cd09c1af75013700062be4` — **divergent**. Measured 521.25 bps at amount_in 1000000000000; the code says 417 bps. decay finished 167216s before the measured block

### `0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000` — SatoInitGuardHook

- **contract**: `SatoInitGuardHook` — 2 own files, 204 lines
- **measured**: 8 MEASURED rows of 16, 1 pools, median 0 bps
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

### `0xc75a2eb1ef9c3fe2f41adf73036984b16f6d28cc` — None

- **contract**: `—` — 4 own files, 496 lines
- **measured**: 16 MEASURED rows of 16, 1 pools, median 198.9972 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xd60d6b218116cfd801e28f78d011a203d2b068cc` — Clanker Dynamic Fee Hook v2 (Base)

- **contract**: `—` — 12 own files, 1504 lines
- **measured**: 339 MEASURED rows of 512, 32 pools, median 119.7485 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xdd5eeaff7bd481ad55db083062b13a3cdf0a68cc` — Clanker Static Fee Hook (Base)

- **contract**: `ClankerHookStaticFee` — 9 own files, 995 lines
- **measured**: 64 MEASURED rows of 64, 4 pools, median 19.9554 bps
- **concordance**: concordant — 4 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0 bps (tolerance ±0.5)
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
#      = — bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x63f2c29114748e322ddb3eb0a8c7647c7717557ce1ca318d7d87b20b6a13c17f' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 19.9601 bps at that size (gap 0 bps)
```

### `0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc` — LaunchHook

- **contract**: `LaunchHook` — 4 own files, 1042 lines
- **measured**: 128 MEASURED rows of 160, 10 pools, median 99.9938 bps
- **concordance**: concordant — 10 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **largest gap measured − code**: 0.0001 bps (tolerance ±0.5)
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
#      = 100 bps on this pool, this direction, amount_in 1000000000000

# the instrument, which never read the contract, says:
grep '0x221a4ef99beb7d37d31662976ac927151aab59e60826c02da1ea646f7d4ef2e6' docs/dataset/measurements.jsonl \
  | python3 -c "import sys,json;[print(json.loads(l)['bps']) for l in sys.stdin]"
#   -> 99.9999 bps at that size (gap -0.0001 bps)
```

### `0xdfe0f6d6cdda8f8ea47d6c5bddbdea51425290c0` — HomelanderUniV4Plugin

- **contract**: `—` — 5 own files, 337 lines
- **measured**: 14 MEASURED rows of 16, 1 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xed14ee7501fb212f876714a68308564cd6772000` — None

- **contract**: `—` — 14 own files, 3563 lines
- **measured**: 80 MEASURED rows of 80, 5 pools, median 0 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

### `0xf85f1f3082cfbc5e1149972309b25054e4d420cc` — B20Hook

- **contract**: `—` — 1 own files, 362 lines
- **measured**: 130 MEASURED rows of 144, 9 pools, median 99.9691 bps
- **concordance**: no rate in the code — 0 concordant / 0 divergent / 0 not resolvable / 0 unverified
- **where is it taken**: —
- **announced**: —
- **modifiable**: —

## 4. The hooks whose source we do not have

These keep the label **"behaviour not read"**. No intent, no mechanism, no rate and no concordance is attributed to them. The measurement stays true; the reading does not exist. `engine/tare/source/classify.py` enforces this by construction — a record with `read=False` carries no classification field at all — and `engine/tests/test_source.py` fails if it ever does.

- **`0x00000000000000000000000000000000dead0030`** — 4 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x0b6d076d2c68e6abf26aaf40919e84739b7f4145`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x0f69bcb0f8f0c210669641c2f39db5c2ca9e00cc`** — 0 MEASURED rows of 112, 7 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x100d7855adac79d90a75b7a89cf99a9f2b0100c4`** — 3 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x11f2c555b4ab5aae2b2614efd44e6e5ba50100cc`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x13b399b5c738a591ae23039ee1ebbb7f660f80cc`** — 16 MEASURED rows of 16, 1 pool(s), median 4999.1029 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x16238679a909ddddebadde0e4cc6badf70b3a5c7`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x16c0a78b6fbbc4ee56074954ba9193d1f31e90c0`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x19677dfef06669edc9bd4a8ef1a207227b5760c0`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x1b12abe48a0e1eeac05dbc4a9288520504d6c5cf`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x23a82b4d32c5e253689897d87d632dedcdfe20cc`** — 16 MEASURED rows of 16, 1 pool(s), median 499.9777 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x24e081f4da1ce6f8c194a031ae7aecb7910968cc`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x2aa659040c4ca704600f4262cc9d0f432d4aa0cc`** — 64 MEASURED rows of 64, 4 pool(s), median 279.9984 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x2cfa8e228f59dca14ebc5de0311c656c6cb970cc`** — 15 MEASURED rows of 16, 1 pool(s), median 299.9789 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x2d0d55e8d4418ce6157cf31d9ffafb88117c0040`** — 240 MEASURED rows of 240, 15 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x331c79a47ef0409eb05c7142ab3262f68315c0cc`** — 8 MEASURED rows of 16, 1 pool(s), median 298.7717 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x352740b15f14b3cce38d8c2bc466f57e214620cc`** — 22 MEASURED rows of 32, 2 pool(s), median 0.0002 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x376b786aa1c1deaae37ad6976784eb12988980cc`** — 16 MEASURED rows of 16, 1 pool(s), median 4999.2281 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x47668d84d299c7732b1f05798e15583ac4fa25c7`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x485f5f338b1c5997925663fe46015bd733a8c044`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x48a011cb654327c3209c00110832190a364760cc`** — 7 MEASURED rows of 32, 2 pool(s), median 210 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x4d7bc684cc263abe62e2463eade03104732525c7`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x5641f004773b348b9498bdccb728a9db56bc80c4`** — 7 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x5f3e9830be71ced621c62743c8451a37eb2310cc`** — 16 MEASURED rows of 16, 1 pool(s), median 149.9499 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x6e4e217ac96721cb12c9ba66e68090a098102acc`** — 8 MEASURED rows of 16, 1 pool(s), median 99.9891 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x78a9763f7dc8c0fb80b037a379e82ddcc54a50cc`** — 16 MEASURED rows of 16, 1 pool(s), median 149.9499 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x7dbaf6df37436da054d95a845ad5e4cd42c500c4`** — 7 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x7f1d86c9e8811346f85e3e12a42d6d62184c0a44`** — 8 MEASURED rows of 16, 1 pool(s), median 99.9983 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x802b438db6db843422afc9a8202db8d1521110cc`** — 8 MEASURED rows of 16, 1 pool(s), median 250 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x81afcad9595050c76f96e82ec1ad8c39ddae00c4`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x82ff97062ad0c9bbe3d0355831109ed7ac41a044`** — 10 MEASURED rows of 16, 1 pool(s), median 100 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x899c3260de6f3f8109e6e7ea0eb2d1a751a480c4`** — 7 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x920f85baf26c38993360616f52c4cac798c5c0c4`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x92708e7d3b91d7931c437d74743cb586378280cc`** — 16 MEASURED rows of 16, 1 pool(s), median 2806.9087 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x990500a7354f66454e08fb5967af2a41ba7e00c4`** — 12 MEASURED rows of 32, 2 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x99a680fbb9010213f356680a3897791aa9f52044`** — 8 MEASURED rows of 16, 1 pool(s), median 99.9992 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa10a6f4b918e963ec8694d37aa22e438706fe8cc`** — 0 MEASURED rows of 48, 3 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa2d523d2da40f34c5bb58f528218e9cb7f4a40c4`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa3d67ad7458302a87e3f3c0a833ce11185f0c080`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa41844f273c2e624fe80a037c5323f124219c040`** — 32 MEASURED rows of 32, 2 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa4b8ceab9b8663394d48f1df0fdcc1e7237680cc`** — 16 MEASURED rows of 16, 1 pool(s), median 4999.3272 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xa848e063a63d164f2a25d71446c90449b9ba6040`** — 14 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xacc700fef049865e42797d9b92e5d7a416dd8040`** — 32 MEASURED rows of 32, 2 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xb15540c833f49674b5af54f6e8d3f8d65d8bc044`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xb6394ef82ce153d351bcee81b9ee310c47348acc`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xb995b9efcc8021300bdc93fbd0c156e9a5ca0088`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xbbecf9319f341deaec5f8454e74dbccf63409040`** — 6 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xbbf0b679aee2d9e158730280a29e31e3875065c7`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xbd00cfb22b196ed2d774cc9466715ba23c640a44`** — 8 MEASURED rows of 16, 1 pool(s), median 99.9992 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xbe7944e52b97d3b86e975ab8c0b19ea051754040`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xc783f473fe15f0ffc372930a20096eed28764044`** — 16 MEASURED rows of 16, 1 pool(s), median 100 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xc90eddf51569270e06270ea98f7efff828dde0cc`** — 32 MEASURED rows of 32, 2 pool(s), median 299.7845 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xcca1d925ea4e397b6d7b2a0065a316c027d380cc`** — 4 MEASURED rows of 112, 7 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xccd1eabb94f111e5b7673e5cb7a315dfcda870c4`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xcee1c8061f17164390b7f392587d3a53d8acc0cc`** — 9 MEASURED rows of 16, 1 pool(s), median 249.9951 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xd238b0054a92d96907e8c1f009da24ea560be0cc`** — 16 MEASURED rows of 16, 1 pool(s), median 499.9694 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xd3200486161288d4ea021c13f32a198bdeb080cc`** — 8 MEASURED rows of 16, 1 pool(s), median 298.7782 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xd734ffd79a9c3719025ec0d39492943b6ef620cc`** — 16 MEASURED rows of 16, 1 pool(s), median 499.9777 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xd7b5de859876c8c2748271c2f5f7b765d24340cc`** — 16 MEASURED rows of 16, 1 pool(s), median 4999.2558 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xd8a63c167d5509d433d23659ba87cae2b87200c4`** — 8 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xdc786b620004ab27fe37380322416c9b4900f0cc`** — 15 MEASURED rows of 16, 1 pool(s), median 299.9935 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xdf5aa675ad2d7dd62b94aafd94ef171c84604044`** — 16 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xefc1713454c726cf0f525ae26c6f1688b9e1a0c0`** — 0 MEASURED rows of 16, 1 pool(s), median — bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044`** — 6 MEASURED rows of 16, 1 pool(s), median 1.0129 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xf52c1d5f3b0e985248870b648dc374a3c77c80cc`** — 16 MEASURED rows of 16, 1 pool(s), median 4994.1452 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xf6ee4dc7d26790f62d617e58094136f9725f8880`** — 4 MEASURED rows of 16, 1 pool(s), median 1788.1454 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xfb4445a99c0ec221791afa991af1297f84b0e0cc`** — 16 MEASURED rows of 16, 1 pool(s), median 499.9722 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xfdc5cb0ba5c7a7f9724db73d9922912b6ee990cc`** — 15 MEASURED rows of 16, 1 pool(s), median 249.8998 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment
- **`0xfe2097a7b5a6a5880517987f5a602f583d3700c4`** — 5 MEASURED rows of 16, 1 pool(s), median 0 bps. no provider holds a verified source for this address (sourcify=NOT_FOUND; etherscan=UNAVAILABLE)
    - `sourcify` → `NOT_FOUND`
    - `etherscan` → `UNAVAILABLE` — no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment

A Sourcify `NOT_FOUND` means: Sourcify holds no verified source for that address. It does **not** mean the contract is unverified everywhere, and it certainly does not mean the hook takes nothing — one of the addresses above measures 0.00 bps on every row, and that number is a measurement, not an exoneration.

## 5. What this file still does not say

1. **A concordant rate is not a legitimate rate.** Recovering the 100 bps written in a contract proves the instrument reads the right number. It says nothing about whether that number was shown to the person who signed the swap. LIMITS.md §6 stands, unchanged, except for its last sentence.
2. **Each family's model is hand-written from the source.** It is cited line by line and it lands on 4801 of 4895 comparable pools, but it is a re-implementation of the arithmetic, not the bytecode. Where it disagrees, either the model or the world is wrong, and this file does not assume which.
3. **One block, one size per pool, one direction.** The reference size for a pool is the smallest measured size whose rounding noise is below a tenth of the tolerance (`QUANT_FRACTION` = 0.1); one pool in this corpus quotes 2 458 units of output at 1e14 in, where a single unit is worth 4 bps. The other sizes bend away from the rate for the reason LIMITS.md §6 already gives, and that is not a disagreement.
4. **Some pools cannot resolve a rate at all.** Where the quote does not respond to size (elasticity below 0.05: ten times the input buys the same output), a fee taken out of the *input* cannot move the quote, so the counterfactual has nothing to measure. Those pools are `NOT_RESOLVABLE`, not `0`, and not `DIVERGENT`.
5. **These hooks do more during a swap than take a fee.** Several claim accrued fees or call a pool extension inside the same callback; those calls move the pool's state before the swap runs with the hook and do not run at all with the stub. The models do not price them, and that is a candidate explanation for a residual gap — a candidate, not a finding.
6. **`hookData` is always empty** (`engine/tare/quote.py`), so any router-driven branch is unexercised: LaunchHook's referrals, Clanker's MEV-module payload, Doppler's swap data.

Unchanged: [`LIMITS.md`](../LIMITS.md) for what the measurement cannot tell you, [`HONESTY.md`](../HONESTY.md) for the labels and the eight false results that produced them, [`METHOD.md`](../METHOD.md) for how the number is made.

