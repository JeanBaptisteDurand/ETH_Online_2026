# PR to `Uniswap/hooklist` — one optional numeric field

The registry describes 869 hooks with 27 leaf fields, 19 of them booleans, exactly one of them
numeric (`hook.chainId`, a network identifier) and **none of them a magnitude**. This directory holds
a ready-to-open pull request that adds one: `properties.measuredExtraction`, optional, carrying
`{ bps, block, method, sourceUrl }`.

| file | what it is |
|---|---|
| [`schema.patch`](schema.patch) | the diff — one hunk, 38 lines added, 0 removed, `schema.json` only |
| [`PR.md`](PR.md) | the pull-request body, with the numbers that justify it |
| [`validate.py`](validate.py) | the checks: non-regression on all 869 upstream entries, acceptance, and 11 rejection cases |

## Why the field cannot be added without touching the schema

`schema.json` sets `"additionalProperties": false` in four places — lines 10, 21, 99, 154 (root,
`hook`, `flags`, `properties`). Any key not declared centrally fails validation, so a contributor
cannot attach a number to their own entry. The field has to be in the schema or it cannot exist.

## Apply and check

```bash
git clone https://github.com/Uniswap/hooklist && cd hooklist
git checkout 862303733d34aa36fad0d8c5275163c387be80d6      # the commit this patch was cut against
patch -p1 < /path/to/docs/pr-hooklist/schema.patch
```

Then, from the TARE repository:

```bash
python3 docs/pr-hooklist/validate.py
```

`validate.py` downloads the upstream `schema.json` and `hooklist.json` at that pinned commit,
applies `schema.patch` to a scratch copy, and asserts that the result is exactly the schema it then
tests. It needs no dependencies: it uses `jsonschema` if it is installed and a built-in draft-07
subset validator otherwise, and it **fails rather than choosing** if the two disagree.

Expected output:

```
0. schema.patch applique au fichier amont -> identique au schema teste ici
validateurs actifs : jsonschema, builtin
1. non-regression : 869/869 fiches amont valident inchangees contre le schema patche
   controle du controle : 869/869 valident aussi contre le schema amont
2. acceptation : fiche + measuredExtraction bien forme -> VALIDE
   le schema amont la refuse (additionalProperties: false) : le patch est bien necessaire
3. refus : 11/11 formes malades sont refusees
TOUS LES CONTROLES PASSENT
```

## The number this field would carry, for a hook already in the registry

`0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc` — registry: `"Clanker Static Fee Hook v2 (Base)"`,
`dynamicFee: true`, `auditUrl: ""`. Also on Uniswap's routing allowlist
(`hooksAddressesAllowlist.ts:25`). Measured by TARE at block 50,614,000: **95 rows above 1 bps on
pools whose stored `lpFee` reads 0, median 119.70 bps, max 1176.46 bps**.

Replay: `python3 docs/feedback-evidence/routing_allowlist.py`.
Full feedback to Uniswap: [`../../FEEDBACK.md`](../../FEEDBACK.md).
