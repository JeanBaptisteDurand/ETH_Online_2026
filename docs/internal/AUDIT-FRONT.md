> **Internal working document, kept for the record.**
>
> What it is: an audit of the front-end as it stood on 12 September 2026 — what the `design/tare` branch had done, what was still missing for a judge to understand the product, and the full specification of the account, the API keys, the MCP server and the extension.
>
> It is a snapshot, not documentation. Most of what it lists as missing has since been built (the deck, the developers page, the roadmap, the wallet connection and the session token), so read it as the brief that produced that work, not as a description of the product. For the product as it stands, read the [root `README.md`](../../README.md) and the live site at <https://tare-hooks.tech>.

---

# TARE — the state of the front-end, what is missing, and how to wire up the account

> **Who this document is for.** The Claude doing the design, and JB. It says three things:
> what the `design/tare` branch did, **what is missing for a judge to understand the product**,
> and **the full specification of the account, the API keys, the MCP and the extension** —
> because those four exist in the code, work, and are visible nowhere on screen.
>
> Everything written here was checked in a browser or in the code, as of
> 12 September 2026. Where something could not be checked, that is written.
>
> The rest of the context is in [`FRONT-BRIEF.md`](FRONT-BRIEF.md) (section 0: what is frozen,
> what is yours) and in [`PROMPT-FRONT.md`](PROMPT-FRONT.md).

---

## 1. The `design/tare` branch

One commit, `b1bde67`, "design skeleton", by Florent Belotti. He touched only `apps/web`:
not the landing, not `src/lib/`, not the engine, not the contracts. **The build passes. Zero
console errors across the sixteen routes. No new horizontal overflow.** The
input → execution → output triptych is intact on the fourteen tool pages, and `donnees.ts` is
still the source of the datasets. The work is clean and stays within scope.

What he added that is really good:

- a **system map** (`Carte.tsx`, 500 lines): the 27 datasets upstream, the
  14 tools, the orchestrator at 6/6 steps in 13,680 ms;
- on `#/outil/1`, a **paired figure** that puts `out_with` and `out_without` on a base of 100,
  **names them**, and adds the gloss on the PoolKey — which my version did not do;
- a glossary of the seven returned fields;
- the stub's hash in full in the header, with its provenance labels.

One decision he made that needs to be signed off: on the tool page, **the output is displayed
before the input**. That is defensible — the result is shown first — but it contradicts the
reading order documented in the brief. It needs a decision; it is not a defect.

---

## 2. Can you understand the product from the home page? — No

This is the heaviest finding in the document, and it is **measured**, not felt. Over the
rendered text of the whole home page:

| word | occurrences |
|---|---|
| **Uniswap** | **0** |
| **v4** | **0** |
| hook | 24 — **never defined** |

The sentence that explains the product **exists**: *"What a Uniswap v4 hook really takes on
a swap. The same swap quoted twice, with the hook and with an inert stub. The gap is the
measurement."* It is in the `<meta name="description">` of `index.html`. **It is rendered
nowhere on the page.** Nobody reads it.

The reading order is backwards for someone arriving cold:

| screen | what they see | what it tells them |
|---|---|---|
| 1 | "The chain and its 14 tools" + the map of the 27 datasets | an **internal architecture**. They do not yet know what this is about |
| 2 | 99.03 against 100.00 → **96.74 bps**, and the raw wei | the method and the figure — at last |
| 3 | "Paste a token address" | the action |

And one sentence disappeared along the way. `main` opened on:

> "where to buy this token, and what it costs — 125,072 embedded measurements · no request.
> Paste a token's address. We tell you which pool to buy it through, what that pool takes — LP fee
> plus the hook's take, measured — **and what you have left out of 100.**"

"And what you have left out of 100" was the only sentence that told the visitor **what they
get**. It no longer exists.

---

## 3. The account, the API keys, the MCP, the extension

**This is the highest-return part of the document**, because everything that follows **is already
written, tested, and needs nothing but screens**.

### 3.1 The actual state, on screen

| element | in the code | on screen |
|---|---|---|
| account panel | yes, panel 15 of `#/instrument` | **present, but 628 characters**: it stops at "no wallet announced" |
| wallet connection | **EIP-6963**, written by hand in `src/compte/api.ts` | a status message, **no button** |
| API keys | `Compte.tsx` — "one per surface" | **never visible** without a wallet |
| **extension download** | `GET /compte/extension.zip` | **`extension.zip`: 0 occurrences in the rendered text of the 16 routes** |
| **MCP download** | `GET /compte/mcp.tgz` | **same, 0 occurrences** |
| **MCP configuration** | `apps/mcp/README.md` | **nowhere on the site**: `mcpServers` 0, `claude_desktop` 0, `stdio` 0 |
| subscription read on-chain | `POST /compte/abonnement` | in prose only — expected, the contract is not deployed |
| history | `GET /compte/journal` | in prose only |

**RainbowKit: absent, and that is not an oversight.** Wallet discovery goes through
**EIP-6963** (`eip6963:requestProvider` / `eip6963:announceProvider`), written by hand, without
wagmi, without viem, without WalletConnect. The reason is sound: with two wallets installed,
`window.ethereum` shows only one and hides the other. **The consequence is real: no QR
code, no mobile.** A judge who opens the site on their phone cannot connect.

### 3.2 The two authentications — they never mix

It is the rule in `router.ts`, and the interface must reflect it:

| | who carries it | header | what it opens |
|---|---|---|---|
| **session token** | a **human** in front of a browser | `authorization: Bearer <token>` | read the account, manage the keys, read the history |
| **API key** | a **machine** — the extension, the MCP | `x-tare-cle: <key>` | **write to the history log, and nothing else** |

> **A key can never create another one.** That is deliberate, and it deserves to be said on
> screen: it is a security argument a jury understands in one sentence.

### 3.3 All the account routes

| method | route | auth | what it does |
|---|---|---|---|
| `POST` | `/compte/nonce` | — | `{adresse}` → a single-use nonce |
| `POST` | `/compte/session` | — | `{adresse, nonce, signature}` → a session token |
| `DELETE` | `/compte/session` | Bearer | sign-out |
| `GET` | `/compte` | Bearer | the account: subscription, keys, state |
| `POST` | `/compte/cle` | Bearer | `{portee: 'extension' \| 'mcp', nom?}` → **the key, returned ONCE ONLY** |
| `DELETE` | `/compte/cle/:id` | Bearer | revoke a key |
| `POST` | `/compte/abonnement` | Bearer | trigger the on-chain re-read |
| `GET` | `/compte/extension.zip` | Bearer + subscription | the extension package |
| `GET` | `/compte/mcp.tgz` | Bearer + subscription | the MCP server, packaged by `npm pack` |
| `GET` | `/compte/paquets` | Bearer | the state of the two packages |
| `GET` | `/compte/journal` | Bearer | the history — `?quoi=` and `?limite=` |
| `POST` | `/compte/journal` | **`x-tare-cle`** | the extension and the MCP post to it |

Two refusals the interface must render **as they are**, because they state their reason:

- creating a key without an active subscription → **402**, with `{error: "abonnement inactif", detail, abonnement}`.
  The code says so: *"a key is of no use without a subscription, and saying so here is better than
  issuing it only for it to be refused later, without anyone knowing why."*
- the key is **never** returned twice: the database keeps only its `sha256`. The API's
  message is `« notez-la maintenant : elle n'est rendue qu'une fois »` ("write it down now: it is
  returned only once"). **The screen must show it once, large, with a copy button, and never
  claim to be able to read it back.**

### 3.4 What has to be built, screen by screen

None of this exists on screen today. All of it exists on the API side.

1. **A "connect" button** that lists the wallets announced through EIP-6963, and, if there
   are none, says what to install — that is already the current text; what it lacks is the button.
2. **Two key cards**, one per scope, with their reason for existing:
   - `extension` → *"so that the extension posts its verdicts to your history. It works
     without one, offline."*
   - `mcp` → *"so that the MCP server posts its calls to your history. It works without one."*
   In both cases, **the key is optional** — that is an argument, not a limitation, and it has
   to be written.
3. **The new key, displayed once**, large, with "copy", and an explicit warning.
4. **Two download buttons** — extension and MCP — with their prerequisite (subscription) and,
   just below, **the installation instructions** from section 3.5.
5. **The history**, with its `quoi` and `limite` filters.
6. **The subscription**, with the "re-read on chain" button and the reasoned refusal when the
   reading fails: *"subscription not verified, therefore not active"* — never "subscribed" on the
   strength of a transaction that went out.

### 3.5 Installation, to be displayed on the site

**The extension** — `chrome://extensions` → Developer mode → **Load unpacked** → the unzipped
folder. The API key is set in the options page. Without a key, it works: the measurement
table lives in its service worker, **it makes no request**. The default API is
`http://127.0.0.1:8787`, and the key is stored under `tare.cle_api` in `chrome.storage.local`.

**The MCP server** — in Claude Desktop, add to
`~/Library/Application Support/Claude/claude_desktop_config.json`
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "tare": {
      "command": "node",
      "args": ["<path>/apps/mcp/dist/src/index.js"]
    }
  }
}
```

In Claude Code, one line:

```bash
claude mcp add tare -- node <path>/apps/mcp/dist/src/index.js
```

**The key is optional**: `TARE_CLE_API`, with scope `mcp`, and it is used **only** to post
the calls to the history. Without it, the server answers from the **125,072 committed
measurements** and sends nothing to anyone. Its four tools: `tare_measure`, `tare_lookup`,
`tare_impact`, `tare_twins`.

---

## 4. The VM replay — a regression

`main` showed, on `#/outil/1`, **six runs of the counterfactual — the strongest in the
corpus**, each with its two raw values and **its own replay command**, under the
sentence that explained the approach. Including this one:

| hook | direction · size | bps | with the hook | with the stub |
|---|---|---|---|---|
| `0xb429d62f…` | 1→0 · 1,000,000,000,000 | **9,999.5279** | 76 | 1,609,989 |

`design/tare` keeps **only one**, and it is the **median** (100.00 bps). −1,612 characters,
**five replay commands lost**, and the most spectacular case in the corpus along with them.

His choice is argued for in his own code — the maximum is a pool out of which almost nothing
comes, true but unreadable as a figure. **He is right about the figure. The fix is to add,
not to replace:** his median figure at the top, and the six rows below it, expandable.

---

## 5. Four figures that lied — already fixed and pushed

Found by cross-checking the landing, the instrument and the design branch. **None was covered
by a test.** All four are fixed on `main`, and three now have a test.

| | what was displayed | the truth |
|---|---|---|
| **the landing's headline** | "1,559 hooks. **Zero** declare." and "not one emits either" | **9 declare** — the section just below already said so, with nine boxes lit. The headline now **reads** `hooks_declaring`, and a test rejects the two dead sentences |
| **the attestations** | "**99** hooks attested" in large type | `build-facts.mjs` labelled as "written" what is **"to be written"**. **16** are on-chain, each with its hash. Now: 99 computed · 17 transactions sent · **16 written** · 13 set aside for lack of a measurement |
| **the `<noscript>`** | "128 measurements, 4 hooks, 32 pools", and it cited `docs/measurements-v1.json`, **a file that no longer exists** | 125,072 / 112 / 7,817. Served on **every route** to anything that does not run JavaScript — an indexing crawler, a link preview. Fixed, + test |
| **"37 % of prize-winning projects"** | attributed to the **site** | in an earlier internal note, the 37 % referred to "extension · mobile · WhatsApp · mini-app". Replaced by the figure that really supports the argument: **the 27 projects that won prizes in the asynchronous format all had a live demo URL, 27 out of 27** |

---

## 6. The landing and the instrument: who misses what

Two surfaces, two roles. The **landing** (`/`, in **English**) carries the argument in 8 sections.
The **instrument** (`/hooks/`, in **French**) carries the product. They do not duplicate each other —
but each one has a gap.

### A judge who sees only the instrument's home page misses

1. **Why the number is valid.** That the **PoolKey contains the hook's address**, so that
   "the same pool without its hook" does not exist, so that its **bytecode** is what gets replaced.
   Without that, "96.74 bps" is one figure among others. **The costliest loss.**
2. **Why the project exists.** The official registry: **978 entries, 27 fields, 19 booleans,
   0 quantities**, and `"additionalProperties": false` — *the schema does not omit a number, it
   forbids adding one*. Absent from the home page. And "9 hooks out of 1,559" appears there only
   **inside a closed collapsible**, as an aside in a file description.
3. **The scale.** "125,072 measurements" without **7,817 pools · 112 hooks · 8 sizes · both
   directions**. 125,072 measurements of a single pool would give the same figure.
4. **That the rate depends on the size.** The size selector is there without a word; the
   A3 demonstration (5 sizes, ±0.05 bps, an independent rewrite that predates the code) is not
   there.
5. **"What I do not know".** 61,916 rows out of 125,072 are **not** values;
   `NOT_QUOTABLE` ≠ `NOT_MEASURABLE`; two past mistakes published with their correction;
   no named attribution. **The instrument has no limits section.** The discipline is
   coded everywhere — reasoned refusals, `<NonLu>`, truncation counters — it is **never
   argued**. A jury cannot give credit for what it does not read.
6. **78 of the 112 measured hooks are absent from the registry**, and **7,794 pairs out of 7,802
   have only one pool**. The two facts that turn "this hook takes X" into "and you cannot
   escape it".

### A judge who sees only the landing misses

1. **Three surfaces out of five: zero words.** The extension, the MCP server, the account.
2. **The gesture.** Pasting an address and getting a ranking of doors. The landing *promises* it
   in section 06; its own field decodes only the 14 permission bits.
3. **The total cost.** The landing publishes only the hook's take; the instrument adds
   the **LP fees read on chain**. It is the total that decides for a user.
4. **The proof that the counterfactual does not lie**: door A4, a swap **actually executed**
   matched back to its quote to the wei. Reduced to a subordinate clause with no figure — when it is
   a v4 judge's number-one objection.
5. **The end-to-end chain**: 6/6 steps in 13,680 ms, real transaction → verdict → another
   door → paid measurement → HCS anchoring → signature on the device.
6. **The details that win sponsor prizes**: x402 at **0.001 USDC** with a 402 that
   announces its price and a **dynamic price** (five measurements cost five times as much), the
   signing key **sealed in a Ledger**, **HCS-14** named and recomputable, **Permit2** and the
   `0x0a10` command list, and the replacement transaction **never sent**.

---

## 7. What is left to do, by priority

### Must do — four items, all text, no design

1. **One sentence at the top of the home page**: what TARE measures, on **Uniswap v4**, and for whom.
   The word "Uniswap" is nowhere on the page today.
2. **The counterfactual in two sentences** under the figure: the PoolKey contains the hook → the
   bytecode is replaced with 89 inert bytes → on a pinned fork → the gap is the
   take.
3. **Put the six counterfactuals back** on `#/outil/1`, expandable under the median figure,
   including the hook at 9,999.53 bps.
4. **Bring out of the collapsible** "9 hooks out of 1,559 declare" and "the registry has
   0 quantities, and its schema forbids adding one".

### High return

- A **"what I do not know"** section on the instrument — it is what makes the rest believable.
- **The scale of the corpus** next to "125,072": 7,817 pools, 112 hooks, 8 sizes, two directions.
- **Make the five ways in clickable** through to their surface.
- **The account screens** from section 3.4, and the installation instructions from 3.5.
- The sentence **"and what you have left out of 100"**, put back where it was.

### For JB to decide, not the front-end

- **RainbowKit**: about two hours, and it solves mobile. Without it, no connection from
  a phone.
- **The language**: the landing is in English, the instrument in French. A judge who follows the
  button goes from one to the other.
- **Does the landing talk about the product** (extension, MCP, account) or does it stay the pure argument?

### Pre-existing, worth knowing — nobody on this branch is at fault

- **`#/instrument` overflows at 390 px**: five `<th>` in `position: sticky` in the "The raw
  rows of this hook" table escape the `overflow-x: auto` container. Also present on
  `main`. The home page and the tool pages do not overflow.
- **`npm run build` on the landing takes 5 min 30 s** (the `facts.mjs` step), and
  `src/generated/facts.json` is **gitignored** — so it is regenerated on every deployment.
  Worth knowing before counting on a last-minute deployment.
- The "The registry against the measurement" table truncates the on-chain LP fees to 3 values + "+5"
  instead of 8, and the label has lost the word **"on-chain"**, which said where the figure came from.

---

## 8. What stays in JB's hands

Neither the front-end nor its Claude can do anything about these. If a screen says "pending",
**this** is what it is waiting for — it is not a bug to fix:

- enable GitHub Pages (Settings → Pages → Source: GitHub Actions);
- **revoke the Alchemy key**, still present in the public git history;
- deploy `AbonnementTARE` to a public network, then set `TARE_ABONNEMENT_CONTRAT` and
  regenerate the sheet — **until that is done, the account answers "subscription not verified,
  therefore not active", and that is the correct behaviour**;
- set `TARE_DEMO_URL` and regenerate;
- shoot the video;
- open the `Uniswap/hooklist` PR and send the Uniswap feedback form.
