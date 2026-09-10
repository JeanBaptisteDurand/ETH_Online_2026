"""Minimal JSON-RPC over subprocess curl.

Deliberately not `requests`: this runs against a local anvil in a container and against public
RPCs that rate-limit, and curl gives us a hard timeout we can trust. Responses are read in full —
see honesty rule 3 in the README.
"""
import json, random, subprocess, time


def redact(url: str) -> str:
    """L'URL d'un RPC PORTE la cle d'API. Une erreur qui la recopie finit dans un fichier de
    resultat, et ce fichier finit dans le depot : c'est exactement ce qui est arrive —
    « HTTP 429 from https://base-mainnet.g.alchemy.com/v2/<cle> », 65 fois, dans un fichier
    suivi d'un depot public. Le message garde de quoi reconnaitre le fournisseur, et rien de
    plus. Un secret ne doit jamais traverser une chaine d'erreur."""
    import re

    return re.sub(r"(/v[0-9]+/|[?&](?:api[-_]?key|key|apikey)=)[^/?&#\s]+", r"\1<redacted>", url, flags=re.I)


class RpcError(RuntimeError):
    pass

class RateLimited(RpcError):
    """429. Distinct from a protocol error: the node did not refuse, it deferred."""

def call(url: str, method: str, params: list, timeout: int = 30, retries: int = 5):
    """Retries a 429 with exponential backoff and jitter.

    A rate limit is not an answer. Treating one as an absence is how this project once
    concluded that three chains had no v4 activity at all.
    """
    delay = 0.5
    for attempt in range(retries):
        try:
            return _call_once(url, method, params, timeout)
        except RateLimited:
            if attempt == retries - 1:
                raise
            time.sleep(delay + random.random() * delay)
            delay = min(delay * 2, 8.0)

def _call_once(url: str, method: str, params: list, timeout: int = 30):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    # -w prints the real status after the body. Inferring "429" from an empty body was wrong:
    # an unresolvable host also returns nothing, and retrying that five times turns a fast
    # failure into a slow one. Ask the transport what actually happened.
    proc = subprocess.run(
        ["curl", "-s", "-m", str(timeout), "-w", "\n%{http_code}", "-X", "POST",
         "-H", "Content-Type: application/json", "-d", payload, url],
        capture_output=True, text=True, timeout=timeout + 10,
    )
    out = proc.stdout.rsplit("\n", 1)
    body, status = (out[0], out[1].strip()) if len(out) == 2 else ("", "")
    if status in ("429", "503", "502", "504"):
        raise RateLimited(f"HTTP {status} from {redact(url)}")
    if not status or status == "000":
        raise RpcError(f"transport failure for {url} ({proc.returncode})")
    if not body:
        raise RpcError(f"empty body, HTTP {status}, from {redact(url)}")
    parsed = json.loads(body)          # full body, never truncated
    if "error" in parsed:
        raise RpcError(str(parsed["error"]))
    return parsed.get("result")


def eth_call(url, to, data, block="latest"):
    return call(url, "eth_call", [{"to": to, "data": data}, block])

def get_code(url, addr, block="latest"):
    return call(url, "eth_getCode", [addr, block])

def set_code(url, addr, code):
    return call(url, "anvil_setCode", [addr, code])
