/**
 * L'EXTENSION DANS UN VRAI CHROMIUM — chargement, interception, table, pastille, cohabitation.
 *
 *   cd packages/guard && npm run test:e2e
 *
 * Ce que les tests unitaires ne peuvent pas dire, et que celui-ci mesure :
 *
 *   1. le paquet se CHARGE : service worker demarre, `chrome.action` present, zero erreur ;
 *   2. sur un site ordinaire, l'extension n'arrete QUE `eth_sendTransaction`, lit la table du
 *      paquet (un hook du corpus rend un verdict), et sa pastille suit : orange a l'interception,
 *      « NO » au refus, « SENT » quand la transaction part — sur CET onglet seulement ;
 *   3. la pastille s'efface au rechargement et au changement de route ;
 *   4. sur une page qui porte SA garde, dans le motif exact de https://tare-hooks.tech/#/demo
 *      (apps/web/src/demo/interception.ts, importe tel quel) : la page demande, l'extension
 *      n'ouvre rien, la pastille s'allume AU CLIC quand meme, et la transaction approuvee par la
 *      page n'est pas reconsultee.
 *
 * Aucun service distant : les pages sont servies ici, le portefeuille est un faux, et la pastille
 * est lue par `chrome.action.getBadgeText({ tabId })` dans le service worker.
 */
import { test, expect, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RACINE = resolve(import.meta.dirname, "..");
const EXT = resolve(RACINE, "extension");
const REPO = resolve(RACINE, "..", "..");
const INTERCEPTION_DU_SITE = resolve(REPO, "apps/web/src/demo/interception.ts");

const COMPTE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ROUTEUR = "0x6ff5693b99212da76ad316178a184ab56d299b43";
const HOOK_DEMO = "0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044";
const ORANGE = [235, 102, 40, 255];
const TITRE_REPOS = "TARE Guard · nothing intercepted on this tab";

/** Un vrai swap capture sur Base : hook 0xb429d62f, non chiffre a cette taille, verdict block. */
const CAPTURE = (
  JSON.parse(readFileSync(resolve(RACINE, "test/fixtures/real-calldata.json"), "utf8")) as {
    txs: { tx_hash: string; to: string; input: string }[];
  }
).txs.find((t) => t.tx_hash.startsWith("0xfa82cb2c"))!;

/** Le faux portefeuille : il compte ce qui l'atteint, et ne relaie rien nulle part. */
const PORTEFEUILLE = `(() => {
  const etat = { appels: [], envois: [] };
  Object.defineProperty(window, '__portefeuille', { value: etat });
  const f = {
    isMetaMask: true,
    on() { return this }, removeListener() { return this },
    async request(a) {
      etat.appels.push(a.method);
      if (a.method === 'eth_requestAccounts' || a.method === 'eth_accounts') return ['${COMPTE}'];
      if (a.method === 'eth_chainId') return '0x2105';
      if (a.method === 'eth_sendTransaction') { etat.envois.push(a.params[0]); return '0x' + 'ab'.repeat(32); }
      return null;
    },
  };
  window.ethereum = f;
  const info = { uuid: 'faux-1', name: 'Faux portefeuille', icon: 'data:,', rdns: 'test.faux' };
  const annoncer = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider: f }) }));
  window.addEventListener('eip6963:requestProvider', annoncer);
  annoncer();
})()`;

/**
 * La page qui porte SA garde. Elle importe `poserLaGarde` du site, tel quel : une coquille neuve
 * sur le portefeuille, enveloppee par src/injection.ts, `askOn` sur les trois verdicts, et un
 * approbateur qui montre deux boutons. Le parcours du site peut deplacer le choix vers l'appareil :
 * le moment qui compte ici — l'interception — ne bouge pas.
 */
const SOURCE_PAGE_GARDEE = `
import { poserLaGarde } from ${JSON.stringify(INTERCEPTION_DU_SITE)};
import { encodeUniversalRouterExactInSingle } from ${JSON.stringify(resolve(RACINE, "src/encode.ts"))};

const DATA = encodeUniversalRouterExactInSingle([{
  poolKey: { currency0: "0x0000000000000000000000000000000000000000", currency1: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", fee: 500, tickSpacing: 10, hooks: "${HOOK_DEMO}" },
  zeroForOne: true,
  amountIn: 10n ** 12n,
}]);
const w = window as unknown as Record<string, any>;
w.__DATA_DEMO = DATA;
const $ = (id: string) => document.getElementById(id) as HTMLElement;

void (async () => {
  const table = await (await fetch("/table.json")).json();
  let decider: ((d: unknown) => void) | null = null;
  const poste = poserLaGarde(w.ethereum, {
    table,
    routeur: "${ROUTEUR}",
    atBlock: null,
    askOn: ["ok", "warn", "block"],
    approver: { name: "tare-demo", approve: () => new Promise((res) => { decider = res as never; $("choix").hidden = false; }) as never },
    onReport: (r: { verdict: string; findings: { bps: number | null }[] }) => { $("rapport").textContent = r.verdict + " " + r.findings[0]?.bps; },
  });
  const fin = (texte: string) => { $("choix").hidden = true; decider = null; $("issue").textContent = texte; };
  $("swap").addEventListener("click", () => {
    $("issue").textContent = "";
    poste.fournisseur
      .request({ method: "eth_sendTransaction", params: [{ from: "${COMPTE}", to: "${ROUTEUR}", data: DATA, value: "0xe8d4a51000" }] })
      .then((h) => fin("sent " + h), (e: { code?: number }) => fin("code " + e.code));
  });
  $("refuser").addEventListener("click", () => decider?.({ approved: false, by: "the page", reason: "refused on the page", attestation: null }));
  $("passer").addEventListener("click", () => decider?.({ approved: true, by: "the device", reason: "approved on the device", attestation: null }));
  ($("swap") as HTMLButtonElement).disabled = false;
})();
`;

const HTML_ORDINAIRE = `<!doctype html><meta charset="utf-8"><title>site ordinaire</title><p>un site d'echange quelconque</p>`;
const HTML_GARDEE = `<!doctype html><meta charset="utf-8"><title>page avec sa garde</title>
<button id="swap" disabled>swap</button>
<div id="choix" hidden><button id="refuser">refuse · send nothing</button><button id="passer">send as is</button></div>
<p id="rapport"></p><p id="issue"></p>
<script src="/page-gardee.js"></script>`;

/* ------------------------------------------------------------------ le banc */

let serveur: Server;
let base = "";
let profil = "";
let ctx: BrowserContext;
let idExtension = "";
const erreurs: string[] = [];

async function travailleur(): Promise<Worker> {
  const deja = ctx.serviceWorkers().find((w) => w.url().startsWith("chrome-extension://"));
  return deja ?? ctx.waitForEvent("serviceworker", { predicate: (w) => w.url().startsWith("chrome-extension://") });
}

/** L'identifiant d'onglet d'une page. Sans permission `tabs`, l'URL n'est pas lisible : on active l'onglet. */
async function onglet(page: Page): Promise<number> {
  await page.bringToFront();
  const sw = await travailleur();
  const ids = await sw.evaluate(async () =>
    (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).map((t) => t.id),
  );
  expect(ids).toHaveLength(1);
  return ids[0] as number;
}

async function pastille(tabId: number) {
  const sw = await travailleur();
  return sw.evaluate(
    async (id) => ({
      texte: await chrome.action.getBadgeText({ tabId: id }),
      titre: await chrome.action.getTitle({ tabId: id }),
      couleur: (await chrome.action.getBadgeBackgroundColor({ tabId: id })) as number[],
    }),
    tabId,
  );
}

async function nouvellePage(chemin: string): Promise<{ page: Page; console: string[] }> {
  const page = await ctx.newPage();
  const lignes: string[] = [];
  page.on("console", (m) => lignes.push(m.text()));
  page.on("pageerror", (e) => erreurs.push(`pageerror ${e.message}`));
  await page.goto(`${base}${chemin}`);
  return { page, console: lignes };
}

const envoyerDepuisLaPage = (page: Page, tx: { to: string; data: string }) =>
  page.evaluate(
    ([t, de]) =>
      (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum
        .request({ method: "eth_sendTransaction", params: [{ from: de, to: t.to, data: t.data }] })
        .then((hash) => ({ hash }), (e: { code?: number }) => ({ code: e.code })),
    [tx, COMPTE] as const,
  );

const portefeuille = (page: Page) =>
  page.evaluate(() => (window as unknown as { __portefeuille: { appels: string[]; envois: unknown[] } }).__portefeuille);

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const f of ["manifest.json", "inject.js", "pont.js", "worker.js", "table.json"])
    if (!existsSync(join(EXT, f))) throw new Error(`extension/${f} absent : lance « npm run build:extension » d'abord`);
  if (!existsSync(INTERCEPTION_DU_SITE)) throw new Error(`${INTERCEPTION_DU_SITE} absent : le test de cohabitation rejoue le motif du site`);

  const bundle = await build({
    stdin: { contents: SOURCE_PAGE_GARDEE, loader: "ts", resolveDir: RACINE, sourcefile: "page-gardee.ts" },
    bundle: true,
    format: "iife",
    target: "chrome110",
    write: false,
    logLevel: "silent",
  });
  const js = bundle.outputFiles[0]!.text;

  serveur = createServer((req, res) => {
    const chemin = (req.url ?? "/").split("?")[0];
    if (chemin === "/table.json") {
      res.writeHead(200, { "content-type": "application/json" });
      createReadStream(join(EXT, "table.json")).pipe(res);
      return;
    }
    if (chemin === "/page-gardee.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(js);
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(chemin === "/avec-garde" ? HTML_GARDEE : HTML_ORDINAIRE);
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const adresse = serveur.address();
  base = `http://127.0.0.1:${typeof adresse === "object" && adresse ? adresse.port : 0}`;

  profil = mkdtempSync(join(tmpdir(), "tare-guard-e2e-"));
  ctx = await chromium.launchPersistentContext(profil, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  ctx.on("console", (m) => {
    if (m.type() === "error") erreurs.push(`${m.worker() ? "worker" : "page"} ${m.text()}`);
  });
  ctx.on("weberror", (e) => erreurs.push(`weberror ${e.error().message}`));
  await ctx.addInitScript(PORTEFEUILLE);
  idExtension = new URL((await travailleur()).url()).host;
});

test.afterAll(async () => {
  await ctx?.close();
  serveur?.close();
  // Le profil pese quelques dizaines de Mo : il ne survit pas au test.
  if (profil) rmSync(profil, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ les tests */

test("1. le paquet se charge : worker demarre, chrome.action present, aucune erreur", async () => {
  const sw = await travailleur();
  expect(sw.url()).toBe(`chrome-extension://${idExtension}/worker.js`);
  expect(await sw.evaluate(() => typeof chrome.action)).toBe("object");
  expect(await sw.evaluate(() => chrome.runtime.getManifest().version)).toBe(
    JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version,
  );

  // Ce que chrome://extensions afficherait en rouge : erreurs du manifeste et d'execution.
  const p = await ctx.newPage();
  await p.goto("chrome://extensions/");
  const info = await p.evaluate(
    (id) =>
      new Promise<{ manifestErrors?: unknown[]; runtimeErrors?: unknown[]; installWarnings?: unknown[] } | null>((res) => {
        const dp = (chrome as unknown as { developerPrivate?: { getExtensionInfo: (id: string, cb: (x: never) => void) => void } }).developerPrivate;
        if (!dp) return res(null);
        dp.getExtensionInfo(id, res);
      }),
    idExtension,
  );
  await p.close();
  expect(info, "chrome.developerPrivate indisponible sur chrome://extensions").not.toBeNull();
  expect(info!.manifestErrors ?? []).toEqual([]);
  expect(info!.runtimeErrors ?? []).toEqual([]);
  expect(info!.installWarnings ?? []).toEqual([]);
  expect(erreurs).toEqual([]);
});

test("2. site ordinaire : seul eth_sendTransaction est arrete, la table rend un verdict, la pastille suit", async () => {
  const { page, console: lignes } = await nouvellePage("/ordinaire");
  const autre = await nouvellePage("/ordinaire#/autre-onglet");
  const id = await onglet(page);
  const idAutre = await onglet(autre.page);
  await page.bringToFront();

  expect(await page.evaluate(() => (window as unknown as { ethereum: Record<string, unknown> }).ethereum["__tareGuardWrapped"])).toBe(true);
  expect(await pastille(id)).toMatchObject({ texte: "", titre: TITRE_REPOS });

  // tout ce qui n'est pas une transaction passe sans detour, et n'allume rien
  await page.evaluate(async () => {
    const e = (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum;
    for (const method of ["eth_accounts", "eth_chainId", "personal_sign", "wallet_switchEthereumChain", "eth_signTypedData_v4"])
      await e.request({ method, params: [] });
  });
  expect((await portefeuille(page)).appels).toEqual(["eth_accounts", "eth_chainId", "personal_sign", "wallet_switchEthereumChain", "eth_signTypedData_v4"]);
  expect((await pastille(id)).texte).toBe("");

  // un vrai swap du corpus : la table du paquet est lue, le verdict est rendu, la fenetre s'ouvre
  const envoi = envoyerDepuisLaPage(page, { to: CAPTURE.to, data: CAPTURE.input });
  const fenetre = page.locator("[data-tare-guard] .card");
  await expect(fenetre).toBeVisible();
  await expect(fenetre.locator(".tag")).toHaveText("block");
  await expect(fenetre).toContainText("0xb429d62f");
  await expect.poll(async () => (await pastille(id)).texte).toBe("?");
  const allumee = await pastille(id);
  expect(allumee.couleur).toEqual(ORANGE);
  expect(allumee.titre).toContain("swap intercepted by the extension");
  expect(allumee.titre).toContain("hook 0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
  expect(allumee.titre).toContain("unknown, not zero");
  expect(allumee.titre).toMatch(/the same hook took [\d.]+ bps elsewhere/);
  // l'autre onglet ne s'allume pas
  expect((await pastille(idAutre)).texte).toBe("");

  await fenetre.getByRole("button", { name: "Annuler" }).click();
  expect(await envoi).toEqual({ code: 4001 });
  expect((await portefeuille(page)).envois).toEqual([]);
  await expect.poll(async () => (await pastille(id)).texte).toBe("NO");
  expect((await pastille(id)).titre).toContain("Decided by you, in the TARE Guard window.");
  expect(lignes.some((l) => /^\[TARE Guard\] block 0xb429d62f/.test(l))).toBe(true);

  // rechargement : c'est le navigateur qui efface les valeurs par onglet
  await page.reload();
  await expect.poll(async () => (await pastille(id)).texte).toBe("");
  expect((await pastille(id)).titre).toBe(TITRE_REPOS);
  await autre.page.close();
  await page.close();
  expect(erreurs).toEqual([]);
});

test("3. site ordinaire, verdict ok : la transaction part sans question et la pastille dit SENT ; une autre route l'efface", async () => {
  const { page } = await nouvellePage("/avec-garde"); // seulement pour recuperer le calldata de la demonstration
  const data = await page.waitForFunction(() => (window as unknown as { __DATA_DEMO?: string }).__DATA_DEMO).then((h) => h.jsonValue() as Promise<string>);
  await page.close();

  const ordinaire = await nouvellePage("/ordinaire#/swap");
  const id = await onglet(ordinaire.page);
  expect(await envoyerDepuisLaPage(ordinaire.page, { to: ROUTEUR, data })).toEqual({ hash: "0x" + "ab".repeat(32) });
  expect(await ordinaire.page.locator("[data-tare-guard]").count()).toBe(0);
  expect((await portefeuille(ordinaire.page)).envois).toHaveLength(1);
  await expect.poll(async () => (await pastille(id)).texte).toBe("SENT");
  expect((await pastille(id)).titre).toContain(`handed to the wallet — hook ${HOOK_DEMO} takes 4.0933 bps (MEASURED, block 50614000). Verdict: ok.`);

  // meme route, autre requete : on garde ; autre route : repos
  await ordinaire.page.evaluate(() => (location.hash = "#/swap?montant=2"));
  await ordinaire.page.waitForTimeout(300);
  expect((await pastille(id)).texte).toBe("SENT");
  await ordinaire.page.evaluate(() => (location.hash = "#/ailleurs"));
  await expect.poll(async () => (await pastille(id)).texte).toBe("");
  expect((await pastille(id)).titre).toBe(TITRE_REPOS);
  await ordinaire.page.close();
  expect(erreurs).toEqual([]);
});

test("4. page qui porte SA garde (motif de #/demo) : la page demande, l'extension observe, la pastille s'allume au clic", async () => {
  const { page, console: lignes } = await nouvellePage("/avec-garde#/demo");
  const id = await onglet(page);
  await expect(page.locator("#swap")).toBeEnabled({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { ethereum: Record<string, unknown> }).ethereum["__tareGuardWrapped"])).toBe(true);
  expect((await pastille(id)).texte).toBe("");

  // LE CLIC : la garde de la page intercepte et demande
  await page.locator("#swap").click();
  await expect(page.locator("#choix")).toBeVisible();
  await expect(page.locator("#rapport")).toHaveText("ok 4.0933");
  await expect.poll(async () => (await pastille(id)).texte).toBe("4.1");
  const allumee = await pastille(id);
  expect(allumee.couleur).toEqual(ORANGE);
  expect(allumee.titre).toContain("swap intercepted by the page's own TARE guard");
  expect(allumee.titre).toContain(`hook ${HOOK_DEMO} takes 4.0933 bps (MEASURED, block 50614000)`);
  // ... et l'extension n'a rien ouvert, rien consulte, rien laisse partir
  expect(await page.locator("[data-tare-guard]").count()).toBe(0);
  expect((await portefeuille(page)).envois).toEqual([]);
  expect(lignes.filter((l) => /^\[TARE Guard\] (ok|warn|block) /.test(l))).toEqual([]);

  // « send as is » : UNE transaction au portefeuille, l'extension l'observe sans reconsulter
  await page.locator("#passer").click();
  await expect(page.locator("#issue")).toHaveText(/^sent 0x/);
  expect((await portefeuille(page)).envois).toHaveLength(1);
  expect(await page.locator("[data-tare-guard]").count()).toBe(0);
  expect(lignes).toContain("[TARE Guard] transaction deja examinee par la garde de la page : observee, pas re-interceptee");
  expect(lignes.filter((l) => /^\[TARE Guard\] (ok|warn|block) /.test(l))).toEqual([]);
  await expect.poll(async () => (await pastille(id)).texte).toBe("SENT");
  expect((await pastille(id)).titre).toContain("Decided by the device.");

  // second swap, refuse : 4001, rien ne part, « NO »
  await page.locator("#swap").click();
  await expect.poll(async () => (await pastille(id)).texte).toBe("4.1");
  await page.locator("#refuser").click();
  await expect(page.locator("#issue")).toHaveText("code 4001");
  expect((await portefeuille(page)).envois).toHaveLength(1);
  await expect.poll(async () => (await pastille(id)).texte).toBe("NO");

  // la page change de route : repos
  await page.evaluate(() => (location.hash = "#/"));
  await expect.poll(async () => (await pastille(id)).texte).toBe("");
  await page.close();
  expect(erreurs).toEqual([]);
});
