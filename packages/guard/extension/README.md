# TARE Guard — extension

A minimal Manifest V3 extension. It does one thing: install the guard at `document_start`, in the
page's own world, before any wallet has published `window.ethereum`.

## Why `world: "MAIN"` and `document_start`

A wallet publishes its provider very early, and some publish it more than once. Running in the
isolated world would leave the page's `window.ethereum` untouched, and running at `document_idle`
would arrive after the provider is already in use. `installTareGuard` covers three doors: a
provider already present, one assigned later (via a `defineProperty` accessor that preserves the
setter, so no wallet breaks), and EIP-6963 announcements.

## Build

```bash
cd packages/guard && npm run build:extension    # bundles src/browser.ts -> extension/inject.js
```

## Load

`chrome://extensions` → developer mode → *Load unpacked* → this directory.

The `icons` entry is not decoration: Chrome **refuses to load** an extension whose declared icon is
missing (*"Could not load icon 'icon128.png' specified in 'icons'"*). This directory shipped without
it until 9 September 2026, which meant the extension could not be installed at all — the one defect
a passing test suite will never catch, because no test loads a browser extension.

## What it does, and what it does not

It intercepts `eth_sendTransaction` only. Everything else passes through untouched, including
signature requests and chain switches — a guard that reroutes more than it must is a guard nobody
keeps installed.

When the transaction touches a pool TARE has measured, it shows the figure, the block it was
measured at, and the replay command. **It never invents:** a pool that was not measured yields
`unknown`, and `unknown` never becomes `ok`.
