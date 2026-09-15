/**
 * L'INTERCEPTION COTE NAVIGATEUR — SANS LA TABLE.
 *
 * Ce fichier ne connait PAS les mesures. Il recoit un `consulter` et l'appelle. C'est ce qui
 * rend l'extension utilisable : `data/table.json` pese 21 Mo, et esbuild l'inline dans le
 * bundle. Un script de contenu qui l'embarque fait donc parser 21 Mo de source JS a V8 sur
 * CHAQUE page visitee, a document_start, avant tout le reste. Mesure : 21,9 Mo de bundle.
 *
 * La table vit donc dans le service worker de l'extension (extension/worker.src.ts), chargee
 * une seule fois par vie du worker, et le script de contenu lui pose la question par message.
 * Un dapp qui importe "@tare/guard/browser" garde l'ancien comportement — la table y est
 * embarquee, parce qu'un dapp la charge une fois et pas a chaque page.
 *
 * Le reste, inchange :
 *
 * Trois portes, parce qu'un portefeuille peut arriver par n'importe laquelle :
 *  1. window.ethereum deja pose quand notre script demarre ;
 *  2. window.ethereum pose APRES nous — d'ou le piege Object.defineProperty, qui garde le
 *     setter et enveloppe tout ce qu'on y ecrit (patron Magnee) ;
 *  3. EIP-6963, ou chaque portefeuille s'annonce par evenement : on ecoute les annonces, on
 *     enveloppe le provider annonce, et on en redemande une au demarrage.
 *
 * Ce qui est intercepte : eth_sendTransaction, et rien d'autre. eth_call, eth_accounts,
 * personal_sign, wallet_switchEthereumChain passent sans etre touches. Une garde qui se met en
 * travers de tout finit desinstallee.
 *
 * Ce qui se passe en cas de pepin : la garde ne mange jamais la transaction. Si tareGuard leve
 * (elle ne devrait pas), on laisse passer et on l'ecrit dans la console — bloquer par accident
 * un utilisateur qui n'a rien demande est un plus gros defaut que rater une alerte.
 *
 * DEUX GARDES PEUVENT S'EMPILER, et ce fichier le sait depuis le 15 septembre 2026. La page de
 * demonstration pose SA copie de ce fichier sur une coquille qui delegue au portefeuille ;
 * l'extension pose la sienne sur le portefeuille lui-meme. Chaque garde emet donc ses etapes
 * sur la fenetre (EVENEMENT_ETAPE), et note ce qu'elle a laisse partir (le registre des
 * transactions examinees) pour que la garde du dessous ne pose pas la meme question une
 * seconde fois. Les deux sont decrits plus bas, avec la mesure qui les a motives.
 */
import { gate, type ApprovalDecision, type Approver } from "./approver.js";
import type { Finding, GuardOptions, GuardReport, TxRequest, Verdict } from "./types.js";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?: (event: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...a: unknown[]) => void) => void;
  [k: string]: unknown;
}

export class UserRejectedByGuard extends Error {
  /** le code EIP-1193 que les dapps savent deja traiter */
  readonly code = 4001;
  readonly report: GuardReport;
  readonly decision: ApprovalDecision;
  constructor(report: GuardReport, decision: ApprovalDecision) {
    super(`TARE Guard : transaction annulee (${decision.reason})`);
    this.name = "UserRejectedByGuard";
    this.report = report;
    this.decision = decision;
  }
}

export interface OptionsInjection extends GuardOptions {
  /**
   * CE QUI REND UN VERDICT. Obligatoire ici : ce fichier n'a pas de table et ne peut pas en
   * fabriquer une. L'extension passe un aller-retour vers son service worker ; le chemin
   * dapp de browser.ts passe `tareGuard` directement.
   *
   * Si elle rejette, la transaction PASSE et l'erreur est ecrite en console : bloquer par
   * accident un utilisateur qui n'a rien demande est un plus gros defaut que rater une alerte.
   */
  consulter: (tx: TxRequest) => Promise<GuardReport>;
  /** qui approuve ; par defaut la fenetre modale de ce fichier */
  approver?: Approver;
  /** verdicts qui declenchent la question (defaut warn + block) */
  askOn?: ("ok" | "warn" | "block")[];
  /** appele a chaque interception, avant la question */
  onReport?: (report: GuardReport, tx: TxRequest) => void;
  /**
   * appele quand une transaction arrive DEJA examinee par une garde TARE posee au-dessus de
   * celle-ci : elle part sans seconde consultation ni seconde question. Voir le registre plus bas.
   */
  onObserve?: (tx: TxRequest) => void;
  /** le nom porte par les etapes emises : "extension" pour l'extension, "page" par defaut */
  nom?: string;
  /** pour les tests : la fenetre a instrumenter, et celle ou les etapes sont emises */
  target?: Record<string, unknown>;
}

const MARK = "__tareGuardWrapped";

/* ------------------------------------------ le signal, et la garde du dessus */

/**
 * CE QU'UNE GARDE DIT A LA FENETRE, a chaque etape d'une interception.
 *
 * Un `CustomEvent`, nomme a la maniere des annonces EIP-6963. Il existe a cause d'une mesure
 * faite le 15 septembre 2026 sur https://tare-hooks.tech/#/demo, extension chargee :
 *
 *   - la page pose SA garde (ce fichier, via apps/web/src/demo/interception.ts) sur une
 *     COQUILLE neuve qui delegue au portefeuille. La marque MARK que l'extension pose sur le
 *     portefeuille ne l'en empeche donc pas : les deux routes et les trois choix s'affichaient
 *     49 ms apres le clic, et aucune fenetre de l'extension ne s'ouvrait ;
 *   - mais l'extension ne voyait RIEN au clic — la transaction ne touche le portefeuille
 *     qu'apres la decision de la page — et elle la re-consultait ensuite, en seconde garde.
 *
 * Ce signal donne a l'extension ce qu'elle ne pouvait pas voir : elle ecoute les etapes de
 * TOUTE garde TARE de la fenetre, la sienne comme celle du site, et les montre sur son icone.
 *
 * Il ne porte que des primitives, parce qu'il traverse ensuite un postMessage vers le monde
 * ISOLATED de l'extension. Et il n'engage personne : un signal qui leve ne bloque pas un swap.
 */
export const EVENEMENT_ETAPE = "tare-guard:etape";

/** interceptee : la garde a lu la transaction · refusee : rien n'est parti · transmise : au portefeuille */
export type NomEtape = "interceptee" | "refusee" | "transmise";

export interface EtapeGarde {
  /** la version du format : un lecteur qui ne la connait pas ignore l'etape */
  v: 1;
  etape: NomEtape;
  /** qui l'emet : `OptionsInjection.nom`, "page" par defaut */
  garde: string;
  verdict: Verdict;
  /** le saut qui porte le verdict (voir constatPrincipal) ; null quand le swap n'a pas de hook */
  hook: string | null;
  /** null des que l'etiquette ne porte pas de nombre — jamais un zero par defaut */
  bps: number | null;
  /**
   * quand `bps` est null : le pire que CE hook a pris ailleurs (autre pool, autre taille), tel
   * que la garde le cite. Un faisceau, jamais la mesure de ce swap — d'ou un champ a part.
   */
  ailleurs: number | null;
  etiquette: string | null;
  /** le bloc de la mesure citee */
  bloc: number | null;
  /** la phrase que la garde montrerait */
  titre: string;
  /** `refusee` et `transmise` : qui a tranche, et pourquoi */
  par: string | null;
  raison: string | null;
}

const ADRESSE_NULLE = "0x0000000000000000000000000000000000000000";
const GRAVITE: Record<Verdict, number> = { ok: 0, warn: 1, block: 2 };

/**
 * Le saut qui porte le verdict : un saut AVEC hook avant un saut sans, puis le plus grave, puis
 * celui qui prend le plus. C'est lui que l'icone nomme — un chemin a deux sauts ne tient pas
 * dans quatre caracteres, et le pire est celui qu'on doit voir.
 */
export function constatPrincipal(r: GuardReport): Finding | null {
  const cle = (f: Finding): [number, number, number] => [
    f.hook === ADRESSE_NULLE ? 0 : 1,
    GRAVITE[f.verdict],
    f.bps ?? -1,
  ];
  let meilleur: Finding | null = null;
  // Defensif : dans l'extension, le rapport a traverse un postMessage que la page peut imiter.
  for (const f of Array.isArray(r?.findings) ? r.findings : []) {
    if (meilleur === null) {
      meilleur = f;
      continue;
    }
    const [a, b] = [cle(f), cle(meilleur)];
    if (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]) meilleur = f;
  }
  return meilleur;
}

function etapeDe(etape: NomEtape, r: GuardReport, garde: string, d?: ApprovalDecision): EtapeGarde {
  const f = constatPrincipal(r);
  // Le meme faisceau que la phrase de la garde (guard-sans-table.ts, sentenceFor) : la pire
  // citation chiffree, sinon la pire mesure du hook.
  const faisceau =
    f && f.bps === null
      ? (Array.isArray(f.citations) ? f.citations : [])
          .map((c) => c.bps)
          .filter((b): b is number => typeof b === "number")
          .sort((a, b) => b - a)[0] ?? f.hookContext?.measured?.worst?.bps ?? null
      : null;
  return {
    v: 1,
    etape,
    garde,
    verdict: r.verdict,
    hook: f && f.hook !== ADRESSE_NULLE ? f.hook : null,
    bps: f?.bps ?? null,
    ailleurs: faisceau,
    etiquette: f?.label ?? null,
    bloc: f?.citations?.[0]?.blockNumber ?? r.table?.blockNumber ?? null,
    titre: r.headline,
    par: d?.by ?? null,
    raison: d?.reason ?? null,
  };
}

/** L'etape est CONSTRUITE dans le `try` : un rapport mal forme ne fait pas echouer l'envoi. */
function emettre(fenetre: unknown, construire: () => EtapeGarde): void {
  const cible = fenetre as { dispatchEvent?: (e: Event) => boolean } | null;
  if (!cible || typeof cible.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
  try {
    cible.dispatchEvent(new CustomEvent(EVENEMENT_ETAPE, { detail: construire() }));
  } catch {
    /* un signal qui echoue ne bloque pas un swap */
  }
}

/**
 * LES TRANSACTIONS DEJA EXAMINEES, communes a toutes les gardes de la fenetre.
 *
 * Sur la page de demonstration, la garde du site (sur la coquille) est AU-DESSUS de celle de
 * l'extension (sur le portefeuille). Sans ce registre, une transaction approuvee en haut etait
 * re-consultee en bas — mesure faite : les deux transactions de la demonstration repassaient
 * par le service worker de l'extension apres la decision de la page. Leur verdict etant `ok`,
 * rien ne s'ouvrait ; un verdict `warn` ou `block` y aurait ouvert une SECONDE fenetre,
 * par-dessus l'ecran du site : la meme question, posee deux fois, par deux interfaces.
 *
 * `Symbol.for` et non un symbole de module : la page et l'extension sont deux bundles, donc
 * deux copies de ce fichier. Le registre global des symboles est la seule chose qu'elles
 * partagent a coup sur dans le monde de la page.
 *
 * On note des OBJETS — l'appel `{ method, params }` et la transaction elle-meme — parce qu'une
 * couche du milieu reconstruit parfois l'un et transmet l'autre tel quel.
 *
 * ET LA NOTE NE VIT QUE LE TEMPS DE L'APPEL SYNCHRONE a la couche du dessous. Une premiere
 * version la laissait en place, et les tests l'ont attrapee : un dapp qui renvoie le MEME objet
 * transaction — apres un refus dans MetaMask, par exemple — passait la seconde fois sans
 * examen, et un `block` deja accepte une fois ne se redemandait plus. La note est donc posee
 * juste avant `original(args)` et retiree juste apres son retour synchrone. La coquille de la
 * page (apps/web/src/demo/interception.ts) appelle le portefeuille dans ce meme elan ; une
 * couche qui l'appellerait apres un `await` ne verrait pas la note, et la garde du dessous
 * examinerait une seconde fois — le comportement d'avant, jamais un laissez-passer.
 *
 * Ce que ca ne ferme pas, et c'est le modele de menace deja ecrit dans extension/protocole.ts :
 * le monde MAIN est celui de la page. Une page hostile peut noter ses transactions comme
 * examinees, exactement comme elle peut deja fabriquer un verdict favorable. La garde met un
 * chiffre mesure devant quelqu'un qui signe de bonne foi ; elle ne protege pas contre le site.
 */
const CLE_EXAMINEES = Symbol.for("tare-guard/examinees");

function examinees(): WeakSet<object> | null {
  const g = globalThis as unknown as Record<symbol, unknown>;
  const deja = g[CLE_EXAMINEES];
  if (deja instanceof WeakSet) return deja as WeakSet<object>;
  if (deja !== undefined) return null; // quelqu'un a pris la cle : pas de registre, chaque garde decide seule
  const neuf = new WeakSet<object>();
  try {
    Object.defineProperty(g, CLE_EXAMINEES, { value: neuf, configurable: false, enumerable: false, writable: false });
    return neuf;
  } catch {
    return null;
  }
}

/** Transmet l'appel a la couche du dessous en le notant examine, et seulement pendant ce temps. */
function transmettreExaminee(
  original: (a: { method: string; params?: unknown[] | object }) => Promise<unknown>,
  args: { method: string; params?: unknown[] | object },
  tx: object,
): Promise<unknown> {
  const r = examinees();
  r?.add(args);
  r?.add(tx);
  try {
    return original(args);
  } finally {
    r?.delete(args);
    r?.delete(tx);
  }
}

/** Vrai si une garde du dessus est en train de transmettre cet appel ; la note est retiree au passage. */
function consommerExamen(args: object, tx: object): boolean {
  const r = examinees();
  if (!r || !(r.has(args) || r.has(tx))) return false;
  r.delete(args);
  r.delete(tx);
  return true;
}

/* --------------------------------------------------------------- fenetre modale */

const CSS = `
:host { all: initial; }
.wrap { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
  justify-content: center; background: rgba(8,10,14,.72); backdrop-filter: blur(3px);
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.card { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto;
  background: #12151c; color: #e8eaf0; border: 1px solid #2a3040; border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,.55); padding: 20px 22px; }
.tag { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px; border: 1px solid currentColor; }
.tag.block { color: #ff6b6b; } .tag.warn { color: #ffbf47; } .tag.ok { color: #5ad19b; }
h1 { font-size: 17px; margin: 12px 0 4px; font-weight: 600; letter-spacing: -.01em; }
.sub { color: #98a0b3; font-size: 12.5px; margin: 0 0 14px; }
.finding { border-top: 1px solid #232838; padding: 12px 0; }
.finding p { margin: 0 0 6px; }
.meta { font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #8b93a7;
  word-break: break-all; }
.label { font: 11px ui-monospace, monospace; color: #c6cbd8; border: 1px solid #2f3648;
  border-radius: 4px; padding: 1px 5px; }
.replay { display: block; margin-top: 6px; background: #0c0e13; border: 1px solid #232838;
  border-radius: 6px; padding: 7px 9px; font: 11px/1.45 ui-monospace, monospace; color: #7fb5ff;
  white-space: pre-wrap; word-break: break-all; }
.foot { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
button { font: inherit; font-weight: 550; padding: 9px 16px; border-radius: 9px; cursor: pointer;
  border: 1px solid #2f3648; background: #1b1f2a; color: #e8eaf0; }
button.go { background: #b3402f; border-color: #d2513d; color: #fff; }
button:focus-visible { outline: 2px solid #7fb5ff; outline-offset: 2px; }
.warn-line { color: #ffbf47; font-size: 12px; margin-top: 8px; }
`;

const VERDICT_TITLE: Record<string, string> = {
  block: "TARE : ce hook prend beaucoup",
  warn: "TARE : je ne peux pas te le garantir",
  ok: "TARE : rien a signaler",
};

/** La fenetre modale, dans un shadow DOM ferme pour que le CSS de la page ne la deforme pas. */
export function showOverlay(report: GuardReport, doc: Document = document): Promise<boolean> {
  return new Promise((resolve) => {
    const host = doc.createElement("div");
    host.setAttribute("data-tare-guard", "");
    const root = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = doc.createElement("div");
    wrap.className = "wrap";
    const card = doc.createElement("div");
    card.className = "card";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");

    const tag = doc.createElement("span");
    tag.className = `tag ${report.verdict}`;
    tag.textContent = report.verdict;
    card.appendChild(tag);

    const h = doc.createElement("h1");
    h.textContent = VERDICT_TITLE[report.verdict] ?? "TARE";
    card.appendChild(h);

    const sub = doc.createElement("p");
    sub.className = "sub";
    sub.textContent = report.headline;
    card.appendChild(sub);

    for (const f of report.findings) {
      const d = doc.createElement("div");
      d.className = "finding";
      const p = doc.createElement("p");
      p.textContent = f.sentence;
      d.appendChild(p);

      const m = doc.createElement("div");
      m.className = "meta";
      const lab = doc.createElement("span");
      lab.className = "label";
      lab.textContent = f.label;
      m.appendChild(lab);
      m.append(
        ` hook ${f.hook} · pool ${f.leg.poolId.slice(0, 18)}… · sens ${f.leg.direction}` +
          ` · taille ${f.leg.amountIn ?? "inconnue"}${f.reason ? ` · ${f.reason}` : ""}`,
      );
      d.appendChild(m);

      if (f.replay) {
        const r = doc.createElement("code");
        r.className = "replay";
        r.textContent = f.replay;
        d.appendChild(r);
      }
      card.appendChild(d);
    }

    const foot0 = doc.createElement("div");
    foot0.className = "meta";
    foot0.style.marginTop = "12px";
    foot0.textContent =
      `Table TARE : ${report.table.nMeasurements} mesures, ${report.table.nHooks} hooks, ` +
      `${report.table.nPools} pools, bloc ${report.table.blockNumber}, ${report.table.engineVer ?? "?"}.`;
    card.appendChild(foot0);

    for (const w of report.warnings) {
      const wl = doc.createElement("div");
      wl.className = "warn-line";
      wl.textContent = `! ${w}`;
      card.appendChild(wl);
    }

    const foot = doc.createElement("div");
    foot.className = "foot";
    const no = doc.createElement("button");
    no.textContent = "Annuler";
    const yes = doc.createElement("button");
    yes.className = "go";
    yes.textContent = "Continuer quand meme";
    foot.append(no, yes);
    card.appendChild(foot);
    wrap.appendChild(card);
    root.appendChild(wrap);
    doc.documentElement.appendChild(host);

    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      host.remove();
      doc.removeEventListener("keydown", onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    no.addEventListener("click", () => finish(false));
    yes.addEventListener("click", () => finish(true));
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) finish(false);
    });
    doc.addEventListener("keydown", onKey, true);
    no.focus();
  });
}

/** L'approbateur du navigateur : la fenetre modale ci-dessus. */
export const overlayApprover: Approver = {
  name: "overlay",
  async approve(report) {
    const ok = await showOverlay(report);
    return {
      approved: ok,
      by: "overlay",
      reason: ok ? "humain_a_confirme" : "humain_a_refuse",
      attestation: null,
    };
  },
};

/* ------------------------------------------------------------ enveloppe provider */

function firstTx(params: unknown): TxRequest | null {
  if (Array.isArray(params) && params.length > 0 && params[0] && typeof params[0] === "object") {
    return params[0] as TxRequest;
  }
  return null;
}

/**
 * Enveloppe un provider EIP-1193. Idempotent : re-enveloppe pas ce qui l'est deja, sinon
 * chaque annonce EIP-6963 empilerait une couche de plus et ouvrirait N fenetres.
 */
export function envelopperProvider(provider: Eip1193Provider, opts: OptionsInjection): Eip1193Provider {
  if (!provider || typeof provider.request !== "function") return provider;
  if ((provider as Record<string, unknown>)[MARK]) return provider;

  const approver = opts.approver ?? overlayApprover;
  const original = provider.request.bind(provider);
  const nom = opts.nom ?? "page";
  const fenetre = opts.target ?? globalThis;

  const guarded = async (args: { method: string; params?: unknown[] | object }): Promise<unknown> => {
    if (!args || args.method !== "eth_sendTransaction") return original(args);
    const tx = firstTx(args.params);
    if (!tx) return original(args);

    // Une garde TARE posee AU-DESSUS a deja lu, demande et laisse partir cette transaction :
    // on ne repose pas la question. Voir le registre des transactions examinees.
    if (consommerExamen(args, tx)) {
      try {
        opts.onObserve?.(tx);
      } catch {
        /* un journal casse ne bloque pas un swap */
      }
      return original(args);
    }

    let report: GuardReport;
    try {
      report = await opts.consulter(tx);
    } catch (e) {
      // On ne mange pas la transaction d'un utilisateur parce que notre garde a un bug.
      // Et on ne la note pas comme examinee : une garde du dessous a le droit d'essayer.
      console.error("[TARE Guard] analyse impossible, la transaction passe :", e);
      return original(args);
    }
    emettre(fenetre, () => etapeDe("interceptee", report, nom));
    try {
      opts.onReport?.(report, tx);
    } catch {
      /* un journal casse ne bloque pas un swap */
    }

    const askOn = opts.askOn ?? ["warn", "block"];
    const decision = await gate(report, approver, { askOn });
    if (!decision.approved) {
      emettre(fenetre, () => etapeDe("refusee", report, nom, decision));
      throw new UserRejectedByGuard(report, decision);
    }
    emettre(fenetre, () => etapeDe("transmise", report, nom, decision));
    // EXAMINEE veut dire « quelqu'un a ete INTERROGE et a dit oui ». Une garde qui laisse passer
    // sans demander — verdict hors de son askOn, un dapp en mode journal — ne doit pas faire taire
    // la garde du dessous : l'utilisateur de l'extension a demande qu'on l'arrete sur warn et block.
    return askOn.includes(report.verdict) ? transmettreExaminee(original, args, tx) : original(args);
  };

  try {
    Object.defineProperty(provider, "request", { value: guarded, configurable: true, writable: true });
    Object.defineProperty(provider, MARK, { value: true, configurable: true, enumerable: false });
  } catch {
    // provider gele : on ne peut rien faire, on le dit plutot que de faire semblant
    console.warn("[TARE Guard] provider non modifiable, aucune garde posee dessus");
    return provider;
  }
  return provider;
}

/* --------------------------------------------------------------- installation */

export interface Installation {
  /** les providers effectivement enveloppes */
  wrapped: Eip1193Provider[];
  /** retire les ecouteurs ; les enveloppes deja posees restent */
  uninstall(): void;
}

/**
 * Pose la garde sur les trois portes. A appeler le plus tot possible (document_start).
 */
export function installerInjection(opts: OptionsInjection): Installation {
  const w = (opts.target ?? (globalThis as unknown as Record<string, unknown>)) as Record<string, unknown>;
  const wrapped: Eip1193Provider[] = [];

  const take = (p: unknown): unknown => {
    if (!p || typeof p !== "object") return p;
    const prov = p as Eip1193Provider;
    if (typeof prov.request !== "function") return p;
    const before = Boolean((prov as Record<string, unknown>)[MARK]);
    envelopperProvider(prov, opts);
    if (!before && (prov as Record<string, unknown>)[MARK]) wrapped.push(prov);
    // certains portefeuilles exposent une grappe : window.ethereum.providers[]
    const list = (prov as Record<string, unknown>)["providers"];
    if (Array.isArray(list)) for (const sub of list) take(sub);
    return p;
  };

  // porte 1 : deja pose
  let current = w["ethereum"];
  if (current) take(current);

  // porte 2 : pose apres nous. On garde le setter pour ne casser aucun portefeuille.
  try {
    const own = Object.getOwnPropertyDescriptor(w, "ethereum");
    if (!own || own.configurable) {
      Object.defineProperty(w, "ethereum", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(v: unknown) {
          current = take(v);
        },
      });
    } else {
      console.warn("[TARE Guard] window.ethereum non reconfigurable : porte 2 fermee");
    }
  } catch (e) {
    console.warn("[TARE Guard] piege defineProperty impossible :", e);
  }

  // porte 3 : EIP-6963
  const onAnnounce = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { provider?: unknown } | undefined;
    if (detail?.provider) take(detail.provider);
  };
  const et = w as unknown as EventTarget & { dispatchEvent?: (e: Event) => boolean };
  let listening = false;
  if (typeof et.addEventListener === "function") {
    et.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    listening = true;
    try {
      et.dispatchEvent?.(new Event("eip6963:requestProvider"));
    } catch {
      /* pas d'Event dans cet environnement : les annonces spontanees suffiront */
    }
  }

  return {
    wrapped,
    uninstall() {
      if (listening && typeof et.removeEventListener === "function") {
        et.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      }
    },
  };
}
