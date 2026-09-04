"""Minimal JSON-RPC over subprocess curl.

Deliberately not `requests`: this runs against a local anvil in a container and against public
RPCs that rate-limit, and curl gives us a hard timeout we can trust. Responses are read in full —
see honesty rule 3 in the README.
"""
import json, subprocess

class RpcError(RuntimeError):
    pass

def call(url: str, method: str, params: list, timeout: int = 30):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    proc = subprocess.run(
        ["curl", "-s", "-m", str(timeout), "-X", "POST",
         "-H", "Content-Type: application/json", "-d", payload, url],
        capture_output=True, text=True, timeout=timeout + 10,
    )
    if not proc.stdout:
        raise RpcError(f"empty response from {url}")
    body = json.loads(proc.stdout)          # full body, never truncated
    if "error" in body:
        # Never truncate: v4 wraps its custom errors, and the selector that identifies them
        # (e.g. NotEnoughLiquidity 0x7a5ed734 inside UnexpectedRevertBytes 0x6190b2b0) sits
        # well past any short cutoff. Truncating here silently disabled that detection once.
        raise RpcError(str(body["error"]))
    return body.get("result")

def eth_call(url, to, data, block="latest"):
    return call(url, "eth_call", [{"to": to, "data": data}, block])

def get_code(url, addr, block="latest"):
    return call(url, "eth_getCode", [addr, block])

def set_code(url, addr, code):
    return call(url, "anvil_setCode", [addr, code])
