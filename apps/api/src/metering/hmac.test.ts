/**
 * La signature HMAC. Les cinq cas de CorLens (packages/clients/tests/hmac.test.ts)
 * sont repris tels quels — un portage qui ne rejoue pas les tests de l'original
 * n'est pas un portage — puis on eprouve ce que CorLens n'avait pas : le
 * middleware Hono et le corps BRUT.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { hmacSigner, hmacVerifier, hmacGuard, TS_HEADER, SIG_HEADER } from "./hmac.js";

const SECRET = "test-secret-do-not-ship";

describe("hmacSigner / hmacVerifier (les cinq cas de CorLens)", () => {
  it("accepte une requete signee par le signeur correspondant", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const body = '{"hello":"world"}';
    expect(verify(body, sign(body))).toEqual({ ok: true, reason: null });
  });

  it("refuse un corps altere", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const headers = sign('{"hello":"world"}');
    expect(verify('{"hello":"tampered"}', headers)).toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
  });

  it("refuse un mauvais secret", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: "different", maxAgeSeconds: 60 });
    const body = '{"x":1}';
    expect(verify(body, sign(body)).ok).toBe(false);
  });

  it("refuse une signature perimee, et le dit", () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const sign = hmacSigner({ secret: SECRET, nowSeconds: () => past });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    expect(verify("{}", sign("{}"))).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("signe un corps vide", () => {
    const sign = hmacSigner({ secret: SECRET });
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    expect(verify(undefined, sign(undefined)).ok).toBe(true);
  });
});

describe("hmacVerifier — ce que CorLens ne couvrait pas", () => {
  it("ne jette pas sur une signature de longueur ou d'encodage aberrants", () => {
    const verify = hmacVerifier({ secret: SECRET, maxAgeSeconds: 60 });
    const ts = String(Math.floor(Date.now() / 1000));
    // timingSafeEqual jette si les Buffer n'ont pas la meme longueur : le
    // verificateur doit trancher AVANT de l'appeler.
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

describe("hmacGuard (middleware Hono)", () => {
  function app(secret: string | null) {
    const a = new Hono();
    a.post("/anchor", hmacGuard({ secret }), async (c) => {
      // le handler doit encore pouvoir lire le corps apres la garde
      const body = await c.req.json();
      return c.json({ ok: true, seen: body });
    });
    return a;
  }

  it("refuse en 401 une requete non signee, avec la raison", async () => {
    const res = await app(SECRET).request("/anchor", {
      method: "POST",
      body: JSON.stringify({ batch_id: "b_1" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).reason).toBe("missing_headers");
  });

  it("accepte une requete signee et laisse le corps lisible au handler", async () => {
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

  it("signe le corps BRUT : un re-espacement du JSON ne casse pas la signature", async () => {
    // CorLens signait JSON.stringify(req.body) : le corps ci-dessous, espace,
    // n'aurait PAS produit la meme signature cote client et cote serveur.
    const raw = '{\n  "batch_id" :  "b_1"\n}';
    const headers = hmacSigner({ secret: SECRET })(raw);
    const res = await app(SECRET).request("/anchor", {
      method: "POST",
      body: raw,
      headers: { ...headers, "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
  });

  it("sans secret configure, la garde s'efface et l'annonce au lieu de faire semblant", async () => {
    const res = await app(null).request("/anchor", {
      method: "POST",
      body: JSON.stringify({ batch_id: "b_1" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tare-Hmac")).toBe("disabled");
  });
});
