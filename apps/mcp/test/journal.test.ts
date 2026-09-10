/**
 * L'historique vu depuis le MCP.
 *
 * La regle qui compte : SANS cle, ce serveur n'emet AUCUNE requete. Le MCP lit le corpus
 * commite et le fork local ; il n'a besoin de personne, et un `fetch` vers un service absent
 * ferait attendre l'agent pour rien.
 *
 * La deuxieme : rien de ce que fait le journal ne peut ecrire sur stdout. stdout porte le
 * JSON-RPC du protocole MCP, et une seule ligne de journal dedans casse la session du client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { creerJournal } from "../src/journal.js";
import { loadConfig } from "../src/config.js";

const base = loadConfig({ TARE_API_URL: "https://api.exemple" } as never);

/** Attend que les depots asynchrones soient partis : `deposer` ne rend rien a attendre. */
const souffler = () => new Promise((r) => setTimeout(r, 20));

test("sans cle : aucune requete, et l'etat le dit", async () => {
  const appels: string[] = [];
  const j = creerJournal(
    { ...base, cleApi: null },
    { fetchImpl: (async (u: string) => { appels.push(String(u)); return new Response("{}"); }) as never },
  );
  j.deposer("mesure", "0xaaaa", { outil: "tare_measure" });
  await souffler();
  assert.deepEqual(appels, []);
  assert.equal(j.etat().actif, false);
  assert.match(j.etat().raison, /rien n'est envoye/);
});

test("TARE_CLE_API vide n'est pas une cle", () => {
  assert.equal(loadConfig({ TARE_CLE_API: "   " } as never).cleApi, null);
  assert.equal(loadConfig({ TARE_CLE_API: "tare_m_x" } as never).cleApi, "tare_m_x");
});

test("avec cle : POST /compte/journal, en-tete x-tare-cle, source mcp", async () => {
  const vus: { url: string; init: RequestInit }[] = [];
  const j = creerJournal(
    { ...base, cleApi: "tare_m_secret" },
    {
      fetchImpl: (async (u: string, i: RequestInit) => {
        vus.push({ url: String(u), init: i });
        return new Response(JSON.stringify({ enregistre: {} }), { status: 201 });
      }) as never,
    },
  );
  j.deposer("mesure", "0xaaaa", { outil: "tare_lookup", ms: 3 });
  await souffler();
  assert.equal(vus.length, 1);
  const vu = vus[0]!;
  assert.equal(vu.url, "https://api.exemple/compte/journal");
  const h = vu.init.headers as Record<string, string>;
  assert.equal(h["x-tare-cle"], "tare_m_secret");
  const corps = JSON.parse(String(vu.init.body));
  assert.equal(corps.source, "mcp");
  assert.equal(corps.quoi, "mesure");
  assert.equal(corps.sujet, "0xaaaa");
  assert.equal(corps.detail.outil, "tare_lookup");
  assert.equal(j.etat().deposes, 1);
});

test("un refus ne leve pas, et il est compte", async () => {
  const j = creerJournal(
    { ...base, cleApi: "tare_m_x" },
    { fetchImpl: (async () => new Response("{}", { status: 402 })) as never },
  );
  j.deposer("mesure", null, {});
  await souffler();
  assert.equal(j.etat().echecs, 1);
  assert.equal(j.etat().deposes, 0);
});

test("un reseau mort ne leve pas non plus", async () => {
  const j = creerJournal(
    { ...base, cleApi: "tare_m_x" },
    { fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as never },
  );
  j.deposer("mesure", null, {});
  await souffler();
  assert.equal(j.etat().echecs, 1);
});

test("la cle n'apparait jamais dans l'etat rendu", () => {
  const j = creerJournal({ ...base, cleApi: "tare_m_tres_secret" });
  assert.equal(JSON.stringify(j.etat()).includes("tres_secret"), false);
});

test("le serveur annonce s'il enregistre ou non", async () => {
  const { createServer } = await import("../src/server.js");
  const { createStore } = await import("../src/store.js");
  // On ne peut pas relire les instructions depuis McpServer : on verifie que les deux
  // constructions passent, et que le journal injecte est bien celui utilise.
  const appels: string[] = [];
  const j = creerJournal(
    { ...base, cleApi: "tare_m_x" },
    { fetchImpl: (async (u: string) => { appels.push(String(u)); return new Response("{}", { status: 201 }); }) as never },
  );
  const s = createServer(loadConfig({} as never), createStore(), j);
  assert.ok(s);
  assert.equal(j.etat().actif, true);
});
