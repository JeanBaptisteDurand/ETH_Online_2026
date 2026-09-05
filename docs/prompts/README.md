# Prompts and planning artifacts

ETHGlobal requires that submissions *"clearly document where and how AI tools were used"* and
*"include all spec files, prompts, and planning artifacts"*. This directory is that record.

## How this repository was built

Every non-trivial piece was written by a Claude Code subagent given a written brief, then verified
by a gate that the agent could not fake. The briefs are the `wave-*.js` files: each is the literal
script that spawned the agents, containing the exact prompt each one received.

| file | what it commissioned |
|---|---|
| `pre-build-validation.js` | originality check, duel against 27 async finalists, graph-stack choice, front research — run **before** any code |
| `wave-1-build.js` | the sweep, the API, the instrument, the landing page, the MCP server |
| `wave-2-graph-metering-guard.js` | the graph, the per-measurement meter + HCS log, the assistant, the guard, the delivery artifacts |
| `wave-3-assistant-graph-docs.js` | wiring the assistant into the instrument, exposing the graph, METHOD/LIMITS/HONESTY |
| `wave-4-rag-llm-source-coverage.js` | the vector RAG, the LLM planner, reading the hooks' source, full coverage, a zero-bug pass |

Each brief carries the same four non-negotiable rules, verbatim, because they are what the product
is about:

1. The model never produces a number.
2. Labels are never promoted.
3. Never conclude on a truncated response — a bounded read is `NOT_MEASURABLE`, never a value.
4. Every value carries its block, size and direction, and replays with one command.

## The planning record

`../planning/` holds the documents the work was planned against, including
`01-adversarial-audit.md` — the record of a previous project direction being killed after its own
figures failed review. It is included deliberately: it is the clearest evidence of how claims in
this repository were arrived at.

## Where AI was used

All of it, and the verification too. What is *not* AI-generated is the measurement itself: every
number in `docs/dataset/` comes from an EVM fork, and the gate in `engine/tare/gates/a3.py`
recomputes five of them on every run against values obtained independently.
