/**
 * Le RAG vectoriel doit etre JOIGNABLE, pas seulement construit.
 *
 * Pendant plusieurs jours `DEFAULT_RAG_URL` pointait vers une route que personne ne servait
 * (8787/rag/search, jamais montee dans l'API Hono). Chaque explication repartait avec
 * « RAG indisponible : HTTP 404 » dans son journal et se rabattait sur les regles — et
 * comme le repli fonctionnait bien, personne ne l'a vu. Un composant construit, indexe,
 * mesure, et jamais interroge par la surface qui en a besoin, ne compte pas.
 *
 * Ces tests ne demandent pas qu'un serveur tourne : ils verifient le CONTRAT entre le client
 * et le serveur, la ou les deux se sont rates.
 */
import { describe, it, expect } from "vitest";
import { ragSearch, DEFAULT_RAG_URL } from "../explain.js";

describe("le contrat entre le chat et le RAG", () => {
  it("interroge en GET avec q et k dans l'URL", async () => {
    let vue = "";
    await ragSearch("pourquoi 89 octets", {
      fetchImpl: (async (u: string) => {
        vue = String(u);
        return new Response(JSON.stringify({ status: "OK", n: 0, passages: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });
    expect(vue).toContain("q=");
    expect(vue).toContain("k=");
    expect(decodeURIComponent(vue)).toContain("pourquoi 89 octets");
  });

  it("un 404 est rapporte comme une panne nommee, jamais comme zero passage pertinent", async () => {
    const r = await ragSearch("x", {
      fetchImpl: (async () =>
        new Response("nope", { status: 404 })) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rag_erreur_http");
    expect(r.detail).toContain("404");
    // Et surtout : aucun passage invente pour combler le trou.
    expect(r.passages).toEqual([]);
  });

  it("le delai laisse au RAG couvre son temps de reponse reel", async () => {
    // Mesure sur cette machine : 3,2 a 9,6 s sous charge. Un delai de 4 s transformait un
    // RAG qui marche en RAG « indisponible ».
    let vu = 0;
    await ragSearch("x", {
      fetchImpl: ((_u: string, init: RequestInit) => {
        const s = init.signal as AbortSignal & { reason?: unknown };
        vu = s ? 1 : 0;
        return Promise.resolve(
          new Response(JSON.stringify({ status: "OK", n: 0, passages: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }) as unknown as typeof fetch,
    });
    expect(vu).toBe(1);
    // Le defaut est lisible dans la source : on verifie qu'il n'est pas retombe sous 10 s.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../explain.ts", import.meta.url), "utf8"),
    );
    const m = src.match(/opts\.timeoutMs \?\? ([\d_]+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1]!.replace(/_/g, ""))).toBeGreaterThanOrEqual(10_000);
  });

  it("l'URL par defaut designe le serveur qui existe vraiment", () => {
    // engine/tare/rag/serve.py ecoute sur /search. Pointer ailleurs, c'est le bug d'origine.
    expect(DEFAULT_RAG_URL).toMatch(/\/search$/);
  });
});
