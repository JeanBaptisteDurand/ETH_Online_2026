/**
 * HMAC signature for machine-to-machine calls.
 *
 * Ported from an earlier metering service of ours: its signer/verifier pair
 * (`hmacSigner` / `hmacVerifier`) and its Fastify verification hook.
 *
 * Three adaptations, all deliberate:
 *   1. Fastify -> Hono: the `(req, reply)` hook becomes a `MiddlewareHandler`.
 *   2. Headers renamed to x-tare-*.
 *   3. That earlier service read the already-parsed `req.body`, then
 *      re-serialised it with JSON.stringify: two equivalent JSON documents
 *      spaced differently gave two signatures. Here we sign the RAW body, byte
 *      for byte, via `c.req.text()`, and the body that was read is handed back
 *      to the next handler. A signing canon that depends on pretty-printing is
 *      not a canon.
 *
 * The signed message is exactly `${ts}\n${body}` — the same construction as
 * before, so that an existing client only has to change the header prefix.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const TS_HEADER = "x-tare-ts";
export const SIG_HEADER = "x-tare-sig";

export interface HmacSignerOptions {
  secret: string;
  nowSeconds?: () => number;
}

export interface HmacVerifierOptions {
  secret: string;
  maxAgeSeconds: number;
  nowSeconds?: () => number;
}

export function computeSignature(secret: string, ts: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}\n${body}`).digest("hex");
}

export function hmacSigner(
  opts: HmacSignerOptions,
): (body: string | undefined) => Record<string, string> {
  const now = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  return (body) => {
    const ts = String(now());
    return { [TS_HEADER]: ts, [SIG_HEADER]: computeSignature(opts.secret, ts, body ?? "") };
  };
}

/** Why a signature was refused. We say so; we do not send back a silent 401. */
export type HmacFailure =
  | "missing_headers"
  | "bad_timestamp"
  | "stale_timestamp"
  | "bad_signature_encoding"
  | "signature_mismatch";

export interface HmacResult {
  ok: boolean;
  reason: HmacFailure | null;
}

export function hmacVerifier(
  opts: HmacVerifierOptions,
): (body: string | undefined, headers: Record<string, string | undefined>) => HmacResult {
  const now = opts.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  return (body, headers) => {
    const ts = headers[TS_HEADER];
    const sig = headers[SIG_HEADER];
    if (!ts || !sig) return { ok: false, reason: "missing_headers" };

    const parsedTs = Number.parseInt(ts, 10);
    if (!Number.isFinite(parsedTs)) return { ok: false, reason: "bad_timestamp" };
    if (Math.abs(now() - parsedTs) > opts.maxAgeSeconds)
      return { ok: false, reason: "stale_timestamp" };

    if (!/^[0-9a-fA-F]+$/.test(sig) || sig.length % 2 !== 0)
      return { ok: false, reason: "bad_signature_encoding" };

    const expected = computeSignature(opts.secret, ts, body ?? "");
    // timingSafeEqual throws if the lengths differ: compare them first.
    if (expected.length !== sig.length) return { ok: false, reason: "signature_mismatch" };
    const same = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
    return same ? { ok: true, reason: null } : { ok: false, reason: "signature_mismatch" };
  };
}

export interface HmacGuardOptions {
  /** shared secret. Empty or absent => the guard steps aside (open mode, announced). */
  secret: string | null;
  maxAgeSeconds?: number;
  nowSeconds?: () => number;
}

/**
 * Hono middleware. With no secret configured, it lets requests through and flags
 * itself as disabled: we prefer an open and honest service to a service that
 * claims to be protected by an empty secret.
 */
export function hmacGuard(opts: HmacGuardOptions): MiddlewareHandler {
  const secret = opts.secret && opts.secret.length > 0 ? opts.secret : null;
  if (!secret) {
    return async (c, next) => {
      c.header("X-Tare-Hmac", "disabled");
      await next();
    };
  }
  const verify = hmacVerifier({
    secret,
    maxAgeSeconds: opts.maxAgeSeconds ?? 60,
    nowSeconds: opts.nowSeconds,
  });
  return async (c, next) => {
    // raw body: c.req.text() caches the body, so the next handler can still
    // call c.req.json().
    let body = "";
    try {
      body = await c.req.text();
    } catch {
      body = "";
    }
    const res = verify(body, {
      [TS_HEADER]: c.req.header(TS_HEADER),
      [SIG_HEADER]: c.req.header(SIG_HEADER),
    });
    if (!res.ok) {
      return c.json(
        {
          error: "invalid signature",
          reason: res.reason,
          how_to_sign: `hex(hmac_sha256(secret, "<${TS_HEADER}>\\n<raw body>")) in ${SIG_HEADER}`,
        },
        401,
      );
    }
    c.header("X-Tare-Hmac", "verified");
    await next();
  };
}
