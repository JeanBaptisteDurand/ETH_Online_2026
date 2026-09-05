"""Fetch the verified Solidity of a hook and write it to docs/hooks-source/<address>/.

Primary provider: Sourcify v2 (`/v2/contract/{chainId}/{address}?fields=sources`).
Fallback: Etherscan v2 multichain (`getsourcecode`), which needs ETHERSCAN_API_KEY.

The one rule that matters here is honesty rule 3 of the project: a truncated answer, a timeout or
a rate limit is never an answer. So the outcome of an attempt is one of

    FOUND                 the provider returned sources
    NOT_FOUND             the provider answered, explicitly, that it has no verified source
    UNAVAILABLE           we could not even ask (no API key configured)
    FETCH_FAILED:<why>    transport error, timeout, 429/5xx, or a body we could not parse

and only NOT_FOUND from *every* provider that could actually be asked is allowed to become
"no source". A hook whose every attempt is FETCH_FAILED stays `source_status="FETCH_FAILED"`, which
classify.py treats exactly like "no source": unread, unclassified.
"""
import hashlib
import json
import os
import subprocess
import time
from typing import Optional

SOURCIFY_V2 = "https://sourcify.dev/server/v2/contract/{chain_id}/{address}?fields=sources"
ETHERSCAN_V2 = "https://api.etherscan.io/v2/api?chainid={chain_id}&module=contract&action=getsourcecode&address={address}&apikey={key}"

FOUND = "FOUND"
NOT_FOUND = "NOT_FOUND"
UNAVAILABLE = "UNAVAILABLE"
FETCH_FAILED = "FETCH_FAILED"

# Which of the files in a verified compilation unit are the hook's *own* code, and which are
# copied-in libraries. Everything is stored and hashed either way — the unit is what was verified —
# but reports and scans point only at the hook's own files, because a citation into a vendored copy
# of OpenZeppelin says nothing about this hook.
#
# The rule is per path *segment*, not a prefix: Zora publishes its own hook inside
# `node_modules/@zoralabs/coins/src/hooks/`, so a blanket "node_modules is vendored" would have
# thrown away the very contract we came to read. A second, nested `node_modules` is a dependency
# of a dependency and is vendored.
VENDOR_SEGMENTS = {
    "@openzeppelin", "openzeppelin", "openzeppelin-contracts", "openzeppelin-contracts-upgradeable",
    "v4-core", "v4-periphery", "v3-core", "v3-periphery", "v2-core", "v2-periphery",
    "@uniswap", "uniswap", "permit2", "solmate", "solady", "@solady", "@solmate",
    "forge-std", "ds-test", "optimism", "shared-contracts", "@openzeppelin-contracts",
}


class FetchFailed(RuntimeError):
    """We could not ask, or could not read the answer. NOT a statement about the contract."""


def http_get(url: str, timeout: int = 60) -> tuple:
    """GET returning (status_code:int, body:str). Raises FetchFailed on transport trouble.

    curl, not urllib, for the same reason rpc.py uses curl: a hard timeout we can trust, and a real
    status code printed by the transport instead of one inferred from an empty body.
    """
    try:
        proc = subprocess.run(
            ["curl", "-sS", "-m", str(timeout), "-w", "\n%{http_code}", url],
            capture_output=True, text=True, timeout=timeout + 15,
        )
    except subprocess.TimeoutExpired as exc:
        raise FetchFailed(f"timeout after {timeout}s") from exc
    parts = proc.stdout.rsplit("\n", 1)
    if len(parts) != 2:
        raise FetchFailed(f"no status line (curl rc={proc.returncode})")
    body, status = parts[0], parts[1].strip()
    if not status or status == "000":
        raise FetchFailed(f"transport failure (curl rc={proc.returncode})")
    code = int(status)
    if code == 429 or 500 <= code < 600:
        raise FetchFailed(f"HTTP {code} — deferred, not a denial")
    return code, body


def _json_or_fail(body: str):
    try:
        return json.loads(body)
    except (ValueError, TypeError) as exc:
        raise FetchFailed(f"unparseable body ({len(body)} bytes)") from exc


def fetch_sourcify(address: str, chain_id: int = 8453, timeout: int = 60) -> dict:
    """One attempt against Sourcify. Returns {"outcome", "sources", "match", "verified_at"}."""
    url = SOURCIFY_V2.format(chain_id=chain_id, address=address)
    try:
        code, body = http_get(url, timeout)
    except FetchFailed as exc:
        return {"provider": "sourcify", "outcome": f"{FETCH_FAILED}:{exc}", "sources": {}}
    if code == 404:
        # Sourcify answered. It has nothing for this address. That is a real negative.
        return {"provider": "sourcify", "outcome": NOT_FOUND, "sources": {}}
    if code != 200:
        return {"provider": "sourcify", "outcome": f"{FETCH_FAILED}:HTTP {code}", "sources": {}}
    doc = _json_or_fail(body)
    raw = doc.get("sources")
    if not raw:
        # 200 with no `sources` key: Sourcify knows the address but returned nothing usable.
        if doc.get("match") in (None, "null"):
            return {"provider": "sourcify", "outcome": NOT_FOUND, "sources": {}}
        return {"provider": "sourcify", "outcome": f"{FETCH_FAILED}:200 without sources", "sources": {}}
    sources = {path: entry["content"] for path, entry in raw.items() if "content" in entry}
    if not sources:
        return {"provider": "sourcify", "outcome": f"{FETCH_FAILED}:sources without content", "sources": {}}
    return {
        "provider": "sourcify",
        "outcome": FOUND,
        "sources": sources,
        "match": doc.get("match"),
        "runtime_match": doc.get("runtimeMatch"),
        "creation_match": doc.get("creationMatch"),
        "verified_at": doc.get("verifiedAt"),
    }


def fetch_etherscan(address: str, chain_id: int = 8453, api_key: Optional[str] = None,
                    timeout: int = 60) -> dict:
    """Fallback attempt against Etherscan v2 (Basescan for chain 8453).

    Without a key the endpoint refuses on principle, which is UNAVAILABLE — we could not ask. It is
    emphatically not evidence that the contract is unverified.
    """
    key = api_key if api_key is not None else os.environ.get("ETHERSCAN_API_KEY") or os.environ.get("BASESCAN_API_KEY")
    if not key:
        return {"provider": "etherscan", "outcome": UNAVAILABLE,
                "detail": "no ETHERSCAN_API_KEY / BASESCAN_API_KEY in the environment", "sources": {}}
    url = ETHERSCAN_V2.format(chain_id=chain_id, address=address, key=key)
    try:
        code, body = http_get(url, timeout)
    except FetchFailed as exc:
        return {"provider": "etherscan", "outcome": f"{FETCH_FAILED}:{exc}", "sources": {}}
    if code != 200:
        return {"provider": "etherscan", "outcome": f"{FETCH_FAILED}:HTTP {code}", "sources": {}}
    doc = _json_or_fail(body)
    if str(doc.get("status")) != "1":
        detail = str(doc.get("result", ""))[:200]
        if "Invalid API Key" in detail or "Missing" in detail:
            return {"provider": "etherscan", "outcome": UNAVAILABLE, "detail": detail, "sources": {}}
        return {"provider": "etherscan", "outcome": f"{FETCH_FAILED}:{doc.get('message')} {detail}", "sources": {}}
    result = doc.get("result") or []
    if not result:
        return {"provider": "etherscan", "outcome": f"{FETCH_FAILED}:empty result", "sources": {}}
    entry = result[0]
    blob = entry.get("SourceCode") or ""
    if not blob.strip():
        return {"provider": "etherscan", "outcome": NOT_FOUND, "sources": {}}
    sources = _explode_etherscan_sourcecode(blob, entry.get("ContractName") or address)
    if not sources:
        return {"provider": "etherscan", "outcome": f"{FETCH_FAILED}:could not decode SourceCode", "sources": {}}
    return {"provider": "etherscan", "outcome": FOUND, "sources": sources,
            "match": "etherscan-verified", "verified_at": None,
            "compiler": entry.get("CompilerVersion")}


def _explode_etherscan_sourcecode(blob: str, contract_name: str) -> dict:
    """Etherscan returns either a single flat file or a standard-json wrapped in one extra {..}."""
    stripped = blob.strip()
    if stripped.startswith("{{") and stripped.endswith("}}"):
        stripped = stripped[1:-1]
    if stripped.startswith("{"):
        try:
            doc = json.loads(stripped)
        except ValueError:
            return {f"{contract_name}.sol": blob}
        srcs = doc.get("sources", doc)
        out = {}
        for path, entry in srcs.items():
            if isinstance(entry, dict) and "content" in entry:
                out[path] = entry["content"]
        if out:
            return out
        return {f"{contract_name}.sol": blob}
    return {f"{contract_name}.sol": blob}


def is_vendor(path: str) -> bool:
    """True for a dependency copied into the verified compilation unit (see VENDOR_SEGMENTS)."""
    segments = [seg for seg in path.replace("\\", "/").split("/") if seg]
    if sum(1 for seg in segments if seg == "node_modules") > 1:
        return True
    return any(seg.lower() in VENDOR_SEGMENTS for seg in segments)


def write_hook_sources(address: str, attempt: dict, out_root: str, chain_id: int = 8453,
                       attempts: Optional[list] = None) -> dict:
    """Materialise one hook's sources under out_root/<address>/ and write provenance.json."""
    address = address.lower()
    hook_dir = os.path.join(out_root, address)
    src_dir = os.path.join(hook_dir, "sources")
    os.makedirs(src_dir, exist_ok=True)
    files = []
    for path, content in sorted(attempt.get("sources", {}).items()):
        safe = _safe_relpath(path)
        dest = os.path.join(src_dir, safe)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = content.encode("utf-8")
        with open(dest, "wb") as fh:
            fh.write(data)
        files.append({
            "path": safe,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "vendored": is_vendor(safe),
        })
    prov = {
        "address": address,
        "chain_id": chain_id,
        "source_status": attempt.get("outcome"),
        "provider": attempt.get("provider"),
        "match": attempt.get("match"),
        "runtime_match": attempt.get("runtime_match"),
        "creation_match": attempt.get("creation_match"),
        "verified_at": attempt.get("verified_at"),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
        "file_count": len(files),
        "own_file_count": sum(1 for f in files if not f["vendored"]),
        "total_bytes": sum(f["bytes"] for f in files),
        "attempts": attempts or [],
        "files": files,
        "replay": f"curl -s '{SOURCIFY_V2.format(chain_id=chain_id, address=address)}'",
    }
    with open(os.path.join(hook_dir, "provenance.json"), "w") as fh:
        json.dump(prov, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return prov


def _safe_relpath(path: str) -> str:
    """Refuse absolute paths and `..` — a provider-supplied path must not escape the output dir."""
    parts = [p for p in path.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    if not parts:
        raise ValueError(f"unusable source path {path!r}")
    return "/".join(parts)


def fetch_hook(address: str, out_root: str, chain_id: int = 8453, timeout: int = 60,
               allow_etherscan: bool = True) -> dict:
    """Sourcify first, Etherscan second, and record *both* outcomes whatever happens."""
    address = address.lower()
    attempts = []
    primary = fetch_sourcify(address, chain_id, timeout)
    attempts.append({k: v for k, v in primary.items() if k != "sources"})
    winner = primary
    if primary["outcome"] != FOUND and allow_etherscan:
        secondary = fetch_etherscan(address, chain_id, timeout=timeout)
        attempts.append({k: v for k, v in secondary.items() if k != "sources"})
        if secondary["outcome"] == FOUND:
            winner = secondary
        elif primary["outcome"] != NOT_FOUND:
            # Sourcify never gave a real answer; keep the more informative of the two failures.
            winner = secondary if secondary["outcome"].startswith(NOT_FOUND) else primary
    return write_hook_sources(address, winner, out_root, chain_id, attempts)
