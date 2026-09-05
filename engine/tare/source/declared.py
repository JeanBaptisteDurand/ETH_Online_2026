"""Read, on chain and at the pinned measurement block, the rate the contract itself stores.

This is the half of LOT P that turns "we read the code" into "the code agrees". The source tells us
which public getter holds the number; this module calls it at block 50 614 000 and hands the raw
value to the profile's model. Nothing here interprets: it decodes words and returns integers.

Failure is never a number. A revert, a rate limit or a truncated word gives
`{"ok": False, "reason": ...}` and the hook's concordance becomes UNVERIFIED — never DIVERGENT and
never 0. That distinction is the whole of honesty rule 3.
"""
import json
import os
import time

from .. import rpc as rpc_mod
from ..keccak import sel
from . import scan as scan_mod

DEFAULT_PACE_S = 0.35          # Alchemy answers ~3 req/s comfortably on the free tier


class Chain:
    """A paced, cached eth_call surface. Injectable so tests never touch a network."""

    def __init__(self, url: str, block: int, pace_s: float = DEFAULT_PACE_S, cache_path: str = None,
                 rate_limit_retries: int = 4):
        self.url = url
        self.block_hex = hex(block)
        self.block = block
        self.pace_s = pace_s
        self.cache_path = cache_path
        self.rate_limit_retries = rate_limit_retries
        self.cache = {}
        self._last = 0.0
        if cache_path and os.path.exists(cache_path):
            with open(cache_path) as fh:
                self.cache = json.load(fh)

    def _pace(self):
        wait = self.pace_s - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def eth_call(self, to: str, data: str):
        """Returns the raw hex result, or raises. Cached by (to, data, block).

        `rpc.call` already backs off on a 429; this adds a second, slower layer because a rate
        limit that survives both is still not an answer and must reach the caller as a failure, not
        as a missing value. Every 429 that got through in an earlier run turned a real pool into an
        UNVERIFIED line in the report — visible, but wasted.
        """
        key = f"{to.lower()}|{data}|{self.block}"
        if key in self.cache:
            return self.cache[key]
        delay = 4.0
        for attempt in range(self.rate_limit_retries + 1):
            self._pace()
            try:
                out = rpc_mod.call(self.url, "eth_call", [{"to": to, "data": data}, self.block_hex])
            except rpc_mod.RateLimited:
                if attempt == self.rate_limit_retries:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 30.0)
                continue
            self.cache[key] = out
            return out

    def block_timestamp(self):
        key = f"blockts|{self.block}"
        if key in self.cache:
            return self.cache[key]
        self._pace()
        blk = rpc_mod.call(self.url, "eth_getBlockByNumber", [self.block_hex, False])
        ts = int(blk["timestamp"], 16)
        self.cache[key] = ts
        return ts

    def save(self):
        if not self.cache_path:
            return
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        with open(self.cache_path, "w") as fh:
            json.dump(self.cache, fh, indent=0, sort_keys=True)
            fh.write("\n")


# ---- decoding ---------------------------------------------------------------------------------

def words(hexstr: str):
    body = hexstr[2:] if hexstr.startswith("0x") else hexstr
    return [body[i * 64:(i + 1) * 64] for i in range(len(body) // 64)]


def _uint(w):
    return int(w, 16)


def decode_struct(layout: list, raw: str) -> dict:
    """Decode a public struct getter positionally, using a layout parsed from the source."""
    ws = words(raw)
    if len(ws) < len(layout):
        raise ValueError(f"struct getter returned {len(ws)} words, the source declares {len(layout)}")
    out = {}
    for (typ, name), word in zip(layout, ws):
        if typ == "bool":
            out[name] = bool(_uint(word))
        elif typ.startswith("address"):
            out[name] = "0x" + word[-40:]
        else:
            out[name] = _uint(word)
    return out


def decode(kind: str, raw: str):
    """Decode one eth_call return. Raises ValueError on a short/empty answer — never returns 0."""
    ws = words(raw)
    if not ws:
        raise ValueError(f"empty return ({raw!r})")
    if kind == "uint":
        return _uint(ws[0])
    if kind == "bool":
        return bool(_uint(ws[0]))
    if kind == "doppler_state":
        # mapping(address asset => PoolState) public getState. Solidity omits the dynamic array
        # members from a struct getter, so word 2 is `dopplerHook` and word 4 is `status`.
        if len(ws) < 5:
            raise ValueError(f"getState returned {len(ws)} words, expected >= 5")
        if _uint(ws[0]) == 0 and _uint(ws[2]) == 0:
            raise ValueError("getState is empty for this address (not the asset of this pool)")
        return {"numeraire": "0x" + ws[0][-40:], "delegate": "0x" + ws[2][-40:],
                "status": _uint(ws[4])}
    if kind == "doppler_schedule":
        if len(ws) < 5:
            raise ValueError(f"getFeeSchedule returned {len(ws)} words, expected 5")
        return {"starting_time": _uint(ws[0]), "start_fee": _uint(ws[1]),
                "end_fee": _uint(ws[2]), "last_fee": _uint(ws[3]),
                "duration_seconds": _uint(ws[4])}
    raise ValueError(f"unknown decode kind {kind!r}")


# ---- reading a profile's declared values ------------------------------------------------------

def _arg_words(arg: str, row: dict, extra):
    if arg == "none":
        return [""]
    if arg == "pool_id":
        return [row["pool_id"][2:].rjust(64, "0")]
    if arg == "currency_probe":
        return [c[2:].lower().rjust(64, "0") for c in (row["currency0"], row["currency1"])]
    raise ValueError(f"unknown arg source {arg!r}")


def read_declared(chain: Chain, profile: dict, hook: str, row: dict, hook_dir: str = None) -> dict:
    """Run every reader the profile declares. Returns {"ok", "values", "reason", "calls"}."""
    values = dict(profile.get("constants") or {})
    calls = []
    if profile.get("needs_block_timestamp"):
        try:
            values["block_timestamp"] = chain.block_timestamp()
        except Exception as exc:                                   # noqa: BLE001 — reported, not swallowed
            return {"ok": False, "values": values, "calls": calls,
                    "reason": f"could not read the block timestamp: {exc}"}

    for spec in profile.get("read", []):
        target = hook if spec["to"] == "hook" else values.get(spec["to"])
        if not target:
            if spec.get("optional"):
                values[spec["name"]] = None
                continue
            return {"ok": False, "values": values, "calls": calls,
                    "reason": f"no target for {spec['name']}: {spec['to']} was not resolved"}
        layout = None
        if spec["type"] == "struct":
            if hook_dir is None:
                return {"ok": False, "values": values, "calls": calls,
                        "reason": f"{spec['name']} needs a struct layout but no source dir was given"}
            try:
                layout = scan_mod.parse_struct(hook_dir, spec["struct"]["file"], spec["struct"]["name"])
            except Exception as exc:                               # noqa: BLE001
                return {"ok": False, "values": values, "calls": calls,
                        "reason": f"could not read the layout of {spec['struct']['name']}: {exc}"}
        signatures = spec.get("sigs") or [spec["sig"]]
        last_err = None
        got = None
        for signature in signatures:
            selector = sel(signature)
            for arg_word in _arg_words(spec["arg"], row, values):
                data = selector + arg_word
                try:
                    raw = chain.eth_call(target, data)
                    got = decode_struct(layout, raw) if layout else decode(spec["type"], raw)
                    calls.append({"name": spec["name"], "to": target, "sig": signature, "data": data})
                    break
                except Exception as exc:                           # noqa: BLE001
                    last_err = f"{type(exc).__name__}: {exc}"
            if got is not None:
                break
        if got is None:
            if spec.get("optional"):
                values[spec["name"]] = spec.get("fallback")
                calls.append({"name": spec["name"], "to": target, "sig": signatures[0],
                              "unavailable": last_err,
                              "fell_back_to": spec.get("fallback")})
                continue
            return {"ok": False, "values": values, "calls": calls,
                    "reason": f"{'/'.join(signatures)} on {target}: {last_err}"}
        # `getState` returns a struct; promote its delegate so the next reader can target it.
        if spec["type"] == "doppler_state":
            values["delegate"] = got["delegate"]
            values[spec["name"]] = got["delegate"]
        else:
            values[spec["name"]] = got
    return {"ok": True, "values": values, "calls": calls, "reason": None}


def replay_command(chain_url_env: str, to: str, data: str, block: int) -> str:
    """The one command that reproduces a single declared read."""
    return (f"cast call {to} {data} --rpc-url ${chain_url_env} --block {block}"
            f"   # or: curl -s -X POST -d '{{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\","
            f"\"params\":[{{\"to\":\"{to}\",\"data\":\"{data}\"}},\"{hex(block)}\"]}}' ${chain_url_env}")
