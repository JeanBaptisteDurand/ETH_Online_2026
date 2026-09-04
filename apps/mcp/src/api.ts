/**
 * The LOT B measurement API, treated as optional.
 *
 * It may not be running — during the hackathon it frequently is not. An absent API is a stated
 * fact in the answer ("api: UNAVAILABLE, reason ..."), never a silent fallback and never an
 * excuse to produce a number from somewhere else without saying so.
 *
 * The client is deliberately tolerant about the response shape and strict about what it will
 * accept as a number: a payload without a recognised label and without both quote legs is
 * rejected, because a half-read answer is exactly how this project produced false results before.
 */
import { normalizeLabel, type Label } from "./labels.js";

export interface ApiMeasurement {
  bps: number | null;
  label: Label;
  out_with: string | null;
  out_without: string | null;
  block_number: number;
  reason: string | null;
  source_url: string;
}

export interface ApiStatus {
  status: "OK" | "UNAVAILABLE";
  url: string;
  reason: string | null;
}

async function getJson(url: string, timeoutMs: number): Promise<{ body: unknown; error: string | null }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    const text = await res.text(); // full body, always
    if (!res.ok) return { body: null, error: `http_${res.status}` };
    return { body: JSON.parse(text), error: null };
  } catch (e) {
    const err = e as Error;
    // An abort here is our own deadline firing, not a mysterious failure. Name it.
    const reason = err.name === "AbortError" || /aborted/i.test(err.message)
      ? `no_answer_within_${timeoutMs}ms`
      : `unreachable:${err.message}`;
    return { body: null, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

export async function probe(apiUrl: string, timeoutMs: number): Promise<ApiStatus> {
  const { body, error } = await getJson(`${apiUrl}/health`, timeoutMs);
  if (error || body === null) return { status: "UNAVAILABLE", url: apiUrl, reason: error ?? "empty_body" };
  return { status: "OK", url: apiUrl, reason: null };
}

export interface ApiQuery {
  hook: string;
  poolId: string;
  amountIn: string;
  zeroForOne: boolean;
  block: number;
}

export async function measureViaApi(
  apiUrl: string,
  q: ApiQuery,
  timeoutMs: number,
): Promise<{ hit: ApiMeasurement | null; url: string; reason: string | null }> {
  const url =
    `${apiUrl}/measure?hook=${encodeURIComponent(q.hook)}&pool=${encodeURIComponent(q.poolId)}` +
    `&size=${encodeURIComponent(q.amountIn)}&direction=${q.zeroForOne ? "0to1" : "1to0"}` +
    `&block=${q.block}`;
  const { body, error } = await getJson(url, timeoutMs);
  if (error || body === null || typeof body !== "object") {
    return { hit: null, url, reason: error ?? "empty_body" };
  }
  const r = body as Record<string, unknown>;
  const rawLabel = r["label"];
  if (typeof rawLabel !== "string") return { hit: null, url, reason: "api_response_has_no_label" };
  let label: Label;
  try {
    label = normalizeLabel(rawLabel);
  } catch (e) {
    return { hit: null, url, reason: (e as Error).message };
  }
  const bps = typeof r["bps"] === "number" ? r["bps"] : null;
  const outWith = r["out_with"] == null ? null : String(r["out_with"]);
  const outWithout = r["out_without"] == null ? null : String(r["out_without"]);
  if ((label === "MEASURED" || label === "INTERPOLATED") && (bps === null || outWith === null || outWithout === null)) {
    // A number without both legs cannot be checked. Refuse it rather than repeat it.
    return { hit: null, url, reason: "api_returned_a_number_without_both_quote_legs" };
  }
  const block = typeof r["block_number"] === "number" ? r["block_number"] : q.block;
  return {
    hit: {
      bps,
      label,
      out_with: outWith,
      out_without: outWithout,
      block_number: block,
      reason: r["reason"] == null ? null : String(r["reason"]),
      source_url: url,
    },
    url,
    reason: null,
  };
}
