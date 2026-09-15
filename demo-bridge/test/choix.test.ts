/**
 * LES TROIS CHOIX : ce que l'appareil demande, et comment la conversation tranche.
 *
 * Aucun appareil ici : `signerAvec` remplace le verrou et la signature par un faux qui repond
 * ce qu'on lui dit. Ce qui est teste, c'est l'ordre des questions, les nombres qu'elles portent
 * (tous tires du corpus), et la correspondance entre les reponses et le choix rendu.
 */
import { afterEach, describe, expect, it } from "vitest";
import { keccak256, toHex } from "../vendor/guard/src/keccak.js";
import type { Eip712TypedData } from "../vendor/guard/src/ledger.js";
import { ACTES } from "../src/corpus.js";
import { AppareilOccupe, type OptionsSignature, type Resultat } from "../src/ledger.js";
import { champTakeBref, optionsDe, questionDe, questionsDe, TARE_CHOIX_TYPES } from "../src/message.js";
import { abandonnerChoix, demarrerChoix, lireChoix, oublierChoix } from "../src/choix.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
const SUB = ACTES.substitution;
const dodo = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Reponse = "signe" | "refuse" | "panne" | ((opts: OptionsSignature) => Promise<"signe" | "refuse">);

/** Un faux appareil : une reponse par question, dans l'ordre. Il note ce qu'on lui a montre. */
function fauxAppareil(reponses: Reponse[]) {
  const vus: Eip712TypedData[] = [];
  const signerAvec = (async (_quoi: string, fn: (s: (t: Eip712TypedData, o?: OptionsSignature) => Promise<Resultat>) => Promise<unknown>) =>
    fn(async (typed, opts = {}) => {
      vus.push(typed);
      let r = reponses[vus.length - 1];
      if (r === undefined) throw new Error("question de trop");
      if (r === "panne") throw new Error("appareil: plus de reponse");
      if (typeof r === "function") r = await r(opts);
      await dodo(5);
      return r === "signe"
        ? { signature: "0x" + "ab".repeat(65), v: 27, r: "0x1", s: "0x2", ecrans: ["a", "b", "c"] }
        : { refus: 4001 as const, raison: "refuse", ecrans: ["a", "b"] };
    })) as never;
  return { vus, signerAvec };
}

async function jusquaLaFin(): Promise<ReturnType<typeof lireChoix>> {
  for (let i = 0; i < 200; i++) {
    const e = lireChoix();
    if (!e.en_cours) return e;
    await dodo(5);
  }
  throw new Error("la conversation ne s'est pas terminee");
}

afterEach(() => oublierChoix());

describe("les questions posees a l'appareil", () => {
  it("proposent les trois choix dans l'ordre de JB : route actuelle, porte moins chere, annuler", () => {
    expect(SUB.meilleure_porte).not.toBeNull();
    const o = optionsDe("substitution");
    expect(o.map((x) => [x.rang, x.option])).toEqual([
      [1, "actuelle"],
      [2, "optimisee"],
      [3, "annuler"],
    ]);
    expect(o[0]!.libelle).toContain(champTakeBref(SUB.porte));
    expect(o[1]!.libelle).toContain(champTakeBref(SUB.meilleure_porte!));
    // l'annulation n'est pas une question : c'est le refus de la derniere
    expect(questionsDe("substitution")).toEqual(["actuelle", "optimisee"]);
  });

  it("sans porte de remplacement, il n'y a qu'une question et Reject annule", () => {
    const acte = (["stop", "substitution", "queue"] as const).find((n) => ACTES[n].meilleure_porte === null);
    if (!acte) return; // le corpus a une porte de remplacement partout : rien a verifier
    expect(optionsDe(acte).map((x) => x.option)).toEqual(["actuelle", "annuler"]);
    const q = questionDe(acte, "actuelle");
    expect(q.typed.message.choice).toBe("1 of 2: keep your route");
    expect(q.typed.message.ifRejected).toBe("2 of 2: cancel, nothing is sent");
    expect(() => questionDe(acte, "optimisee")).toThrow(/question_impossible/);
  });

  it("question 1 : la route actuelle, son prelevement, son hook, et le chiffre de l'autre porte", () => {
    const q = questionDe("substitution", "actuelle");
    expect(q.rang).toBe(1);
    expect(q.typed.primaryType).toBe("TareGuardChoice");
    expect(q.typed.message).toEqual({
      choice: "1 of 3: keep your route",
      take: champTakeBref(SUB.porte),
      ifRejected: `2 of 3: cheaper gate, ${champTakeBref(SUB.meilleure_porte!)}`,
      hook: SUB.porte.hook,
      promptDigest: toHex(keccak256(utf8(q.texte))),
    });
    expect(q.prompt_digest).toBe(q.typed.message.promptDigest);
  });

  it("question 2 : la porte moins chere, et Reject mene a l'annulation", () => {
    const q = questionDe("substitution", "optimisee");
    expect(q.rang).toBe(2);
    expect(q.typed.message.choice).toBe("2 of 3: take the cheaper gate");
    expect(q.typed.message.take).toBe(champTakeBref(SUB.meilleure_porte!));
    expect(q.typed.message.hook).toBe(SUB.meilleure_porte!.hook);
    expect(q.typed.message.ifRejected).toBe("3 of 3: cancel, nothing is sent");
    expect(q.prompt_digest).not.toBe(questionDe("substitution", "actuelle").prompt_digest);
  });

  it("chaque champ du message est declare dans le schema, et dans le meme ordre", () => {
    const q = questionDe("substitution", "actuelle");
    expect(Object.keys(q.typed.message)).toEqual(TARE_CHOIX_TYPES.TareGuardChoice!.map((f) => f.name));
    expect(q.typed.types).toBe(TARE_CHOIX_TYPES);
  });

  it("le texte scelle porte les deux portes, le bloc et la commande de rejeu", () => {
    const t = questionDe("substitution", "optimisee").texte;
    expect(t).toContain(SUB.porte.pool_id);
    expect(t).toContain(SUB.meilleure_porte!.pool_id);
    expect(t).toContain(SUB.meilleure_porte!.rejeu);
    expect(t).toMatch(/measured at block \d+/);
  });
});

describe("la conversation", () => {
  it("Sign a la question 1 : on garde sa route, une seule question posee", async () => {
    const app = fauxAppareil(["signe"]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    const e = await jusquaLaFin();
    expect(e.resultat?.choix).toBe("actuelle");
    expect(e.resultat?.signature).toMatch(/^0x/);
    expect(e.resultat?.prompt_digest).toBe(questionDe("substitution", "actuelle").prompt_digest);
    expect(e.etapes.map((x) => x.issue)).toEqual(["approuvee"]);
    expect(app.vus).toHaveLength(1);
  });

  it("Reject puis Sign : la porte moins chere", async () => {
    const app = fauxAppareil(["refuse", "signe"]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    const e = await jusquaLaFin();
    expect(e.resultat?.choix).toBe("optimisee");
    expect(e.etapes.map((x) => [x.rang, x.option, x.issue])).toEqual([
      [1, "actuelle", "rejetee"],
      [2, "optimisee", "approuvee"],
    ]);
    expect(app.vus.map((t) => t.message.choice)).toEqual(["1 of 3: keep your route", "2 of 3: take the cheaper gate"]);
  });

  it("Reject puis Reject : annuler, rien n'est signe", async () => {
    const app = fauxAppareil(["refuse", "refuse"]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    const e = await jusquaLaFin();
    expect(e.resultat).toMatchObject({ choix: "annuler", signature: null, prompt_digest: null });
    expect(e.erreur).toBeNull();
  });

  it("dit quelle question l'appareil affiche pendant qu'il l'affiche", async () => {
    let lache: (() => void) | null = null;
    const app = fauxAppareil([
      "refuse",
      () => new Promise<"signe">((ok) => (lache = () => ok("signe"))),
    ]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    for (let i = 0; i < 100 && lache === null; i++) await dodo(5);
    const pendant = lireChoix();
    expect(pendant).toMatchObject({ en_cours: true, rang: 2, option: "optimisee" });
    expect(pendant.digest_en_cours).toBe(questionDe("substitution", "optimisee").prompt_digest);
    expect(pendant.depuis_ms).toBeGreaterThanOrEqual(0);
    lache!();
    const e = await jusquaLaFin();
    expect(e).toMatchObject({ en_cours: false, rang: null, option: null, digest_en_cours: null });
  });

  it("une seconde conversation est refusee tant que la premiere tourne", async () => {
    let lache: (() => void) | null = null;
    const app = fauxAppareil([() => new Promise<"refuse">((ok) => (lache = () => ok("refuse"))), "refuse"]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    expect(() => demarrerChoix("substitution", { signerAvec: app.signerAvec })).toThrow(AppareilOccupe);
    for (let i = 0; i < 100 && lache === null; i++) await dodo(5);
    lache!();
    expect((await jusquaLaFin()).resultat?.choix).toBe("annuler");
  });

  it("abandonner ferme la question ouverte et n'en pose pas d'autre", async () => {
    const app = fauxAppareil([
      async (opts) => {
        for (let i = 0; i < 200 && !opts.abandon?.(); i++) await dodo(5);
        return "refuse";
      },
      "signe",
    ]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    await dodo(20);
    expect(abandonnerChoix()).toBe(true);
    const e = await jusquaLaFin();
    expect(e.resultat).toBeNull();
    expect(e.erreur?.erreur).toBe("abandonne");
    expect(app.vus).toHaveLength(1);
    expect(abandonnerChoix()).toBe(false);
  });

  it("une panne de l'appareil est nommee, et ne passe jamais pour un choix", async () => {
    const app = fauxAppareil(["panne"]);
    demarrerChoix("substitution", { signerAvec: app.signerAvec });
    const e = await jusquaLaFin();
    expect(e.resultat).toBeNull();
    expect(e.erreur?.erreur).toBe("appareil");
  });
});

describe("le gaz de la porte de remplacement", () => {
  it("la marge couvre ce que le bloc suivant demande reellement", async () => {
    const { margeDeGaz, GAZ_PAR_DEFAUT } = await import("../src/fork.js");
    // mesure : 4 355 064 estimes au bloc suivant ; la transaction ne passe qu'au-dessus de ~4,4 M
    expect(margeDeGaz(4_355_064n)).toBeGreaterThan(5_000_000n);
    expect(margeDeGaz(148_599n)).toBeGreaterThan(148_599n);
    expect(GAZ_PAR_DEFAUT).toBeGreaterThan(margeDeGaz(4_355_064n));
  });
});

describe("les nonces apres un rembobinage", () => {
  it("un compte qui a recule retrouve son nonce d'avant, les autres ne bougent pas", async () => {
    const { noncesAReporter } = await import("../src/fork.js");
    const avant = new Map([["0xjb", 9n], ["0xautre", 3n], ["0xneuf", 0n]]);
    const apres = new Map([["0xjb", 8n], ["0xautre", 3n], ["0xneuf", 0n]]);
    expect(noncesAReporter(avant, apres)).toEqual([["0xjb", 9n]]);
    // un nonce qui a AVANCE n'est jamais ramene en arriere
    expect(noncesAReporter(new Map([["0xjb", 5n]]), new Map([["0xjb", 7n]]))).toEqual([]);
  });
});
