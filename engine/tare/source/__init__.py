"""tare.source — read the hooks' own code, and hold it against what TARE measured.

Until this package existed, `docs/LIMITS.md` §6(c) said, correctly: "We have not read a single
line of any hook's source. Not one." That sentence was the weakest point of the project, because
a magnitude with no code behind it cannot tell an advertised launchpad fee from a silent skim.

The package does three separable things, in this order, and each one refuses to guess:

  fetch    pull the *verified* Solidity from Sourcify (Etherscan v2 as a fallback) and write it
           under docs/hooks-source/<address>/ with a provenance record. A provider that answers
           "not verified" is NOT_FOUND; a provider that times out, rate-limits or is missing its
           API key is FETCH_FAILED / UNAVAILABLE — never NOT_FOUND, never a conclusion.
  scan     a purely textual pass over the fetched files: where a swap-path take can happen, which
           fee-shaped constants exist, what is publicly readable, who can change what. Every
           finding carries file + line so the claim can be checked in one `sed -n`.
  declared read the rate the contract itself stores, on chain, at the pinned measurement block,
           through the public getter the source shows exists — then let arithmetic compare it to
           what TARE measured. The engine never asks a model for a number.

Honesty rules that are enforced by code here, not by good intentions:
  * a hook with no source gets `read=False` and NO classification fields at all (classify.py),
  * a transport failure is a distinct outcome from a negative answer (fetch.py),
  * concordance is computed, never asserted (declared.py / classify.py).
"""
__all__ = ["fetch", "scan", "profiles", "declared", "classify", "report"]
