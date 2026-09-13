/**
 * The HMAC signature. The five cases from that earlier suite are taken over
 * as-is — a port that does not replay the original's tests is not a port —
 * then we exercise what that earlier suite did not have: the Hono middleware
 * and the RAW body.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { hmacSigner, hmacVerifier, hmacGuard, TS_HEADER, SIG_HEADER } from "./hmac.js";

const SECRET = "test-secret-do-not-ship";

describe("hmacSigner / hmacVerifier (the five cases from the earlier suite)", () => {
  it("accepts a request signed by the matching signer", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const body = '{"hello":"world"}';
    expect(verify(body, sign(body))).toEqual({ ok: true, reason: null });
  });

  it("rejects a tampered body", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const headers = sign('{"hello":"world"}');
    expect(verify('{"hello":"tampered"}', headers)).toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
  });

  it("rejects a wrong secret", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: "different", maxAgeSeconds: 60 });
    const body = '{"x":1}';
    expect(verify(body, sign(body)).ok).toBe(false);
  });

  it("rejects a stale signature, and says so", () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const sign = hmacSigner({ secret: SECRET, nowSeconds: () => past });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    expect(verify("{}", sign("{}"))).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("signs an empty body", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    expect(verify(undefined, sign(undefined)).ok).toBe(true);
  });
});

describe("hmacVerifier — what the earlier suite did not cover", () => {
  it("does not throw on a signature of aberrant length or encoding", () => {
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const ts = String(Math.floor(Date.now() / 1000));
    // timingSafeEqual throws if the Buffers do not have the same length: the
    // verifier has to decide BEFORE calling it.
    expect(verify("{}", { [TS_HEADER]: ts, [SIG_HEADER]: "abcd" })).toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
    expect(verify("{}", { [TS_HEADER]: ts, [SIG_HEADER]: "zz".repeat(32) })).toEqual({
      ok: false,
      reason: "bad_signature_encoding",
    });
    expect(verify("{}", { [TS_HEADER]: "pas-un-nombre", [SIG_HEADER]: "aa" })).toEqual({
      ok: false,
      reason: "bad_timestamp",
    });
    expect(verify("{}", {})).toEqual({ ok: false, reason: "missing_headers" });
  });
});

describe("hmacGuard (Hono middleware)", () => {
  function app(secret: string | null) {
    const a = new Hono();
    a.post("/anchor", hmacGuard({ secret }), async (c) => {
      // the handler must still be able to read the body after the guard
      const body = await c.req.json();
      return c.json({ ok: true, seen: body });
    });
    return a;
  }

  it("rejects an unsigned request with a 401, and gives the reason", async () => {
    const res = await app(SECRET).request("/anchor", {
      method: "POST",
      body: JSON.stringify({ batch_id: "b_1" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).reason).toBe("missing_headers");
  });

  it("accepts a signed request and leaves the body readable by the handler", async () => {
    const body = JSON.stringify({ batch_id: "b_1" });
    const headers = hmacSigner({ secret: SECRET })(body);
    const res = await app(SECRET).request("/anchor", {
      method: "POST",
      body,
      headers: { ...headers, "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tare-Hmac")).toBe("verified");
    expect(await res.json()).toEqual({ ok: true, seen: { batch_id: "b_1" } });
  });

  it("signs the RAW body: re-spacing the JSON does not break the signature", async () => {
    // That earlier service signed JSON.stringify(req.body): the body below,
    // re-spaced, would NOT have produced the same signature on the client side
    // and on the server side.
    const raw = '{\n  "batch_id" :  "b_1"\n}';
    const headers = hmacSigner({ secret: SECRET })(raw);
    const res = await app(SECRET).request("/anchor", {
      method: "POST",
      body: raw,
      headers: { ...headers, "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
  });

  it("with no secret configured, the guard steps aside and announces it instead of pretending", async () => {
    const res = await app(null).request("/anchor", {
      method: "POST",
      body: JSON.stringify({ batch_id: "b_1" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tare-Hmac")).toBe("disabled");
  });
});
