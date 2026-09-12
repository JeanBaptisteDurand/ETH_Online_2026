/**
 * L'EXTENSION : ses trois morceaux, et la mesure qui les justifie.
 *
 * LE TEST QUI COMPTE LE PLUS est le dernier : le script de contenu doit rester PETIT. Il
 * pesait 21,9 Mo parce qu'esbuild inlinait data/table.json, et il tourne a document_start sur
 * CHAQUE page visitee — donc 21,9 Mo de source JS a parser avant que la page ne commence.
 * C'est une regression qui ne se voit pas : l'extension « marche », elle rend juste chaque
 * page insupportable. Un seuil en octets est la seule chose qui l'empeche de revenir.
 *
 * Les autres tests portent sur ce qui peut faire disparaitre un verdict en silence : un
 * worker endormi, une table absente du paquet, un `chrome.runtime.lastError` non lu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { MARQUE, estDeNous, CLES_STOCKAGE, API_DEFAUT, CIBLE_MEME_FENETRE } from "../extension/protocole.js";

const RACINE = resolve(import.meta.dirname, "..");
const EXT = resolve(RACINE, "extension");

/* ------------------------------------------------------------- le protocole */

describe("le protocole", () => {
  it("reconnait nos messages et rien d'autre", () => {
    expect(estDeNous({ marque: MARQUE, genre: "consulter", id: "1", tx: {} })).toBe(true);
    // une page hostile peut poster n'importe quoi : tout ce qui n'a pas la marque est ignore
    expect(estDeNous({ genre: "consulter" })).toBe(false);
    expect(estDeNous({ marque: "autre-extension/1" })).toBe(false);
    expect(estDeNous(null)).toBe(false);
    expect(estDeNous("consulter")).toBe(false);
  });

  it("les cles de stockage sont nommees une seule fois, en un seul endroit", () => {
    // Trois fichiers les lisent (worker, options, protocole) : une chaine recopiee de travers
    // donnerait une cle enregistree et jamais relue.
    const noms = Object.values(CLES_STOCKAGE);
    expect(new Set(noms).size).toBe(noms.length);
    for (const f of ["worker.src.ts", "options.src.ts"]) {
      const s = readFileSync(resolve(EXT, f), "utf8");
      expect(s).toContain("CLES_STOCKAGE");
      // aucune cle ecrite en dur a cote de la constante
      for (const n of noms) expect(s.includes(`"${n}"`)).toBe(false);
    }
  });
});

/* --------------------------------------------------------------- le worker */

/** Un faux `chrome`, juste assez pour que le worker s'installe et reponde. */
function fauxChrome(opts: {
  table?: unknown;
  tableStatut?: number;
  stockage?: Record<string, unknown>;
}) {
  const ecoutes: ((m: unknown, e: unknown, r: (x: unknown) => void) => boolean)[] = [];
  const fetches: { url: string; init?: RequestInit }[] = [];
  const chrome = {
    runtime: {
      getURL: (p: string) => `chrome-extension://faux/${p}`,
      onMessage: { addListener: (f: never) => ecoutes.push(f) },
      onInstalled: { addListener: () => {} },
      lastError: undefined as { message: string } | undefined,
    },
    storage: {
      local: {
        get: async (cles: string[]) => {
          const s = opts.stockage ?? {};
          const out: Record<string, unknown> = {};
          for (const c of cles) if (c in s) out[c] = s[c];
          return out;
        },
        set: async () => {},
      },
    },
  };
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    fetches.push({ url: String(url), init });
    if (String(url).endsWith("table.json"))
      return new Response(JSON.stringify(opts.table ?? {}), { status: opts.tableStatut ?? 200 });
    return new Response(JSON.stringify({ enregistre: {} }), { status: 201 });
  }) as unknown as typeof fetch;
  return { chrome, ecoutes, fetches, fetchImpl };
}

const tableMinimale = {
  schema: "tare-guard-table/1",
  generated_at: "2026-09-10T00:00:00Z",
  source: "test",
  engine_ver: null,
  stub_hash: null,
  chain_id: 8453,
  block_number: 50614000,
  blocks: [50614000],
  n_measurements: 1,
  n_hooks: 0,
  n_pools: 0,
  hooks: {},
  pools: {},
};

/** Charge le worker avec un faux `chrome`, et rend de quoi lui parler. */
async function monterWorker(opts: Parameters<typeof fauxChrome>[0]) {
  const f = fauxChrome(opts);
  vi.stubGlobal("chrome", f.chrome);
  vi.stubGlobal("fetch", f.fetchImpl);
  // Un module FRAIS a chaque montage : `table` et `chargement` sont des caches de module,
  // et un worker qui a deja charge la table ne rechargerait rien au test suivant.
  vi.resetModules();
  await import("../extension/worker.src.js");
  const envoyer = (m: unknown): Promise<unknown> =>
    new Promise((res) => {
      let repondu = false;
      const async_ = f.ecoutes[0]!(m, {}, (x) => {
        repondu = true;
        res(x);
      });
      if (!async_ && !repondu) res(undefined);
    });
  return { ...f, envoyer };
}

describe("le service worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ignore ce qui ne porte pas notre marque", async () => {
    const w = await monterWorker({ table: tableMinimale });
    const r = await w.envoyer({ genre: "consulter", id: "1", tx: {} });
    expect(r).toBeUndefined();
    // et il n'a pas touche a la table pour un message qui n'est pas de nous
    expect(w.fetches).toEqual([]);
  });

  it("charge la table PARESSEUSEMENT : rien avant le premier swap", async () => {
    const w = await monterWorker({ table: tableMinimale });
    expect(w.fetches).toEqual([]); // l'installation ne charge rien
    await w.envoyer({ marque: MARQUE, genre: "consulter", id: "1", tx: { data: "0x" } });
    expect(w.fetches.filter((x) => x.url.endsWith("table.json"))).toHaveLength(1);
  });

  it("ne la charge qu'UNE fois, meme pour deux swaps simultanes", async () => {
    const w = await monterWorker({ table: tableMinimale });
    await Promise.all([
      w.envoyer({ marque: MARQUE, genre: "consulter", id: "1", tx: { data: "0x" } }),
      w.envoyer({ marque: MARQUE, genre: "consulter", id: "2", tx: { data: "0x" } }),
    ]);
    expect(w.fetches.filter((x) => x.url.endsWith("table.json"))).toHaveLength(1);
  });

  it("table absente du paquet : un verdict NUL avec sa raison, jamais un silence", async () => {
    const w = await monterWorker({ tableStatut: 404 });
    const r = (await w.envoyer({ marque: MARQUE, genre: "consulter", id: "1", tx: { data: "0x" } })) as {
      rapport: unknown;
      raison: string;
    };
    expect(r.rapport).toBeNull();
    // la raison dit QUOI FAIRE, pas seulement que ca a rate
    expect(r.raison).toMatch(/absente du paquet/);
    expect(r.raison).toMatch(/build:table/);
  });

  it("un echec de chargement n'est pas memorise : la tentative suivante reessaie", async () => {
    const f = fauxChrome({ tableStatut: 500 });
    let statut = 500;
    const fetchImpl = (async (url: string) => {
      f.fetches.push({ url: String(url) });
      return new Response(JSON.stringify(tableMinimale), { status: statut });
    }) as unknown as typeof fetch;
    vi.stubGlobal("chrome", f.chrome);
    vi.stubGlobal("fetch", fetchImpl);
    vi.resetModules();
    await import("../extension/worker.src.js");
    const envoyer = (m: unknown) =>
      new Promise((res) => {
        f.ecoutes[0]!(m, {}, res);
      });

    const un = (await envoyer({ marque: MARQUE, genre: "consulter", id: "1", tx: { data: "0x" } })) as { rapport: unknown };
    expect(un.rapport).toBeNull();
    statut = 200; // la base revient
    const deux = (await envoyer({ marque: MARQUE, genre: "consulter", id: "2", tx: { data: "0x" } })) as { rapport: unknown };
    expect(deux.rapport).not.toBeNull();
  });

  it("rend un vrai rapport quand la table est la", async () => {
    const w = await monterWorker({ table: tableMinimale });
    const r = (await w.envoyer({
      marque: MARQUE,
      genre: "consulter",
      id: "1",
      tx: { to: "0x6ff5693b99212da76ad316178a184ab56d299b43", data: "0x" },
    })) as { rapport: { verdict: string; table: { blockNumber: number } }; raison: null };
    expect(r.raison).toBeNull();
    expect(r.rapport.verdict).toBeDefined();
    expect(r.rapport.table.blockNumber).toBe(50614000);
  });
});

describe("le journal du worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  const evenement = {
    marque: MARQUE,
    genre: "journal" as const,
    id: "j1",
    quoi: "verdict" as const,
    sujet: "0xaaaa",
    detail: { verdict: "warn" },
  };

  it("SANS cle : aucun appel reseau du tout", async () => {
    const w = await monterWorker({ table: tableMinimale, stockage: {} });
    await w.envoyer(evenement);
    await new Promise((r) => setTimeout(r, 10));
    expect(w.fetches).toEqual([]);
  });

  it("cle vide n'est pas une cle", async () => {
    const w = await monterWorker({ table: tableMinimale, stockage: { [CLES_STOCKAGE.cleApi]: "" } });
    await w.envoyer(evenement);
    await new Promise((r) => setTimeout(r, 10));
    expect(w.fetches).toEqual([]);
  });

  it("AVEC cle : POST /compte/journal, en-tete x-tare-cle, source extension", async () => {
    const w = await monterWorker({
      table: tableMinimale,
      stockage: { [CLES_STOCKAGE.cleApi]: "tare_x_secret", [CLES_STOCKAGE.api]: "https://api.exemple/" },
    });
    await w.envoyer(evenement);
    await new Promise((r) => setTimeout(r, 10));
    const appel = w.fetches.find((x) => x.url.includes("/compte/journal"))!;
    expect(appel).toBeDefined();
    // la barre oblique finale de l'API ne doit pas produire un double slash
    expect(appel.url).toBe("https://api.exemple/compte/journal");
    const h = appel.init!.headers as Record<string, string>;
    expect(h["x-tare-cle"]).toBe("tare_x_secret");
    const corps = JSON.parse(String(appel.init!.body));
    expect(corps.source).toBe("extension");
    expect(corps.quoi).toBe("verdict");
  });

  it("journaliser a false coupe l'envoi, cle ou pas", async () => {
    const w = await monterWorker({
      table: tableMinimale,
      stockage: { [CLES_STOCKAGE.cleApi]: "tare_x", [CLES_STOCKAGE.journaliser]: false },
    });
    await w.envoyer(evenement);
    await new Promise((r) => setTimeout(r, 10));
    expect(w.fetches).toEqual([]);
  });

  it("l'API par defaut est locale : rien ne part vers un domaine devine", () => {
    expect(API_DEFAUT).toMatch(/^http:\/\/127\.0\.0\.1/);
  });
});

/* --------------------------------------- LA CIBLE DES postMessage ENTRE MONDES */

describe("les deux mondes se parlent meme sans origine", () => {
  /**
   * Verifie a l'execution dans Chrome : dans un iframe `sandbox="allow-scripts"`, l'origine du
   * document est opaque ("null") mais `location.origin` rend quand meme l'origine de l'URL.
   * Postee comme cible, elle fait refuser la livraison par Chrome — SANS LEVER, une simple
   * ligne en console :
   *
   *   The target origin provided ('http://127.0.0.1:8796') does not match the recipient
   *   window's origin ('null').
   *
   * La question n'arrivait donc pas au pont, ou la reponse n'arrivait pas au monde MAIN, et
   * inject attendait ses 2500 ms avant de laisser passer la transaction sans verdict. Le
   * manifeste posant les scripts avec `all_frames: true`, ces cadres sont dans la portee.
   */
  it("la cible est *, jamais une origine devinee", () => {
    expect(CIBLE_MEME_FENETRE).toBe("*");
  });

  it("ni inject ni pont ne postent vers location.origin", () => {
    for (const f of ["inject.src.ts", "pont.src.ts"]) {
      const s = readFileSync(resolve(EXT, f), "utf8");
      expect(s).toContain("CIBLE_MEME_FENETRE");
      expect(s.includes("location.origin"), `${f} poste vers une origine qui ment en bac a sable`).toBe(false);
    }
  });
});

/* ------------------------------------------------ LA MESURE QUI JUSTIFIE TOUT */

describe("le script de contenu doit rester petit", () => {
  /**
   * 200 Ko. Le bundle mesure ~12 Ko ; la marge laisse de la place pour du code, pas pour une
   * table. data/table.json en fait 21 000. Si ce test rougit, quelqu'un a reintroduit un
   * chemin d'import qui atteint la table depuis le monde MAIN — probablement en important
   * "../src/browser.js" ou "../src/guard.js" au lieu de "../src/injection.js".
   */
  const PLAFOND = 200 * 1024;

  it("inject.js et pont.js sont sous 200 Ko chacun", () => {
    execFileSync("node", ["scripts/paqueter-extension.mjs", "--sans-zip"], { cwd: RACINE, stdio: "pipe" });
    for (const f of ["inject.js", "pont.js"]) {
      const o = statSync(resolve(EXT, f)).size;
      expect(o, `${f} pese ${(o / 1024).toFixed(0)} Ko`).toBeLessThan(PLAFOND);
    }
  });

  it("aucun des deux ne contient de mesure : ni bps, ni pool_id, ni stub_hash", () => {
    for (const f of ["inject.js", "pont.js"]) {
      const s = readFileSync(resolve(EXT, f), "utf8");
      expect(s.includes('"n_measurements"'), `${f} porte la table`).toBe(false);
      expect(s.includes('"stub_hash"'), `${f} porte la table`).toBe(false);
    }
  });

  it("la table est copiee a cote, pas bundlee dans le worker", () => {
    expect(existsSync(resolve(EXT, "table.json"))).toBe(true);
    const w = statSync(resolve(EXT, "worker.js")).size;
    // le worker fait ~45 Ko ; la table 21 Mo. S'il grossit d'un facteur 100, elle est dedans.
    expect(w).toBeLessThan(500 * 1024);
  });

  it("le manifeste declare les trois mondes et la table en ressource accessible", () => {
    const m = JSON.parse(readFileSync(resolve(EXT, "manifest.json"), "utf8"));
    expect(m.manifest_version).toBe(3);
    const mondes = (m.content_scripts as { world: string; js: string[] }[]).map((c) => c.world);
    expect(mondes).toContain("MAIN");
    expect(mondes).toContain("ISOLATED");
    expect(m.background.service_worker).toBe("worker.js");
    expect(m.background.type).toBe("module");
    // sans web_accessible_resources, le fetch du worker sur table.json echoue
    expect(m.web_accessible_resources[0].resources).toContain("table.json");
    // la cle d'API a besoin de storage, et le journal d'un hote autorise
    expect(m.permissions).toContain("storage");
    expect(m.host_permissions.length).toBeGreaterThan(0);
    expect(m.options_ui.page).toBe("options.html");
  });
});
