/**
 * LA PASTILLE DE L'ICONE — de l'etape emise par une garde jusqu'a chrome.action.
 *
 * La chaine a tenir : une garde TARE emet une etape dans le monde de la page -> inject.js la
 * relaie par postMessage -> pont.js la passe au worker -> le worker allume la pastille de
 * L'ONGLET EMETTEUR. Chaque maillon est teste ici sans navigateur ; le test de bout en bout
 * (e2e/extension.spec.ts) les refait dans un vrai Chromium et lit `chrome.action.getBadgeText`.
 *
 * Ce qui compte le plus : la page peut poster n'importe quoi dans le canal. Le worker relit
 * donc chaque champ, et il prend l'onglet dans l'expediteur, jamais dans le message.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { MARQUE } from "../extension/protocole.js";
import {
  COULEUR_TRANSMISE,
  GRIS_REFUS,
  ORANGE_TARE,
  TITRE_REPOS,
  lireEtape,
  pastillePour,
  texteBps,
  type EtapeLue,
} from "../extension/pastille.js";
import { EVENEMENT_ETAPE } from "../src/injection.js";

const HOOK_DEMO = "0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044";

const etapeDemo = (x: Record<string, unknown> = {}) => ({
  marque: MARQUE,
  genre: "etape",
  id: "e.1",
  etape: "interceptee",
  garde: "page",
  verdict: "ok",
  hook: HOOK_DEMO,
  bps: 4.0933,
  ailleurs: null,
  etiquette: "MEASURED",
  bloc: 50614000,
  titre: "Ce hook prend 4.09 bps a ta taille, mesure au bloc 50614000. Continuer ?",
  par: null,
  raison: null,
  origine: "tare-hooks.tech",
  ...x,
});

const lue = (x: Record<string, unknown> = {}): EtapeLue => lireEtape(etapeDemo(x))!;

describe("texteBps : quatre caracteres, et jamais un zero invente", () => {
  it.each([
    [4.0933, "4.1"],
    [0, "0"],
    [0.02, "<0.1"],
    [1.0027, "1"],
    [9.94, "9.9"],
    [119.7604, "120"],
    [300, "300"],
    [1176.2, "1.2k"],
    [9999.5279, "10k"],
    [-100, "-100"],
    [-3.5, "-3.5"],
    [null, "?"],
  ])("%s bps -> %s", (bps, attendu) => {
    expect(texteBps(bps)).toBe(attendu);
    expect(texteBps(bps).length).toBeLessThanOrEqual(4);
  });

  it("aucune valeur du corpus ne deborde quatre caracteres", () => {
    for (let b = -100; b <= 10000; b += 0.37) expect(texteBps(b).length, String(b)).toBeLessThanOrEqual(4);
  });
});

describe("lireEtape : le worker ne croit rien sur parole", () => {
  it("rend l'etape de la demonstration telle quelle", () => {
    expect(lue()).toEqual({
      etape: "interceptee",
      garde: "page",
      verdict: "ok",
      hook: HOOK_DEMO,
      bps: 4.0933,
      ailleurs: null,
      etiquette: "MEASURED",
      bloc: 50614000,
      par: null,
    });
  });

  it("refuse ce qui n'est pas une etape connue", () => {
    expect(lireEtape(null)).toBeNull();
    expect(lireEtape({ ...etapeDemo(), marque: "autre/1" })).toBeNull();
    expect(lireEtape({ ...etapeDemo(), genre: "journal" })).toBeNull();
    expect(lireEtape(etapeDemo({ etape: "allumer-tout" }))).toBeNull();
  });

  it("annule ou borne chaque champ fabrique", () => {
    const e = lireEtape(
      etapeDemo({
        garde: "root",
        verdict: "super-ok",
        hook: "0xpas-une-adresse",
        bps: 1e9,
        ailleurs: 42,
        etiquette: "GUARANTEED",
        bloc: -5,
        par: "x\u0000\u001f".repeat(40),
      }),
    )!;
    expect(e.garde).toBe("page");
    expect(e.verdict).toBeNull();
    expect(e.hook).toBeNull();
    expect(e.bps).toBeNull();
    expect(e.etiquette).toBeNull();
    expect(e.bloc).toBeNull();
    expect(e.par!.length).toBeLessThanOrEqual(40);
    expect(e.par).not.toMatch(/[\u0000-\u001f]/);
    // `ailleurs` n'a de sens que quand ce swap-ci n'est pas chiffre
    expect(e.ailleurs).toBe(42);
    expect(lue({ ailleurs: 42 }).ailleurs).toBeNull();
    // une adresse en majuscules est la meme adresse
    expect(lue({ hook: HOOK_DEMO.toUpperCase().replace("0X", "0x") }).hook).toBe(HOOK_DEMO);
  });
});

describe("pastillePour", () => {
  it("au repos : aucune pastille", () => {
    expect(pastillePour(lue({ etape: "repos" }))).toEqual({ texte: "", couleur: GRIS_REFUS, titre: TITRE_REPOS });
  });

  it("interceptee sur la demonstration : 4.1 sur l'orange, et le titre dit le hook et ce qu'il prend", () => {
    const p = pastillePour(lue());
    expect(p.texte).toBe("4.1");
    expect(p.couleur).toBe(ORANGE_TARE);
    expect(p.titre).toContain(`hook ${HOOK_DEMO} takes 4.0933 bps (MEASURED, block 50614000)`);
    expect(p.titre).toContain("the page's own TARE guard");
    expect(p.titre).toContain("Nothing has been sent yet");
    // le titre est en anglais, comme le site : aucune phrase francaise de la garde n'y passe
    expect(p.titre).not.toContain("Continuer");
  });

  it("un hook non chiffre a cette taille : « ? », jamais 0, et le faisceau est cite comme tel", () => {
    const p = pastillePour(lue({ bps: null, etiquette: "NOT_MEASURABLE", ailleurs: 9999.5279, verdict: "block", garde: "extension" }));
    expect(p.texte).toBe("?");
    expect(p.titre).toContain("unknown, not zero");
    expect(p.titre).toContain("the same hook took 9999.5279 bps elsewhere");
    expect(p.titre).toContain("by the extension");
  });

  it("un swap sans hook est quand meme intercepte : « ON »", () => {
    const p = pastillePour(lue({ hook: null, bps: null, etiquette: "NOT_MEASURABLE" }));
    expect(p.texte).toBe("ON");
    expect(p.titre).toContain("no hook in this swap");
  });

  it("refusee : « NO », gris, et qui a tranche", () => {
    const p = pastillePour(lue({ etape: "refusee", par: "the page" }));
    expect(p).toMatchObject({ texte: "NO", couleur: GRIS_REFUS });
    expect(p.titre).toContain("refused, nothing was sent");
    expect(p.titre).toContain("Decided by the page.");
    expect(pastillePour(lue({ etape: "refusee", par: "overlay" })).titre).toContain("Decided by you, in the TARE Guard window.");
  });

  it("transmise : « SENT », la couleur du verdict, et le portillon n'est pas un « qui »", () => {
    expect(pastillePour(lue({ etape: "transmise", par: "the device" }))).toMatchObject({
      texte: "SENT",
      couleur: COULEUR_TRANSMISE.ok,
    });
    expect(pastillePour(lue({ etape: "transmise", verdict: "block" })).couleur).toBe(COULEUR_TRANSMISE.block);
    expect(pastillePour(lue({ etape: "transmise", par: "gate" })).titre).not.toContain("Decided by");
  });
});

/* ------------------------------------------------------------------ le worker */

function fauxChromeAvecAction(opts: { sansAction?: boolean } = {}) {
  const ecoutes: ((m: unknown, e: unknown, r: (x: unknown) => void) => boolean)[] = [];
  const appels: { api: string; details: Record<string, unknown> }[] = [];
  const api = (nom: string) => (details: Record<string, unknown>) => {
    appels.push({ api: nom, details });
    return Promise.resolve();
  };
  const chrome = {
    runtime: {
      getURL: (p: string) => `chrome-extension://faux/${p}`,
      onMessage: { addListener: (f: never) => ecoutes.push(f) },
      onInstalled: { addListener: () => {} },
      lastError: undefined,
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    ...(opts.sansAction
      ? {}
      : {
          action: {
            setBadgeText: api("setBadgeText"),
            setBadgeBackgroundColor: api("setBadgeBackgroundColor"),
            setBadgeTextColor: api("setBadgeTextColor"),
            setTitle: api("setTitle"),
          },
        }),
  };
  return { chrome, ecoutes, appels };
}

async function monterWorker(opts: { sansAction?: boolean } = {}) {
  const f = fauxChromeAvecAction(opts);
  vi.stubGlobal("chrome", f.chrome);
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
  vi.resetModules();
  await import("../extension/worker.src.js");
  const envoyer = (m: unknown, expediteur: unknown) =>
    new Promise<unknown>((res) => {
      let repondu = false;
      const asynchrone = f.ecoutes[0]!(m, expediteur, (x) => {
        repondu = true;
        res(x);
      });
      if (!asynchrone && !repondu) res(undefined);
    });
  return { ...f, envoyer };
}

describe("le worker allume la pastille de l'onglet EMETTEUR", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("interceptee : texte, orange, titre — tous poses sur le tabId de l'expediteur", async () => {
    const w = await monterWorker();
    const r = await w.envoyer(etapeDemo(), { tab: { id: 7 }, frameId: 0 });
    expect(r).toEqual({ recu: true });
    const par = Object.fromEntries(w.appels.map((a) => [a.api, a.details]));
    expect(par["setBadgeText"]).toEqual({ tabId: 7, text: "4.1" });
    expect(par["setBadgeBackgroundColor"]).toEqual({ tabId: 7, color: ORANGE_TARE });
    expect(par["setBadgeTextColor"]).toEqual({ tabId: 7, color: "#ffffff" });
    expect(par["setTitle"]!["tabId"]).toBe(7);
    expect(String(par["setTitle"]!["title"])).toContain(HOOK_DEMO);
  });

  it("l'onglet vient de l'expediteur : un tabId glisse dans le message est ignore", async () => {
    const w = await monterWorker();
    await w.envoyer({ ...etapeDemo(), tabId: 999, tab: { id: 999 } }, { tab: { id: 3 } });
    expect(w.appels.every((a) => a.details["tabId"] === 3)).toBe(true);
  });

  it("sans onglet (page d'options, autre extension) : rien n'est allume", async () => {
    const w = await monterWorker();
    await w.envoyer(etapeDemo(), {});
    await w.envoyer(etapeDemo(), { tab: { id: -1 } });
    expect(w.appels).toEqual([]);
  });

  it("une etape fabriquee n'allume rien, et le dit", async () => {
    const w = await monterWorker();
    const r = await w.envoyer(etapeDemo({ etape: "tout-allumer" }), { tab: { id: 7 } });
    expect(r).toEqual({ recu: false });
    expect(w.appels).toEqual([]);
  });

  it("repos : la pastille s'efface et le titre revient au neutre", async () => {
    const w = await monterWorker();
    await w.envoyer({ marque: MARQUE, genre: "etape", id: "e.2", etape: "repos" }, { tab: { id: 7 } });
    const par = Object.fromEntries(w.appels.map((a) => [a.api, a.details]));
    expect(par["setBadgeText"]).toEqual({ tabId: 7, text: "" });
    expect(par["setTitle"]).toEqual({ tabId: 7, title: TITRE_REPOS });
  });

  it("manifeste sans cle « action » : un avertissement, pas une exception", async () => {
    const avert = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = await monterWorker({ sansAction: true });
    await expect(w.envoyer(etapeDemo(), { tab: { id: 7 } })).resolves.toEqual({ recu: true });
    expect(avert.mock.calls.flat().join(" ")).toMatch(/action/);
  });

  it("le manifeste declare bien la cle « action » — sans elle, chrome.action n'existe pas", async () => {
    // Mesure faite dans Chromium le 15 septembre 2026 : sans cle `action`, `typeof chrome.action`
    // vaut "undefined" dans le worker, et aucune pastille ne peut s'allumer.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const m = JSON.parse(readFileSync(resolve(import.meta.dirname, "../extension/manifest.json"), "utf8"));
    expect(m.action).toBeDefined();
    expect(m.action.default_title).toBe(TITRE_REPOS);
  });
});

/* -------------------------------------------------------- le pont, et inject */

/** Une fausse fenetre : un EventTarget, un postMessage espionne, une adresse modifiable. */
function fausseFenetre(opts: { cadre?: boolean } = {}) {
  const w = new EventTarget() as EventTarget & Record<string, unknown>;
  const postes: unknown[] = [];
  w["postMessage"] = (m: unknown) => {
    postes.push(m);
  };
  w["location"] = { host: "tare-hooks.tech", pathname: "/", hash: "#/demo" };
  w["top"] = opts.cadre ? {} : w;
  return { w, postes };
}

describe("le pont relaie les etapes au worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("une etape du monde MAIN part vers chrome.runtime ; un message d'une autre fenetre, non", async () => {
    const { w } = fausseFenetre();
    const envoyes: unknown[] = [];
    vi.stubGlobal("window", w);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: (m: unknown, rappel?: () => void) => {
          envoyes.push(m);
          rappel?.();
        },
        lastError: undefined,
      },
    });
    vi.resetModules();
    await import("../extension/pont.src.js");
    const message = (data: unknown, source: unknown) => {
      const e = new MessageEvent("message", { data });
      Object.defineProperty(e, "source", { value: source });
      w.dispatchEvent(e);
    };
    message(etapeDemo(), w);
    message(etapeDemo(), {}); // un iframe, ou une autre fenetre
    message({ genre: "etape", etape: "interceptee" }, w); // sans la marque
    expect(envoyes).toEqual([etapeDemo()]);
  });
});

describe("inject relaie les etapes de TOUTE garde de la fenetre", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function monterInject(opts: { cadre?: boolean } = {}) {
    const f = fausseFenetre(opts);
    vi.stubGlobal("window", f.w);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.resetModules();
    await import("../extension/inject.src.js");
    const emettre = (detail: unknown) => f.w.dispatchEvent(new CustomEvent(EVENEMENT_ETAPE, { detail }));
    const etapes = () => f.postes.filter((m) => (m as { genre?: string }).genre === "etape") as Record<string, unknown>[];
    return { ...f, emettre, etapes };
  }

  const detailDemo = { v: 1, etape: "interceptee", garde: "page", verdict: "ok", hook: HOOK_DEMO, bps: 4.0933, ailleurs: null, etiquette: "MEASURED", bloc: 50614000, titre: "t", par: null, raison: null };

  it("une etape emise par la garde de la PAGE part vers le pont, marquee et complete", async () => {
    const i = await monterInject();
    i.emettre(detailDemo);
    expect(i.etapes()).toHaveLength(1);
    expect(i.etapes()[0]).toMatchObject({ marque: MARQUE, genre: "etape", etape: "interceptee", garde: "page", hook: HOOK_DEMO, bps: 4.0933, origine: "tare-hooks.tech" });
    // et le worker la relit sans rien perdre
    expect(lireEtape(i.etapes()[0])).toMatchObject({ etape: "interceptee", bps: 4.0933, hook: HOOK_DEMO });
  });

  it("un format inconnu n'allume rien", async () => {
    const i = await monterInject();
    i.emettre({ ...detailDemo, v: 2 });
    i.emettre(null);
    expect(i.etapes()).toEqual([]);
  });

  it("changer de route remet au repos — seulement si une etape a ete relayee, et pas pour une requete", async () => {
    const i = await monterInject();
    const loc = i.w["location"] as { hash: string };
    // rien d'allume : changer de route ne reveille pas le worker
    loc.hash = "#/";
    i.w.dispatchEvent(new Event("hashchange"));
    expect(i.etapes()).toEqual([]);
    // allume, puis meme route avec une requete : on garde
    loc.hash = "#/demo";
    i.w.dispatchEvent(new Event("hashchange"));
    i.emettre(detailDemo);
    loc.hash = "#/demo?vue=queue";
    i.w.dispatchEvent(new Event("hashchange"));
    expect(i.etapes().map((m) => m["etape"])).toEqual(["interceptee"]);
    // autre route : repos, une seule fois
    loc.hash = "#/";
    i.w.dispatchEvent(new Event("hashchange"));
    i.w.dispatchEvent(new Event("popstate"));
    expect(i.etapes().map((m) => m["etape"])).toEqual(["interceptee", "repos"]);
  });

  it("dans un iframe, un changement d'ancre ne remet pas l'onglet au repos", async () => {
    const i = await monterInject({ cadre: true });
    i.emettre(detailDemo);
    (i.w["location"] as { hash: string }).hash = "#/ailleurs";
    i.w.dispatchEvent(new Event("hashchange"));
    expect(i.etapes().map((m) => m["etape"])).toEqual(["interceptee"]);
  });
});
