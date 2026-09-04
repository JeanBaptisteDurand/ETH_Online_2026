/**
 * Minimal JSON-RPC for the two things the server reads itself: the fork's head, and hook code.
 *
 * Responses are read in full. `res.text()` then `JSON.parse` — never a bounded read, never a
 * stream slice. A truncated `eth_getCode` would keccak to a wrong-but-plausible codehash and
 * would silently invent a twin. That is honesty rule 3, applied to this file.
 */
export interface RpcResult<T> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

export async function rpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = 8000,
): Promise<RpcResult<T>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ac.signal,
    });
    const text = await res.text(); // full body, always
    if (!res.ok) return { ok: false, value: null, error: `http_${res.status}` };
    const body = JSON.parse(text) as { result?: T; error?: unknown };
    if (body.error) return { ok: false, value: null, error: JSON.stringify(body.error) };
    return { ok: true, value: (body.result ?? null) as T, error: null };
  } catch (e) {
    return { ok: false, value: null, error: `rpc_unreachable:${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function blockNumber(url: string, timeoutMs = 4000): Promise<number | null> {
  const r = await rpc<string>(url, "eth_blockNumber", [], timeoutMs);
  return r.ok && typeof r.value === "string" ? Number.parseInt(r.value, 16) : null;
}

export async function getCode(url: string, address: string, timeoutMs = 8000): Promise<RpcResult<string>> {
  return rpc<string>(url, "eth_getCode", [address, "latest"], timeoutMs);
}
