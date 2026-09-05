<!-- Engendre par `cd engine && python3 -m tare.oneway --rpc <fork> --write --markdown`.
     Ne pas editer a la main : le corpus grandit. -->

# Pools that let you in and do not let you out

A v4 hook may charge a different rate depending on which way you swap. TARE sweeps **both**
directions at the **same** eight sizes, on the same pinned block, so the two are comparable.
Almost always they agree. On a handful of pools they do not agree at all.

Of the **2,298 pools measured in both directions**, **6** are flat one way and confiscatory the other: under **1.0 bps** going in, at least **1000 bps** coming back.
They sit on **6 hook addresses** — but only **2 distinct contracts**: one of them is deployed more than once, and counting the deployments would count the same fact twice.

| hook | pool | in | out | sizes | LP fee |
|---|---|---|---|---|---|
| `0xd7b5de859876…` | `0x59c65b1af1d6…` | **0.00 bps** | **9999.00 bps** | 8 | 3000 |
| `0x376b786aa1c1…` | `0xafb6c01f4cab…` | **0.00 bps** | **9999.00 bps** | 8 | 3000 |
| `0x13b399b5c738…` | `0xa5a63da439dd…` | **0.00 bps** | **9999.00 bps** | 8 | 3000 |
| `0xa4b8ceab9b86…` | `0x8397fa99afb2…` | **0.00 bps** | **9999.00 bps** | 8 | 3000 |
| `0xf52c1d5f3b0e…` | `0x8289b4e5c867…` | **0.00 bps** | **9999.00 bps** | 8 | 3000 |
| `0x9ce0e33e68c7…` | `0xbbe6d8579521…` | **0.00 bps** | **4995.00 bps** | 8 | 100 |

The rate holds across every size measured — eight decades of swap size — which is what
separates a rate from an accident on one quote. The per-size figures are in
[`docs/dataset/one-way.json`](dataset/one-way.json), and each row replays with one command.

## Identical code, deployed several times

- `a0a9a3c0a9672c56…` — **5 hook addresses**: `0x13b399b5c738…`, `0x376b786aa1c1…`, `0xa4b8ceab9b86…`, `0xd7b5de859876…`, `0xf52c1d5f3b0e…`
- `3e51a16aaf58083b…` — **1 hook address**: `0x9ce0e33e68c7…`

## What this report does not say

It does not say *scam*, *trap* or *honeypot*, and it attributes no intent. None of these
contracts has verified source on Sourcify, so under this project's own rule they keep the
label **behaviour not read**: no mechanism, no intent, no explanation is attributed to a
contract whose code nobody has read. What is published is a measurement and its shape —
one direction flat, the other confiscatory, at every size, replayable.

`1000 bps` is a **publishing threshold**, not a natural boundary. It was
chosen to retain only what no ordinary fee model explains. Move it and the list moves; the
threshold travels with the report so that anyone can.

**None of these 6 hooks appears in the official registry** (978 entries, `docs/hooklist-live-20260905.json`).
