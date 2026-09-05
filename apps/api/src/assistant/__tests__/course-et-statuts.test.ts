/**
 * DEUX DEFAUTS MESURES, ET LEUR CORRECTION.
 *
 * A — LE CODE HTTP MENTAIT. `answer.ok ? 200 : 429` renvoyait 429 Too Many Requests
 *     pour une question vide : le client lisait une limite de debit la ou rien
 *     n'avait ete limite. Un code de statut affirme une CAUSE ; ces tests verifient
 *     qu'il affirme la bonne, et surtout que 429 est reserve au vrai quota.
 *
 * B — LES FOURNISSEURS SE SUIVAIENT. Mesure du matin : 51,8 s sur une question libre,
 *     dont 45 s d'attente d'Ollama AVANT qu'OpenAI n'ait le droit de commencer. Ils
 *     courent maintenant ensemble. Ces tests verifient les trois choses qui comptent :
 *     c'est bien parallele (le total ne s'additionne plus), c'est la premiere reponse
 *     VALIDE qui gagne (pas la premiere arrivee), et le perdant est vraiment annule —
 *     sans que la tracabilite y perde une ligne.
 *
 *   npx vitest run --config src/assistant/vitest.config.ts   (depuis apps/api)
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { ask } from "../ask.js";
import { SessionStore } from "../session.js";
import { getStore } from "../store.js";
import {
  createAssistantRouter,
  httpStatusForAnswer,
  retryAfterSeconds,
} from "../router.js";
import {
  describeRace,
  gradeModelPlan,
  makeLlmPlanner,
  makeOllamaCall,
  modelCallFromEnv,
  plannerFromEnv,
  ProviderTimeoutError,
  RaceCancelledError,
  raceProviders,
  type ModelCall,
  type PlannerFn,
  type ProviderCall,
} from "../llm.js";

const fresh = () => new SessionStore();
const CTX = { lastHooks: [], openHook: null, openPool: null };
const PLAN_OK = '{"intent":"orphans","actions":[{"type":"showOrphans"}]}';
const PLAN_2 = '{"intent":"contradictions","actions":[{"type":"showContradictions"}]}';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un fournisseur simule qui met `ms` a repondre ET QUI SE LAISSE ANNULER : c'est la
 *  seule facon de verifier que l'annulation arrive jusqu'a lui, et pas seulement que
 *  sa reponse est ignoree. */
function fake(
  name: string,
  ms: number,
  reply: string | (() => never),
): ProviderCall & { seen: { signal: AbortSignal | null } } {
  const seen: { signal: AbortSignal | null } = { signal: null };
  const call: ModelCall = async ({ signal }) => {
    seen.signal = signal ?? null;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          rej(new RaceCancelledError(name));
        },
        { once: true },
      );
    });
    if (typeof reply === "function") return reply();
    return { text: reply, provider: name };
  };
  return { name, call, seen };
}

/* ------------------------------------------------------ A. les codes HTTP */

describe("A — le code HTTP dit la vraie cause", () => {
  const app = (deps: Parameters<typeof createAssistantRouter>[0] = {}) => {
    const a = new Hono();
    a.route("/assistant", createAssistantRouter({ sessions: fresh(), cors: false, ...deps }));
    return a;
  };
  const post = (a: Hono, body: unknown) =>
    a.request("/assistant/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("une question absente est un 400, pas un 429 : rien n'a ete limite", async () => {
    const res = await post(app(), { question: "" });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean; actions: { type: string }[] };
    expect(j.ok).toBe(false);
    expect(j.actions.some((x) => x.type === "clarify")).toBe(true);
  });

  it("une question trop longue est un 400", async () => {
    const res = await post(app(), { question: "a".repeat(601) });
    expect(res.status).toBe(400);
  });

  it("une question comprise mais ambigue est un 200 qui demande une precision", async () => {
    // Le planificateur a fait son travail : il a compris qu'il ne savait pas quoi
    // interroger. Ce n'est pas une faute du client, et ce n'est surtout pas un quota.
    const clarifie: PlannerFn = async () => ({
      intent: "unclear",
      actions: [{ type: "clarify", question: "De quel hook parles-tu ?" }],
      reading: "intention non identifiee",
      params: {
        hooks: [],
        pools: [],
        measurementIds: [],
        minBps: null,
        maxBps: null,
        vanillaSwap: null,
        nameHits: [],
      },
      why: ["le modele n'a pas su quoi interroger"],
    });
    const res = await post(app({ planner: clarifie }), { question: "et alors, eux ?" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; intent: string; actions: { type: string }[] };
    expect(j.ok).toBe(true);
    expect(j.intent).toBe("unclear");
    expect(j.actions.some((x) => x.type === "clarify")).toBe(true);
  });

  it("le quota epuise est le SEUL 429, et il porte un Retry-After pris sur sa fenetre", async () => {
    const bag = new SessionStore({
      questions: 1,
      measures: 0,
      windowMs: 60_000,
      maxSessions: 10,
    });
    const a = new Hono();
    a.route("/assistant", createAssistantRouter({ sessions: bag, cors: false }));
    const first = await post(a, { question: "montre les orphelins", session_id: "s_quota_429" });
    expect(first.status).toBe(200);

    const second = await post(a, { question: "montre les orphelins", session_id: "s_quota_429" });
    expect(second.status).toBe(429);
    const retry = second.headers.get("Retry-After");
    expect(retry).not.toBeNull();
    const secs = Number(retry);
    expect(Number.isInteger(secs)).toBe(true);
    // La valeur vient de quota.resets_at, pas d'une constante : elle tient dans la fenetre.
    expect(secs).toBeGreaterThanOrEqual(0);
    expect(secs).toBeLessThanOrEqual(60);
    const j = (await second.json()) as { degraded: { reason: string } | null };
    expect(j.degraded?.reason).toBe("quota");
  });

  it("un planificateur qui leve est un 503, pas un 429 ni un 400", async () => {
    const casse: PlannerFn = async () => {
      throw new Error("le planificateur a explose");
    };
    const res = await post(app({ planner: casse }), { question: "montre les orphelins" });
    expect(res.status).toBe(503);
    const j = (await res.json()) as { degraded: { reason: string } | null };
    expect(j.degraded?.reason).toBe("planner_error");
  });

  it("une cause inconnue devient 500 : on avoue l'ignorance, on n'emprunte pas 429", () => {
    expect(httpStatusForAnswer({ ok: false, degraded: { reason: "chose_nouvelle", detail: "" } })).toBe(500);
    expect(httpStatusForAnswer({ ok: true, degraded: { reason: "quota", detail: "" } })).toBe(200);
    expect(httpStatusForAnswer({ ok: false, degraded: null })).toBe(400);
  });

  it("aucune voie d'ask() autre que le quota ne peut produire un 429", async () => {
    const casse: PlannerFn = async () => {
      throw new Error("boum");
    };
    const bag1 = new SessionStore({ questions: 0, measures: 0, windowMs: 60_000, maxSessions: 4 });
    const voies = [
      { nom: "question vide", a: await ask("", { sessionId: "s_v1", sessions: fresh() }) },
      { nom: "question trop longue", a: await ask("x".repeat(700), { sessionId: "s_v2", sessions: fresh() }) },
      { nom: "planificateur qui leve", a: await ask("les orphelins", { sessionId: "s_v3", sessions: fresh(), planner: casse }) },
      { nom: "quota epuise", a: await ask("les orphelins", { sessionId: "s_v4", sessions: bag1 }) },
    ];
    for (const v of voies) {
      const code = httpStatusForAnswer(v.a);
      if (v.nom === "quota epuise") expect(code, v.nom).toBe(429);
      else expect(code, v.nom).not.toBe(429);
    }
  });

  it("retryAfterSeconds ne fabrique pas de delai quand il n'a pas de date", () => {
    expect(retryAfterSeconds(undefined)).toBeNull();
    expect(retryAfterSeconds("bientot")).toBeNull();
    expect(retryAfterSeconds(Number.NaN)).toBeNull();
    expect(retryAfterSeconds(1_000_000 + 4_500, 1_000_000)).toBe(5);
    // une fenetre deja passee ne rend jamais un nombre negatif
    expect(retryAfterSeconds(999_000, 1_000_000)).toBe(0);
  });
});

/* --------------------------------------------------- B. la course des LLM */

describe("B — les fournisseurs courent ensemble", () => {
  const store = () => getStore();

  it("le lent ne fait plus attendre le rapide : le total ne s'additionne plus", async () => {
    const lent = fake("lent", 900, PLAN_OK);
    const rapide = fake("rapide", 20, PLAN_2);
    const t0 = Date.now();
    const p = await makeLlmPlanner([lent, rapide], { budgetMs: 5_000 })(
      "montre les contradictions",
      store(),
      CTX,
    );
    const ms = Date.now() - t0;
    // En serie il aurait fallu 900 ms avant meme de commencer le second.
    expect(ms).toBeLessThan(500);
    expect(p.intent).toBe("contradictions");
    expect(p.why.join(" ")).toContain("rapide");
  });

  it("le perdant est ANNULE pour de vrai, pas simplement ignore", async () => {
    const lent = fake("lent", 5_000, PLAN_OK);
    const rapide = fake("rapide", 10, PLAN_2);
    await makeLlmPlanner([lent, rapide], { budgetMs: 5_000 })("les contradictions", store(), CTX);
    expect(lent.seen.signal).not.toBeNull();
    expect(lent.seen.signal!.aborted).toBe(true);
  });

  it("c'est la premiere reponse VALIDE qui gagne, pas la premiere arrivee", async () => {
    // Le cas qui justifie tout le dispositif : un JSON casse rendu vite ne doit pas
    // faire retomber la question sur les expressions regulieres alors qu'un plan
    // correct est encore en vol.
    const casse = fake("casse", 10, '{"intent":"curve","actions":[{"type":"res');
    const bon = fake("bon", 200, PLAN_2);
    const p = await makeLlmPlanner([casse, bon], { budgetMs: 5_000 })(
      "les contradictions",
      store(),
      CTX,
    );
    expect(p.degraded).toBeNull();
    expect(p.intent).toBe("contradictions");
    expect(p.why.join(" ")).toContain("fournisseur : bon");
    expect(p.why.join(" ")).toMatch(/casse — refuse/);
  });

  it("le proces-verbal de la course part dans la reponse : qui a gagne, ce que les autres ont fait", async () => {
    const lent = fake("lent", 5_000, PLAN_OK);
    const rapide = fake("rapide", 10, PLAN_2);
    const p = await makeLlmPlanner([lent, rapide], { budgetMs: 5_000 })(
      "les contradictions",
      store(),
      CTX,
    );
    const why = p.why.join("\n");
    expect(why).toContain("fournisseur : rapide");
    expect(why).toMatch(/course : rapide — gagnant en \d+ ms/);
    expect(why).toMatch(/course : lent — annule en \d+ ms/);
  });

  it("quand tous echouent, le deterministe reste le filet et chaque echec est nomme", async () => {
    const ko1: ProviderCall = {
      name: "ko1",
      call: async () => {
        throw new ProviderTimeoutError("ko1", 1234);
      },
    };
    const ko2: ProviderCall = {
      name: "ko2",
      call: async () => {
        throw new Error("socket fermee");
      },
    };
    const p = await makeLlmPlanner([ko1, ko2], { budgetMs: 5_000 })(
      "les hooks qui prennent plus de 100 bps",
      store(),
      CTX,
    );
    // Les deux echouent pour des raisons DIFFERENTES : l'un a depasse sa laisse, l'autre
    // etait injoignable. Une version anterieure les ecrasait tous les deux sous « modele
    // injoignable » — un fournisseur qui repondait, trop lentement, etait publie comme
    // muet. La course refuse desormais de confondre deux causes, et le dit.
    expect(p.degraded?.reason).toBe("aucun fournisseur n'a rendu de plan valide");
    const why = p.why.join("\n");
    expect(why).toContain("repli deterministe");
    expect(why).toMatch(/ko1 — expire/);
    expect(why).toMatch(/ko2 — erreur/);
    // Et chaque cause reste lisible individuellement, ce que le titre promet.
    expect(why).toMatch(/laisse/);
    // et le filet a bien travaille : la question a quand meme ete lue
    expect(p.actions.length).toBeGreaterThan(0);
  });

  it("deux pannes de MEME cause restent resumees en une seule phrase", async () => {
    const mk = (n: string): ProviderCall => ({
      name: n,
      call: async () => {
        throw new Error("socket fermee");
      },
    });
    const p = await makeLlmPlanner([mk("a"), mk("b")], { budgetMs: 5_000 })(
      "les hooks qui prennent plus de 100 bps",
      store(),
      CTX,
    );
    // Refuser de confondre deux causes differentes ne doit pas empecher d'en resumer
    // deux identiques : sinon la regle devient du bruit.
    expect(p.degraded?.reason).toBe("modele injoignable");
  });

  it("un fournisseur coupe par le budget n'est jamais publie comme injoignable", async () => {
    const lent: ProviderCall = {
      name: "lent",
      call: ({ signal }) =>
        new Promise((_, rej) => {
          signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    };
    const p = await makeLlmPlanner([lent], { budgetMs: 150 })(
      "les hooks qui prennent plus de 100 bps",
      store(),
      CTX,
    );
    // Il repondait peut-etre ; on ne l'a pas laisse finir. Dire « injoignable » ferait
    // changer de fournisseur pour rien.
    expect(p.degraded?.reason).not.toBe("modele injoignable");
    expect(p.degraded?.reason).toMatch(/budget/);
  });

  it("un fournisseur seul se comporte exactement comme avant (memes causes dans degraded)", async () => {
    const tronque: ModelCall = async () => '{"intent":"curve","actions":[{"type":"res';
    const p = await makeLlmPlanner(tronque)("les orphelins", store(), CTX);
    expect(p.degraded?.reason).toBe("JSON illisible");

    const vide: ModelCall = async () => "   ";
    const q = await makeLlmPlanner(vide)("les orphelins", store(), CTX);
    expect(q.degraded?.reason).toBe("reponse vide du modele");
  });

  it("une phrase porteuse de chiffres ne gagne pas contre une phrase propre, mais sert de reserve", async () => {
    const sale = fake(
      "sale",
      10,
      JSON.stringify({
        intent: "orphans",
        actions: [{ type: "showOrphans" }],
        say: "Ce hook prend environ 42 bps.",
      }),
    );
    const propre = fake(
      "propre",
      150,
      JSON.stringify({
        intent: "contradictions",
        actions: [{ type: "showContradictions" }],
        say: "Je confronte le registre a la mesure.",
      }),
    );
    const gagne = await makeLlmPlanner([sale, propre], { budgetMs: 5_000 })(
      "les contradictions",
      store(),
      CTX,
    );
    expect(gagne.why.join(" ")).toContain("fournisseur : propre");
    expect(gagne.why.join(" ")).toMatch(/sale — reserve/);

    // Seul, le meme plan sert quand meme : ce sont ses ACTIONS qui comptent, et la
    // phrase est jetee plus loin (ask.ts), pas ici.
    const seul = await makeLlmPlanner([sale])("les orphelins", store(), CTX);
    expect(seul.actions.some((a) => a.type === "showOrphans")).toBe(true);
    expect(seul.say).toContain("42");
    expect(seul.why.join(" ")).toContain("sous reserve");
    const a = await ask("les orphelins", {
      sessionId: "s_reserve",
      sessions: fresh(),
      planner: makeLlmPlanner([sale]),
    });
    expect(a.degraded?.reason).toBe("uncited_numbers_in_model_sentence");
    expect(a.narration).not.toContain("42 bps");
  });
});

describe("B — le jugement d'une reponse de modele", () => {
  it("Zod d'abord : un plan qui transporte un resultat de mesure est refuse", () => {
    const g = gradeModelPlan(
      '{"intent":"top-extractors","actions":[{"type":"filter","filter":{"minBps":100,"measured_bps":1176.46}}]}',
    );
    expect(g.grade).toBe("refuse");
    if (g.grade === "refuse") expect(g.reason).toBe("plan refuse par la validation");
  });

  it("un JSON casse est refuse, un plan vide aussi, et chacun dit pourquoi", () => {
    const a = gradeModelPlan('{"intent":"curve","actions":[{"type":"res');
    expect(a.grade).toBe("refuse");
    if (a.grade === "refuse") expect(a.reason).toBe("JSON illisible");
    const b = gradeModelPlan('{"intent":"orphans","actions":[]}');
    expect(b.grade).toBe("refuse");
    if (b.grade === "refuse") expect(b.reason).toBe("plan vide");
  });

  it("l'intention explain est valide sans action : le texte est ecrit par le produit", () => {
    const g = gradeModelPlan('{"intent":"explain","actions":[]}');
    expect(g.grade).toBe("valide");
    if (g.grade === "valide") expect(g.value.kind).toBe("explain");
  });

  it("une phrase sans chiffre est valide, une phrase avec chiffre passe en reserve", () => {
    const ok = gradeModelPlan(
      '{"intent":"orphans","actions":[{"type":"showOrphans"}],"say":"Je liste ce qui n\'a pas de fiche."}',
    );
    expect(ok.grade).toBe("valide");
    const sous = gradeModelPlan(
      '{"intent":"orphans","actions":[{"type":"showOrphans"}],"say":"Il y en a 12."}',
    );
    expect(sous.grade).toBe("reserve");
    if (sous.grade === "reserve") expect(sous.detail).toContain("12");
  });
});

describe("B — la mecanique de la course, isolee", () => {
  it("marque `annule` et non `refuse` ce qu'elle n'a pas laisse finir", async () => {
    const lent = fake("lent", 5_000, PLAN_OK);
    const rapide = fake("rapide", 5, PLAN_2);
    const r = await raceProviders<string>(
      [lent, rapide],
      { system: "s", user: "u" },
      (text) => ({ grade: "valide", value: text }),
      5_000,
    );
    expect(r.provider).toBe("rapide");
    const notes = Object.fromEntries(r.reports.map((x) => [x.provider, x.outcome]));
    expect(notes).toEqual({ rapide: "gagnant", lent: "annule" });
    expect(describeRace(r.reports).join(" ")).toMatch(/lent — annule en \d+ ms/);
  });

  it("le budget epuise marque `expire`, et ne rend aucune valeur inventee", async () => {
    const lent1 = fake("lent1", 5_000, PLAN_OK);
    const lent2 = fake("lent2", 5_000, PLAN_2);
    const r = await raceProviders<string>(
      [lent1, lent2],
      { system: "s", user: "u" },
      (text) => ({ grade: "valide", value: text }),
      60,
    );
    expect(r.value).toBeNull();
    expect(r.provider).toBeNull();
    expect(r.reports.every((x) => x.outcome === "expire")).toBe(true);
  });

  it("une reserve ne bat pas un valide, mais sert quand il n'y a rien d'autre", async () => {
    const r = await raceProviders<string>(
      [fake("a", 5, "A"), fake("b", 120, "B")],
      { system: "s", user: "u" },
      (text) =>
        text === "A"
          ? { grade: "reserve", value: text, detail: "sous reserve" }
          : { grade: "valide", value: text },
      5_000,
    );
    expect(r.value).toBe("B");
    expect(r.reserved).toBe(false);

    const seule = await raceProviders<string>(
      [fake("a", 5, "A")],
      { system: "s", user: "u" },
      (text) => ({ grade: "reserve", value: text, detail: "sous reserve" }),
      5_000,
    );
    expect(seule.value).toBe("A");
    expect(seule.reserved).toBe(true);
  });
});

describe("B — l'annulation descend jusqu'au fetch du fournisseur", () => {
  it("un appel Ollama annule de l'exterieur rend RaceCancelledError, pas un faux timeout", async () => {
    const ctrl = new AbortController();
    // Un fetch qui ne repond jamais de lui-meme : seule l'annulation peut le finir.
    const fetchImpl = ((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(new Error("This operation was aborted")), {
          once: true,
        });
      })) as unknown as typeof fetch;
    const call = makeOllamaCall({ url: "http://127.0.0.1:1", timeoutMs: 30_000, fetchImpl });
    const p = call({ system: "s", user: "u", signal: ctrl.signal });
    await sleep(10);
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(RaceCancelledError);
  });

  it("une laisse depassee garde le message exact des journaux, et sa classe", async () => {
    const fetchImpl = ((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
      })) as unknown as typeof fetch;
    const call = makeOllamaCall({
      url: "http://127.0.0.1:1",
      model: "granite3.3:8b",
      timeoutMs: 30,
      fetchImpl,
    });
    await expect(call({ system: "s", user: "u" })).rejects.toThrow(
      "ollama:granite3.3:8b n'a pas repondu en 30 ms (laisse du fournisseur)",
    );
    await expect(call({ system: "s", user: "u" })).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

describe("B — le budget est un maximum, plus une somme", () => {
  const withEnv = async (patch: Record<string, string>, fn: () => void) => {
    const before: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(patch)) {
      before[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it("deux fournisseurs en course : budget = la plus LONGUE laisse + la marge", async () => {
    await withEnv(
      {
        OLLAMA_URL: "http://127.0.0.1:11434",
        OPENAI_API_KEY: "sk-test-ne-sert-a-rien",
        TARE_OLLAMA_TIMEOUT_MS: "40000",
        TARE_OPENAI_TIMEOUT_MS: "10000",
        TARE_DISABLE_OLLAMA: "0",
        TARE_DISABLE_OPENAI: "0",
        TARE_PLANNER: "",
      },
      () => {
        const env = modelCallFromEnv();
        expect(env).not.toBeNull();
        expect(env!.calls.map((c) => c.name).length).toBe(2);
        // 40000 + 3000, et surtout PAS 40000 + 10000 + 3000 : personne n'attend son tour.
        expect(env!.budgetMs).toBe(43_000);
        const info = plannerFromEnv();
        expect(info.mode).toBe("llm");
        expect(info.budget_ms).toBe(43_000);
        expect(info.why).toContain("ensemble");
      },
    );
  });
});
