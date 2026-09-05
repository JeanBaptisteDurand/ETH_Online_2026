<!-- Engendre par `python3 -m tare.submission.build --write`. Ne pas editer a la main :
     le corpus grandit, et un texte fige citerait un jeu qui n'existe plus. -->

# How it's made

Uniswap's own developer guide asks hooks to declare what they charge, through the `HookSwap` and
`HookFee` events. I computed both topic0 values and scanned 24,000 Base blocks: **five contracts in
total emit either one**. In the same window the PoolManager emitted 1,892 `Initialize` events
covering **84 distinct hooks — and none of those 84 emit either event.** The official registry
describes **978 hooks** with 14 permission booleans, four property booleans, a
`swapAccess` enum and a `chainId`. **Not one of its fields is a quantity.**

So I measured it.

**The wall.** A v4 pool's identity — its `PoolKey` — contains the hook's address. "The same pool
without its hook" therefore does not exist: it would be a different pool, with different liquidity
and a different price. That is why nobody publishes this number.

**The trick: don't change the pool, change the hook.** On a fork pinned to a block, `anvil_setCode`
rewrites the bytecode *at the hook's address*. The `PoolKey` is untouched, so `poolId`, liquidity,
`slot0` and the reserves are byte-identical. The only thing that changed in the observable universe
is the code that runs during the swap. Quote the same swap twice through `V4Quoter` — once with the
real hook, once with an inert stub — and the difference **is** what the hook took.

**The stub is 89 bytes and it is not a `STOP`.** `Hooks.sol` validates the *return data* of every
hook call: at least 32 bytes with the called selector echoed in word 0 (`:153`), exactly 96 bytes
from `beforeSwap` (`:166`), exactly 64 on the delta path (`:259`). So the stub reads the incoming
selector, echoes it, and returns 96 or 64 bytes accordingly. It is a protocol-compliant nothing.

**The corpus.** **5,170 measurements** across **455 pools** and **16 hooks**,
block **50,614,000** on Base, 8 swap sizes spanning eight decades and both directions.
Labelled 4117 `MEASURED` · 1038 `NOT_QUOTABLE` · 15 `NOT_MEASURABLE`. Every row carries its `pool_id`, block, size, direction, `stub_hash` and engine
version, and replays with one command.

**The finding.** **3,103 measurements above 1 bps sit on pools whose LP fee, read on-chain
from `slot0` bits 208-231, is exactly zero** — across 293 pools and 8
hooks, from 51.40 to **1176.46 bps**, median 100.00. And of the
16 hooks measured, **3 appear nowhere in the official registry at all.**

**Then I read the code, because a number without a cause is an accusation.** 14 of
16 measured hooks have verified source on Sourcify. For each I read the rate the
contract itself declares — on-chain at the corpus block — and compared it with what the
counterfactual had measured **without ever seeing that source**. **7 hooks are
concordant across 191 pools**, and the worst deviation among all of them —
not the best, the worst — is **0.0481 bps**. The
measurement recovers the number written in the contract to within thousandths of a basis point.

That reading also corrected my own framing, and the correction is the point. **These fees are
announced.** Zora states 1% in a NatSpec comment; LaunchHook emits `PoolRegistered` with the rate and
a `Trade` event on every swap. The claim is therefore not that hooks take money quietly. It is that
**the rate exists, it is written in the contract, and the registry meant to describe hooks has no
field able to carry it** — so a consumer choosing between two hooks the registry describes
identically has nothing to go on.

**What it refuses to do.** The model never produces a number: it picks what to query and explains
what came back. Four labels, never promoted — `MEASURED`, `INTERPOLATED`, `NOT_MEASURABLE`,
`NOT_QUOTABLE`. A bounded read, a timeout or a rate limit is `NOT_MEASURABLE`, never a value and
never a zero; `docs/HONESTY.md` documents eight false results this project produced before that rule
was absolute, four of them reproducible in this repository. A hook running custom accounting — where
removing the bytecode removes the venue rather than a fee — is `NOT_MEASURABLE` and gets no number.
A hook whose source I could not fetch keeps the label "behaviour not read" and receives no
classification.

**The stack.** Python for the engine and the graph (`networkx`, chosen over Neo4j after a benchmark
at target scale: Neo4j lost on every query and refuses EVM-sized integers). TypeScript for the rest:
Hono for the API, Vite/React for the instrument, an MCP server exposing four tools, and a browser
guard that decodes the hook out of Universal Router calldata and warns before you sign. Hedera
carries the paid API — measuring costs compute, so it is billed **per measurement, not per request**,
settled in x402 through Blocky402 on testnet, with each batch's digest anchored on an HCS topic and
verified back through the mirror node before it is ever called anchored.

**The gate.** `engine/tare/gates/a3.py` reproduces five recorded basis-point figures on every run,
against values obtained by an independent reimplementation before that code existed. It is the one
check no author can talk their way past.
