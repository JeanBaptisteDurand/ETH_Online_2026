/**
 * Signature HMAC des appels machine-a-machine.
 *
 * Porte de CorLens v2 :
 *   packages/clients/src/hmac.ts                  (hmacSigner / hmacVerifier)
 *   apps/ai-service/src/middleware/hmac-verify.ts (le hook Fastify)
 *
 * Trois adaptations, toutes assumees :
 *   1. Fastify -> Hono : le hook `(req, reply)` devient un `MiddlewareHandler`.
 *   2. En-tetes renommees x-corlens-* -> x-tare-*.
 *   3. CorLens lisait `req.body` deja parse puis le re-serialisait avec
 *      JSON.stringify : deux JSON equivalents mais differemment espaces
 *      donnaient deux signatures. Ici on signe le corps BRUT, octet pour octet,
 *      via `c.req.text()`, et le corps lu est remis a disposition du handler
 *      suivant. Un canon de signature qui depend du pretty-print n'est pas un
 *      canon.
 *
 * Le message signe est exactement `${ts}\n${body}` — meme construction que
 * CorLens, pour qu'un client CorLens existant n'ait qu'a changer le prefixe
 * d'en-tete.
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

/** Pourquoi une signature a ete refusee. On le dit ; on ne renvoie pas un 401 muet. */
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
    // timingSafeEqual jette si les longueurs different : on compare d'abord.
    if (expected.length !== sig.length) return { ok: false, reason: "signature_mismatch" };
    const same = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
    return same ? { ok: true, reason: null } : { ok: false, reason: "signature_mismatch" };
  };
}

export interface HmacGuardOptions {
  /** secret partage. Vide ou absent => la garde s'efface (mode ouvert, annonce). */
  secret: string | null;
  maxAgeSeconds?: number;
  nowSeconds?: () => number;
}

/**
 * Middleware Hono. Sans secret configure, il laisse passer et se signale comme
 * desactive : on prefere un service ouvert et honnete a un service qui pretend
 * etre protege par un secret vide.
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
    // corps brut : c.req.text() met le corps en cache, le handler suivant peut
    // encore appeler c.req.json().
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
          error: "signature invalide",
          reason: res.reason,
          how_to_sign: `hex(hmac_sha256(secret, "<${TS_HEADER}>\\n<corps brut>")) dans ${SIG_HEADER}`,
        },
        401,
      );
    }
    c.header("X-Tare-Hmac", "verified");
    await next();
  };
}
