/**
 * DEUX GARDES EMPILEES — celle d'un site et celle de l'extension, sans navigateur.
 *
 * LE FAIT DE DEPART, mesure le 15 septembre 2026 sur https://tare-hooks.tech/#/demo avec
 * l'extension chargee et un faux portefeuille :
 *
 *   - la page pose SA garde (src/injection.ts, telle quelle) sur une COQUILLE neuve qui delegue
 *     au portefeuille — apps/web/src/demo/interception.ts. La marque de l'extension, posee sur
 *     le portefeuille, ne l'en empeche donc pas : les deux routes et les trois choix
 *     s'affichaient 49 ms apres le clic, sans fenetre de l'extension, et rien n'etait parti ;
 *   - mais l'extension ne voyait rien au clic, et elle re-consultait la transaction APRES la
 *     decision de la page. Verdict `ok` sur les deux transactions de la demonstration, donc rien
 *     ne s'ouvrait ; un `warn` ou un `block` y aurait ouvert une seconde fenetre.
 *
 * Ces tests tiennent la reponse : la garde du dessus emet ses etapes et note ce qu'elle laisse
 * partir ; la garde du dessous observe sans reposer la question — et SEULEMENT dans ce cas.
 * Chaque cas ou elle doit, au contraire, examiner une seconde fois est teste aussi : un
 * laissez-passer accorde par erreur est pire qu'une question posee deux fois.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  envelopperProvider,
  constatPrincipal,
  EVENEMENT_ETAPE,
  UserRejectedByGuard,
  type EtapeGarde,
  type Eip1193Provider,
  type OptionsInjection,
} from "../src/injection.js";
import { tareGuard, UNIVERSAL_ROUTER_BASE } from "../src/guard.js";
import { encodeUniversalRouterExactInSingle } from "../src/encode.js";
import type { ApprovalDecision, Approver } from "../src/approver.js";
import type { Finding, GuardReport, TxRequest } from "../src/types.js";
import { WORST_POOL } from "./helpers.js";

/** La porte de la demonstration : ETH -> USDC, hook 0xf4c3…0044, 4,0933 bps mesures a 1e12 wei. */
const HOOK_DEMO = "0xf4c3801c3eb091fe70a6375a3569ad8a1ac20044";
const DATA_DEMO = encodeUniversalRouterExactInSingle([
  {
    poolKey: {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      fee: 500,
      tickSpacing: 10,
      hooks: HOOK_DEMO,
    },
    zeroForOne: true,
    amountIn: 10n ** 12n,
  },
]);
const COMPTE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const txDemo = (): TxRequest => ({ from: COMPTE, to: UNIVERSAL_ROUTER_BASE, data: DATA_DEMO, value: "0xe8d4a51000" });

function portefeuille() {
  const appels: string[] = [];
  const envois: unknown[] = [];
  const p: Eip1193Provider = {
    async request(a) {
      appels.push(a.method);
      if (a.method === "eth_sendTransaction") {
        envois.push(a.params);
        return "0x" + "11".repeat(32);
      }
      return null;
    },
  };
  return { p, appels, envois };
}

/** Une fenetre ou les etapes s'entendent. */
function fenetre() {
  const cible = new EventTarget();
  const etapes: EtapeGarde[] = [];
  cible.addEventListener(EVENEMENT_ETAPE, (e) => etapes.push((e as CustomEvent<EtapeGarde>).detail));
  return { cible: cible as unknown as Record<string, unknown>, etapes };
}

/** La garde de l'extension, posee sur le portefeuille, comme extension/inject.src.ts. */
function gardeExtension(
  wallet: Eip1193Provider,
  f: Record<string, unknown>,
  envelopper: typeof envelopperProvider = envelopperProvider,
) {
  const consultations: TxRequest[] = [];
  const observees: TxRequest[] = [];
  const questions: GuardReport[] = [];
  envelopper(wallet, {
    nom: "extension",
    target: f,
    askOn: ["warn", "block"],
    consulter: async (tx) => {
      consultations.push(tx);
      return tareGuard(tx);
    },
    approver: {
      name: "overlay",
      async approve(r) {
        questions.push(r);
        return { approved: false, by: "overlay", reason: "humain_a_refuse" };
      },
    },
    onObserve: (tx) => observees.push(tx),
  });
  return { consultations, observees, questions };
}

/**
 * La garde du site, dans le MOTIF de apps/web/src/demo/interception.ts : une coquille neuve qui
 * delegue au portefeuille, enveloppee, `askOn` sur les trois verdicts, un approbateur a soi.
 */
function gardePage(
  wallet: Eip1193Provider,
  f: Record<string, unknown>,
  approuver: (r: GuardReport) => Promise<ApprovalDecision>,
  extra: Partial<OptionsInjection> = {},
  envelopper: typeof envelopperProvider = envelopperProvider,
) {
  const compte: Eip1193Provider = { request: (a) => wallet.request(a) };
  const questions: GuardReport[] = [];
  const fournisseur = envelopper(compte, {
    target: f,
    askOn: ["ok", "warn", "block"],
    consulter: async (tx) => tareGuard(tx),
    approver: {
      name: "tare-demo",
      async approve(r) {
        questions.push(r);
        return approuver(r);
      },
    } satisfies Approver,
    ...extra,
  });
  return { fournisseur, compte, questions };
}

const passer = async (): Promise<ApprovalDecision> => ({ approved: true, by: "the device", reason: "approved on the device" });
const refuser = async (): Promise<ApprovalDecision> => ({ approved: false, by: "the page", reason: "refused on the page" });
const envoyer = (p: Eip1193Provider, args?: { method: string; params: unknown[] }) =>
  p.request(args ?? { method: "eth_sendTransaction", params: [txDemo()] });

describe("la garde de la page, AU-DESSUS de celle de l'extension", () => {
  it("la marque de l'extension sur le portefeuille n'empeche pas la page de poser sa garde", () => {
    const w = portefeuille();
    const f = fenetre();
    gardeExtension(w.p, f.cible);
    expect((w.p as Record<string, unknown>)["__tareGuardWrapped"]).toBe(true);
    const page = gardePage(w.p, f.cible, passer);
    // c'est la coquille qui porte la garde de la page, pas le portefeuille deja marque
    expect(page.fournisseur).toBe(page.compte);
    expect((page.fournisseur as Record<string, unknown>)["__tareGuardWrapped"]).toBe(true);
  });

  it("au clic, seule la page lit et demande ; l'extension ne voit rien, le portefeuille non plus", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    let trancher!: (d: ApprovalDecision) => void;
    const page = gardePage(w.p, f.cible, () => new Promise((r) => (trancher = r)));
    const envoi = envoyer(page.fournisseur);
    await vi.waitFor(() => expect(page.questions).toHaveLength(1));
    // la question est posee par la page : c'est l'instant ou la pastille doit s'allumer
    expect(f.etapes.map((e) => [e.etape, e.garde])).toEqual([["interceptee", "page"]]);
    expect(ext.consultations).toHaveLength(0);
    expect(w.envois).toHaveLength(0);
    trancher({ approved: false, by: "the page", reason: "refused on the page" });
    await expect(envoi).rejects.toBeInstanceOf(UserRejectedByGuard);
  });

  it("passer : une question, une transaction au portefeuille, et l'extension observe sans reconsulter", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    const page = gardePage(w.p, f.cible, passer);
    await expect(envoyer(page.fournisseur)).resolves.toBe("0x" + "11".repeat(32));
    expect(page.questions).toHaveLength(1);
    expect(ext.consultations).toHaveLength(0);
    expect(ext.questions).toHaveLength(0);
    expect(ext.observees).toHaveLength(1);
    expect(w.envois).toHaveLength(1);
    expect(f.etapes.map((e) => `${e.etape}:${e.garde}`)).toEqual(["interceptee:page", "transmise:page"]);
  });

  it("refuser : 4001, et ni le portefeuille ni l'extension ne voient la transaction", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    const page = gardePage(w.p, f.cible, refuser);
    const err = await envoyer(page.fournisseur).catch((e) => e as UserRejectedByGuard);
    expect(err).toBeInstanceOf(UserRejectedByGuard);
    expect((err as UserRejectedByGuard).code).toBe(4001);
    expect(w.envois).toHaveLength(0);
    expect(ext.consultations).toHaveLength(0);
    expect(f.etapes.map((e) => e.etape)).toEqual(["interceptee", "refusee"]);
  });

  it("substituer : le refus de l'origine puis le remplacement en second appel, une seule transaction part", async () => {
    // Le parcours « take the other gate » de la page : refus de l'origine (4001), puis un SECOND
    // appel, deja approuve sur l'appareil. L'extension ne doit reposer la question sur aucun des deux.
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    let n = 0;
    const page = gardePage(w.p, f.cible, async () => (++n === 1 ? refuser() : passer()));
    await expect(envoyer(page.fournisseur)).rejects.toBeInstanceOf(UserRejectedByGuard);
    await expect(envoyer(page.fournisseur)).resolves.toBeTypeOf("string");
    expect(w.envois).toHaveLength(1);
    expect(ext.consultations).toHaveLength(0);
    expect(f.etapes.map((e) => e.etape)).toEqual(["interceptee", "refusee", "interceptee", "transmise"]);
  });

  it("la page et l'extension sont DEUX copies du module : le registre passe quand meme", async () => {
    // Deux bundles dans le monde de la page, donc deux instances de injection.ts. Seul
    // Symbol.for les relie : on le verifie avec deux modules reellement distincts.
    vi.resetModules();
    const copieA = await import("../src/injection.js");
    vi.resetModules();
    const copieB = await import("../src/injection.js");
    expect(copieA.envelopperProvider).not.toBe(copieB.envelopperProvider);
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible, copieA.envelopperProvider);
    const page = gardePage(w.p, f.cible, passer, {}, copieB.envelopperProvider);
    await envoyer(page.fournisseur);
    expect(ext.consultations).toHaveLength(0);
    expect(ext.observees).toHaveLength(1);
    expect(w.envois).toHaveLength(1);
  });
});

describe("les cas ou l'extension DOIT examiner une seconde fois", () => {
  it("une page sans registre (ancienne version, autre garde) : l'extension consulte comme avant", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    // une garde maison qui a « approuve » mais ne connait pas le registre
    const ancienne: Eip1193Provider = { request: (a) => w.p.request(a) };
    await envoyer(ancienne);
    expect(ext.consultations).toHaveLength(1);
    expect(w.envois).toHaveLength(1); // verdict ok : rien a demander, la transaction part
    expect(f.etapes.map((e) => `${e.etape}:${e.garde}`)).toEqual(["interceptee:extension", "transmise:extension"]);
  });

  it("la note ne survit pas a l'appel : le MEME objet renvoye plus tard repasse par l'examen", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    const page = gardePage(w.p, f.cible, passer);
    const tx = txDemo();
    const args = { method: "eth_sendTransaction", params: [tx] };
    await envoyer(page.fournisseur, args);
    expect(ext.consultations).toHaveLength(0);
    // le dapp renvoie le meme appel, puis la meme transaction, DIRECTEMENT au portefeuille
    await envoyer(w.p, args);
    await envoyer(w.p, { method: "eth_sendTransaction", params: [tx] });
    expect(ext.consultations).toHaveLength(2);
  });

  it("l'extension SEULE : un block accepte une fois se redemande quand le dapp renvoie le meme objet", async () => {
    // Le defaut qu'une premiere version portait : la note restait posee apres l'envoi. Un dapp
    // qui renvoie la meme transaction (apres un refus dans MetaMask, par exemple) passait alors
    // la seconde fois sans question, sur un hook a 689,95 bps.
    const w = portefeuille();
    const questions: GuardReport[] = [];
    envelopperProvider(w.p, {
      nom: "extension",
      consulter: async (tx) => tareGuard(tx),
      approver: {
        name: "overlay",
        async approve(r) {
          questions.push(r);
          return { approved: true, by: "overlay", reason: "humain_a_confirme" };
        },
      },
    });
    const tx: TxRequest = {
      to: UNIVERSAL_ROUTER_BASE,
      data: encodeUniversalRouterExactInSingle([
        {
          poolKey: {
            currency0: WORST_POOL.currency0,
            currency1: WORST_POOL.currency1,
            fee: WORST_POOL.fee,
            tickSpacing: WORST_POOL.tickSpacing,
            hooks: WORST_POOL.hook,
          },
          zeroForOne: false,
          amountIn: 10n ** 14n,
        },
      ]),
    };
    const args = { method: "eth_sendTransaction", params: [tx] };
    await w.p.request(args);
    await w.p.request(args);
    await w.p.request({ method: "eth_sendTransaction", params: [tx] });
    expect(questions.map((r) => r.verdict)).toEqual(["block", "block", "block"]);
  });

  it("une garde du dessus qui laisse passer SANS demander ne fait pas taire l'extension", async () => {
    // un dapp en mode journal : askOn vide. Personne n'a ete interroge, donc rien n'est « examine ».
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    const page = gardePage(w.p, f.cible, passer, { askOn: [] });
    await envoyer(page.fournisseur);
    expect(page.questions).toHaveLength(0);
    expect(ext.consultations).toHaveLength(1);
  });

  it("une coquille qui appelle le portefeuille APRES un await perd la note : examen, pas laissez-passer", async () => {
    const w = portefeuille();
    const f = fenetre();
    const ext = gardeExtension(w.p, f.cible);
    const compteAsync: Eip1193Provider = {
      async request(a) {
        await Promise.resolve();
        return w.p.request(a);
      },
    };
    envelopperProvider(compteAsync, { target: f.cible, askOn: ["ok", "warn", "block"], consulter: async (tx) => tareGuard(tx), approver: { name: "t", approve: passer } });
    await envoyer(compteAsync);
    expect(ext.consultations).toHaveLength(1);
  });
});

describe("les etapes emises", () => {
  it("portent le hook, les bps, l'etiquette, le bloc et qui a tranche", async () => {
    const w = portefeuille();
    const f = fenetre();
    const page = gardePage(w.p, f.cible, passer);
    await envoyer(page.fournisseur);
    const [interceptee, transmise] = f.etapes;
    expect(interceptee).toMatchObject({
      v: 1,
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
    expect(transmise).toMatchObject({ etape: "transmise", par: "the device", raison: "approved on the device" });
    // des primitives seulement : l'etape doit traverser un postMessage
    expect(JSON.parse(JSON.stringify(interceptee))).toEqual(interceptee);
  });

  it("rien pour ce qui n'est pas eth_sendTransaction", async () => {
    const w = portefeuille();
    const f = fenetre();
    const page = gardePage(w.p, f.cible, passer);
    await page.fournisseur.request({ method: "eth_accounts" });
    await page.fournisseur.request({ method: "personal_sign", params: ["0xdead", COMPTE] });
    expect(f.etapes).toEqual([]);
  });

  it("une analyse qui echoue n'emet rien, ne note rien, et laisse passer", async () => {
    const w = portefeuille();
    const f = fenetre();
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ext = gardeExtension(w.p, f.cible);
    const compte: Eip1193Provider = { request: (a) => w.p.request(a) };
    envelopperProvider(compte, { target: f.cible, consulter: async () => Promise.reject(new Error("table absente")), approver: { name: "t", approve: passer } });
    await envoyer(compte);
    erreurs.mockRestore();
    // la garde de la page a echoue : celle de l'extension, dessous, a le droit d'essayer
    expect(ext.consultations).toHaveLength(1);
    expect(f.etapes.every((e) => e.garde === "extension")).toBe(true);
  });

  it("un rapport mal forme — qu'une page peut fabriquer — n'empeche pas l'envoi", async () => {
    const w = portefeuille();
    const f = fenetre();
    const compte: Eip1193Provider = { request: (a) => w.p.request(a) };
    envelopperProvider(compte, {
      target: f.cible,
      consulter: async () => ({ verdict: "ok" }) as unknown as GuardReport,
      approver: { name: "t", approve: passer },
    });
    await expect(envoyer(compte)).resolves.toBeTypeOf("string");
    expect(w.envois).toHaveLength(1);
  });
});

describe("constatPrincipal", () => {
  const f = (hook: string, verdict: Finding["verdict"], bps: number | null) => ({ hook, verdict, bps }) as Finding;
  const rapport = (findings: Finding[]) => ({ findings }) as GuardReport;
  const H = "0x" + "ab".repeat(20);
  const ZERO = "0x0000000000000000000000000000000000000000";

  it("un saut AVEC hook avant un saut sans, puis le plus grave, puis celui qui prend le plus", () => {
    expect(constatPrincipal(rapport([]))).toBeNull();
    expect(constatPrincipal(rapport([f(ZERO, "warn", null), f(H, "ok", 1)]))!.hook).toBe(H);
    expect(constatPrincipal(rapport([f(H, "ok", 900), f(H, "block", null)]))!.verdict).toBe("block");
    expect(constatPrincipal(rapport([f(H, "warn", 130), f(H, "warn", 150)]))!.bps).toBe(150);
  });
});

afterEach(() => vi.restoreAllMocks());
