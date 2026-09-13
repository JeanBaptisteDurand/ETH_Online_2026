# Internal working documents

Everything in this directory is an **internal working document**, written in French, kept in the
repository for the record rather than as documentation of the product.

They are here for two reasons. ETHGlobal asks submissions to include the specs, prompts and
planning artifacts they were built from, and these are part of that record — the rest of it is in
[`docs/prompts/`](../prompts/) and [`docs/planning/`](../planning/). And a brief that has since
been executed is the clearest evidence of how the thing in front of you was arrived at.

**None of these files is current.** Each one is a snapshot of a day, and each says which day at the
top. Where any of them disagrees with the [root `README.md`](../../README.md), the README is right:
it is the one file whose figures a test recomputes from the published dataset
(`cd engine && python3 -m unittest tests.test_readme`).

| File | What it is | Written |
|---|---|---|
| [`FRONT-BRIEF.md`](FRONT-BRIEF.md) | the brief handed to the developer who took over the front-end: what the product is, which dataset feeds which tool, and in what order to show them to a jury | 12 Sep 2026 |
| [`PROMPT-FRONT.md`](PROMPT-FRONT.md) | the literal prompt given to the agent that redesigned the front-end | 12 Sep 2026 |
| [`AUDIT-FRONT.md`](AUDIT-FRONT.md) | an audit of the front-end as it stood that day, plus the full specification of the account, the API keys, the MCP server and the extension | 12 Sep 2026 |
| [`ETAT-2026-09-10.md`](ETAT-2026-09-10.md) | a state-of-the-project snapshot, surface by surface: what was measured, what was built, what worked and what did not | 10 Sep 2026 |

The one working document that is *not* here is [`docs/VOD.md`](../VOD.md), the shot list for the
demo video. It is still in use — the deck's nine beats follow its order — so it stays where the
code points at it. Its headings and its how-to are in English; the lines that are spoken on camera
are kept in the language they will be spoken in.
