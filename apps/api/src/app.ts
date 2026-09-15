/**
 * L'API TARE.
 *
 * Quatre routes de lecture, une route payante, un compteur.
 * Rien ici ne calcule un bps : les nombres viennent du moteur ou du jeu publie.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { FacilitatorClient } from "@x402/core/server";
import { loadConfig, type Config } from "./config.js";
import { loadDataset, loadRegistry, loadPools } from "./dataset.js";
import { buildRanking } from "./rank.js";
import { buildPlan } from "./plan.js";
import { normalizeMeasurement, buildReplay } from "./measurement.js";
import { buildTokenSheet, isQuoteCurrency, QUOTE_CURRENCIES } from "./token.js";
import { buildExitTest, phrase } from "./exit.js";
import { engineHealth, runPlans, type EngineHealth , assertNodeMatches } from "./engine.js";
import { createMetering, toMeasurementUnit, type BatchReceipt } from "./metering/index.js";
import { createAgentRouter } from "./agent/router.js";
import { createCompteRouter } from "./compte/router.js";
import { configDepuisEnv } from "./compte/abonnement.js";
import { createGraphRouter } from "./graph-routes.js";
import { createRagRouter } from "./rag/index.js";
import { createRouteRouter } from "./route.js";
import { createAlternativeRouter } from "./alternative.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { createPaymentLayer, payerFromHeader, paymentHeaderOf, priceFor } from "./x402.js";
import type { Label } from "./labels.js";
import type { RagStore, QueryEmbedder } from "./rag/index.js";

export interface AppDeps {
  config?: Partial<Config>;
  /** injecte en test pour ne pas dependre du reseau */
  facilitator?: FacilitatorClient;
  /** injecte en test pour ne pas dependre d'un fork anvil */
  engine?: {
    health: (python: string, rpc: string) => Promise<EngineHealth>;
    run: typeof runPlans;
  };
  /** injecte en test pour ne pas dependre d'un Postgres */
  ragStore?: RagStore;
  /** injecte en test pour ne pas dependre d'un Ollama */
  ragEmbedder?: QueryEmbedder;
}

const HONESTY = [
  "1. The model never produces a number: it chooses what to query and explains what comes back.",
  "2. Every measurement carries a label: MEASURED | INTERPOLATED | NOT_MEASURABLE | NOT_QUOTABLE.",
  "3. A clamped or truncated read is a NOT_MEASURABLE, never a value.",
  "4. Every value carries its block, its size and its direction, and replays in one command.",
];

export function createApp(deps: AppDeps = {}) {
  const cfg = loadConfig(deps.config ?? {});
  const engine = deps.engine ?? { health: engineHealth, run: runPlans };

  const app = new Hono();
  app.use("*", cors());

  /* --------------------------------------------------------------- service */

  app.get("/", (c) =>
    c.json({
      service: "TARE",
      what: "Measures what a Uniswap v4 hook actually takes on a swap.",
      method:
        "On a pinned fork, anvil_setCode replaces the hook bytecode with an inert 89-byte stub. The pool does not move; only the hook code changes. The same swap is quoted twice. The gap IS what the hook took.",
      honesty_rules: HONESTY,
      routes: [
        "GET  /hooks               the ranking by hook",
        "GET  /hook/:address       the sheet: every profile of the hook",
        "GET  /exit/:address?montant=100   THE exit test: you put in 100, you get back how much",
        "GET  /token/:address      a token sheet: what buying it costs, what selling it back costs",
        "GET  /measurement/:id     one measurement and its replay command",
        "POST /measure             measurement on demand (paid, x402)",
        "GET  /usage               the meter, unit = 1 measurement",
        "GET  /meta                sources, engine, toll",
        "GET  /graph               the graph: what the traversals reveal",
        "GET  /rag/search?q=..     the corpus passages, with file, line and distance",
        "GET  /rag/meta            the state of the vector index, read from the database",
        "GET  /route?currency0=..&currency1=..  which pool to go through, and what it costs",
        "POST /alternative        this gate against the others, and — if there is better — the replacement transaction to sign",
        "GET  /agent              the HCS-14 identity of the agent, and its UAID",
        "GET  /agent/hcs          the Hedera registry message that publishes it",
      ],
      // Le parcours du compte, dans l'ordre ou il se vit. Il etait documente uniquement dans
      // l'en-tete de src/compte/router.ts : personne d'exterieur ne pouvait le decouvrir.
      compte: [
        "POST   /compte/nonce         {adresse} -> a nonce and the exact TEXT to sign",
        "POST   /compte/session       {adresse, nonce, signature} -> a session token",
        "GET    /compte               the account, its on-chain subscription, its keys, its counters",
        "POST   /compte/abonnement    re-reads the subscription from the contract and refreshes the cache",
        "POST   /compte/cle           {nom, portee} -> an API key. The secret is returned ONLY ONCE",
        "DELETE /compte/cle/:id       revokes a key",
        "GET    /compte/journal       the history: analyses, verdicts, substitutions",
        "POST   /compte/journal       the extension and the MCP write here (x-tare-cle header)",
        "DELETE /compte/session       sign out",
      ],
      deux_authentifications:
        "the session token (authorization: Bearer) belongs to a human in front of a browser and opens reading the account and managing keys; the API key (x-tare-cle) belongs to a machine and opens nothing but writing to the journal. A key can never create another one.",
    }),
  );

  app.get("/health", async (c) => {
    const ds = loadDataset();
    return c.json({
      ok: true,
      measurements: ds.measurements.length,
      dataset_source: ds.source_kind,
      uptime_s: Math.round(process.uptime()),
    });
  });

  app.get("/meta", async (c) => {
    const ds = loadDataset();
    const reg = loadRegistry();
    const health = await engine.health(cfg.python, cfg.rpcUrl);
    return c.json({
      honesty_rules: HONESTY,
      dataset: {
        source: ds.source,
        source_kind: ds.source_kind,
        measurements: ds.measurements.length,
        hooks: ds.byHook.size,
        pools: new Set(ds.measurements.map((m) => m.pool_id)).size,
        rejected_lines: ds.rejected.length,
        loaded_at: ds.loaded_at,
      },
      registry: {
        available: reg.path !== null && reg.count > 0,
        path: reg.path,
        entries: reg.count,
        note:
          reg.path === null
            ? "no registry file in docs/: the registry field is null everywhere, which does NOT mean 'absent from the registry'"
            : "registry loaded: registry=null then means 'absent from the official registry'",
      },
      pools_with_liquidity: loadPools().length,
      engine: health,
      x402: cfg.x402Enabled
        ? layer.describe()
        : { enabled: false, note: "toll disabled (X402_ENABLED=0)" },
      billing: {
        unit: "measurement",
        model: "per-measurement",
        unit_price_usd: cfg.unitPriceUsd,
        example: `3 measurements => ${priceFor(3, cfg.unitPriceUsd)}`,
      },
    });
  });

  /* ------------------------------------------------------------- classement */

  app.get("/hooks", (c) => {
    const ds = loadDataset();
    const reg = loadRegistry();
    const rows = buildRanking(ds, reg);
    return c.json({
      count: rows.length,
      dataset: { source: ds.source_kind, measurements: ds.measurements.length },
      registry: { available: reg.path !== null && reg.count > 0, entries: reg.count },
      hooks: rows,
    });
  });

  /* ------------------------------------------------------------------ fiche */

  app.get("/hook/:address", (c) => {
    const addr = c.req.param("address").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr))
      return c.json({ error: "invalid address", address: c.req.param("address") }, 400);

    const ds = loadDataset();
    const reg = loadRegistry();
    const list = ds.byHook.get(addr) ?? [];
    const entry = reg.entries.get(addr);
    const available = reg.path !== null && reg.count > 0;

    if (list.length === 0)
      return c.json(
        {
          hook: addr,
          measurements: [],
          count: 0,
          registry_available: available,
          in_registry: available ? Boolean(entry) : null,
          registry: entry ? entry.fields : null,
          note: "no measurement published for this hook. This is not a zero: it is an absence of measurement.",
        },
        200,
      );

    // regroupe par pool : un profil = un pool, ses tailles et ses sens
    const byPool = new Map<string, typeof list>();
    for (const m of list) {
      const arr = byPool.get(m.pool_id);
      if (arr) arr.push(m);
      else byPool.set(m.pool_id, [m]);
    }

    const labels: Partial<Record<Label, number>> = {};
    for (const m of list) labels[m.label] = (labels[m.label] ?? 0) + 1;

    const profiles = [...byPool.entries()].map(([pool_id, ms]) => {
      const measured = ms.filter((m) => m.bps !== null);
      return {
        pool_id,
        currency0: ms[0]!.currency0,
        currency1: ms[0]!.currency1,
        key_fee: ms[0]!.key_fee,
        tick_spacing: ms[0]!.tick_spacing,
        fee_is_dynamic: ms[0]!.fee_is_dynamic,
        stored_lp_fee: ms[0]!.stored_lp_fee,
        stored_protocol_fee: ms[0]!.stored_protocol_fee,
        max_bps: measured.length ? Math.max(...measured.map((m) => m.bps!)) : null,
        points: ms
          .slice()
          .sort((a, b) =>
            a.zero_for_one === b.zero_for_one
              ? Number(BigInt(a.amount_in) - BigInt(b.amount_in) > 0n) - 0.5
              : Number(b.zero_for_one) - Number(a.zero_for_one),
          )
          .map((m) => ({
            id: m.id,
            block_number: m.block_number,
            amount_in: m.amount_in,
            direction: m.direction,
            zero_for_one: m.zero_for_one,
            bps: m.bps,
            label: m.label,
            reason: m.reason,
            out_with: m.out_with,
            out_without: m.out_without,
            replay: m.replay.command_exact,
          })),
      };
    });

    return c.json({
      hook: addr,
      count: list.length,
      pools: byPool.size,
      labels,
      max_bps: profiles.reduce<number | null>(
        (acc, p) => (p.max_bps === null ? acc : acc === null ? p.max_bps : Math.max(acc, p.max_bps)),
        null,
      ),
      registry_available: available,
      in_registry: available ? Boolean(entry) : null,
      registry: entry ? entry.fields : null,
      dataset_source: ds.source_kind,
      profiles,
    });
  });

  /* ------------------------------------------------- la fiche d'un JETON */

  /**
   * La seule route qu'un utilisateur peut utiliser sans rien connaitre du protocole.
   *
   * Toutes les autres demandent une adresse de hook ou un pool_id : personne n'a ca. Ce qu'un
   * utilisateur possede, c'est un JETON — une adresse copiee depuis un lien ou une application.
   * Et ca suffit : sur les 8 583 jetons du jeu hors monnaies de cotation, 97,2 % n'apparaissent
   * que dans UN pool et 99,8 % ne sont rattaches qu'a UN hook.
   *
   * La reponse est traduite en « acheter » / « vendre » plutot qu'en zeroForOne, parce que c'est
   * la question que la personne se pose. Le `direction` du protocole reste rendu a cote, pour le
   * rejeu.
   */
  app.get("/token/:address", (c) => {
    const raw = c.req.param("address");
    if (!/^0x[0-9a-fA-F]{40}$/.test(raw))
      return c.json(
        {
          error: `malformed address: ${raw}`,
          attendu: "0x followed by 40 hexadecimal digits",
          note: "paste the token CONTRACT address, the one the explorers show.",
        },
        400,
      );
    const t = raw.toLowerCase();

    if (isQuoteCurrency(t))
      return c.json(
        {
          error: "this address is a quote currency, not a token to audit",
          address: t,
          symbol: QUOTE_CURRENCIES[t],
          note: "ETH, WETH and USDC are the other side of the swap. Paste the token whose cost you want.",
        },
        400,
      );

    const ds = loadDataset();
    const rows = ds.measurements.filter(
      (m) =>
        (m.currency0 ?? "").toLowerCase() === t || (m.currency1 ?? "").toLowerCase() === t,
    );
    if (rows.length === 0)
      return c.json(
        {
          error: "token unknown to the measurement dataset",
          address: t,
          note:
            "the scan covers the Base v4 pools with non-zero liquidity at block " +
            `${cfg.forkBlock}. An absent token is not a token with no take: it is NOT MEASURED.`,
          mesurer: "POST /measure with the full PoolKey, if you know it",
          couverture: { measurements: ds.measurements.length, block: cfg.forkBlock },
        },
        404,
      );

    const reg = loadRegistry();
    return c.json(buildTokenSheet(t, rows, reg.entries));
  });

  /* -------------------------------------------------- le TEST DE SORTIE */

  /**
   * « tu mets 100, tu recuperes combien ? »
   *
   * Un champ, un nombre. Aucun fork n'est ouvert : la reponse se compose depuis le corpus, donc
   * elle est immediate, elle ne coute rien en RPC, et deux visiteurs simultanes ne peuvent pas se
   * genent. Le chemin qui EXECUTE vraiment l'aller-retour reste derriere POST /measure, paye.
   */
  app.get("/exit/:address", (c) => {
    const raw = c.req.param("address");
    if (!/^0x[0-9a-fA-F]{40}$/.test(raw))
      return c.json(
        { error: `malformed address: ${raw}`, attendu: "0x followed by 40 hexadecimal digits" },
        400,
      );
    const t = raw.toLowerCase();
    if (isQuoteCurrency(t))
      return c.json(
        {
          error: "this address is a quote currency, not a token to test",
          symbol: QUOTE_CURRENCIES[t],
        },
        400,
      );

    const montant = Number(c.req.query("montant") ?? 100);
    if (!Number.isFinite(montant) || montant <= 0)
      return c.json({ error: `invalid montant: ${c.req.query("montant")}` }, 400);

    const ds = loadDataset();
    const rows = ds.measurements.filter(
      (m) => (m.currency0 ?? "").toLowerCase() === t || (m.currency1 ?? "").toLowerCase() === t,
    );
    if (rows.length === 0)
      return c.json(
        {
          error: "token unknown to the measurement dataset",
          note:
            `the scan covers the Base v4 pools with non-zero liquidity at block ${cfg.forkBlock}. ` +
            `An absent token is not a token with no take: it is NOT MEASURED.`,
        },
        404,
      );

    const test = buildExitTest(t, rows);
    if ("refus" in test) return c.json({ ...test, token: t, montant }, 422);
    return c.json({ ...test, montant, verdict: phrase(test, montant) });
  });

  /* ------------------------------------------------------------- une mesure */

  app.get("/measurement/:id", (c) => {
    const id = c.req.param("id");
    const ds = loadDataset();
    const m = ds.byId.get(id);
    if (!m)
      return c.json(
        {
          error: "unknown measurement",
          id,
          hint: "ids are deterministic: sha256(chain|block|hook|pool|direction|size). List them via /hooks then /hook/:address.",
        },
        404,
      );
    return c.json({
      ...m,
      replay_command: m.replay.command_exact,
      how_to_replay: [
        "1. docker compose up -d   (anvil fork pinned to the block)",
        `2. ${m.replay.command_exact}`,
        `   or, short: ${m.replay.command}`,
      ],
    });
  });

  /* ------------------------------------------------------- la route payante */

  const metering = createMetering({ unitPriceUsd: cfg.unitPriceUsd });

  /**
   * Raccrocher le reglement au bon lot.
   *
   * Le hash x402 arrive APRES le handler : le middleware verifie, laisse passer, puis
   * regle. Le lot, lui, est ecrit PENDANT le handler. Il faut donc un fil entre les deux.
   *
   * Ce fil etait un `let lastBatchId` partage par tout le serveur. Deux defauts, et le
   * premier paiement reel les a montres tous les deux : il n'etait affecte que dans le
   * chemin d'ECHEC (un lot reussi n'etait donc jamais raccroche — `settlement_tx: null`
   * sur une transaction pourtant confirmee on-chain), et, partage, il aurait attribue le
   * reglement d'une requete au lot d'une autre des que deux clients paient en meme temps.
   *
   * AsyncLocalStorage donne une case PAR REQUETE, que le hook de reglement retrouve parce
   * qu'il s'execute dans le meme contexte asynchrone. Pas de course, pas d'ordre suppose.
   */
  const enCours = new AsyncLocalStorage<{ receipt: BatchReceipt | null; block: number | null }>();
  const layer = createPaymentLayer(cfg, {
    facilitator: deps.facilitator,
    onSettled: (payer, st) => {
      const slot = enCours.getStore();
      if (!slot?.receipt) return;
      metering.service.attachSettlement(slot.receipt.batch_id, { ...st, payer });
      // L'ancrage vient APRES le raccrochage, pas avant : ancre plus tot, l'empreinte
      // partirait avec `settlement: null` et le journal HCS ne serait plus une piste
      // d'audit de PAIEMENT, juste un horodatage de calcul. Il ne bloque pas la reponse.
      void metering.service.anchorBatch(slot.receipt, { block: slot.block });
    },
  });

  // La case doit exister AVANT le middleware de paiement, sinon le hook de reglement
  // s'execute hors contexte et ne trouve rien.
  app.use("/measure", (c, next) => enCours.run({ receipt: null, block: null }, () => next()));

  // 1) on valide le plan AVANT le peage : personne ne paie pour une requete
  //    qu'on ne saurait pas executer.
  app.use("/measure", async (c, next) => {
    if (c.req.method !== "POST") return next();
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const plan = buildPlan(body, {
      defaultBlock: cfg.forkBlock,
      maxUnits: cfg.maxUnitsPerRequest,
    });
    if (!plan.ok)
      return c.json(
        {
          error: plan.error,
          billing: { unit: "measurement", unit_price_usd: cfg.unitPriceUsd },
          accepts_body: {
            hook: "0x… (a hook known to docs/pools-liquides.json)",
            pool_id: "0x… (a pool already measured)",
            pool: { currency0: "0x…", currency1: "0x…", fee: 8388608, tick_spacing: 200, hooks: "0x…" },
            sizes: ["1000000000000000"],
            directions: ["0->1", "1->0"],
            block: cfg.forkBlock,
          },
        },
        400,
      );
    c.set("plan" as never, plan as never);
    return next();
  });

  // 2) le 402 de x402 v2 met les exigences de paiement dans l'en-tete
  //    `payment-required` (base64). Un humain qui fait un curl ne voit alors rien.
  //    On decode et on recopie accepts[] dans le corps JSON — meme contenu, lisible.
  app.use("/measure", async (c, next) => {
    await next();
    if (c.res.status !== 402) return;
    const header = c.res.headers.get("payment-required");
    if (!header) return;
    try {
      const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
      const body = (await c.res.clone().json()) as Record<string, unknown>;
      const headers = new Headers(c.res.headers);
      headers.delete("content-length");
      c.res = new Response(
        JSON.stringify({
          x402Version: decoded.x402Version,
          accepts: decoded.accepts,
          resource: decoded.resource,
          ...body,
        }),
        { status: 402, headers },
      );
    } catch {
      /* en-tete illisible : on laisse la reponse telle quelle, on n'invente rien */
    }
  });

  // 3) le peage x402
  if (cfg.x402Enabled) app.use("/measure", layer.middleware);

  // 4) la mesure
  app.post("/measure", async (c) => {
    const plan = c.get("plan" as never) as ReturnType<typeof buildPlan>;
    const paymentHeader = paymentHeaderOf((n) => c.req.header(n));
    const who = payerFromHeader(paymentHeader);
    const paid = cfg.x402Enabled && Boolean(paymentHeader);

    let raws;
    try {
      // On verifie QUI repond avant de mesurer. Un autre anvil sur le meme port rendrait des
      // nombres d'une autre chaine, etiquetes MEASURED, qui ne rejoueraient rien.
      assertNodeMatches(await engine.health(cfg.python, cfg.rpcUrl), {
        chainId: cfg.chainId,
        block: plan.block,
      });
      raws = await engine.run(cfg.python, cfg.rpcUrl, plan.block, plan.items);
    } catch (e) {
      const echec = metering.ledger.recordFailure({
        route: "/measure",
        method: "POST",
        payer: who.payer,
        network: who.network,
        scheme: who.scheme,
        units_requested: plan.units,
        unit_price_usd: cfg.unitPriceUsd,
        latency_ms: null,
        error: (e as Error).message.slice(0, 200),
      });
      const slotEchec = enCours.getStore();
      if (slotEchec) slotEchec.receipt = echec;
      return c.json(
        {
          error: "engine unavailable",
          detail: (e as Error).message.slice(0, 300),
          plan: { units: plan.units, block: plan.block },
          note: "no number is returned: a silent engine is a NOT_MEASURABLE, not a zero.",
        },
        503,
      );
    }

    const measurements = raws.map((r) =>
      normalizeMeasurement(r, { source: "live", rpcPlaceholder: "$RPC" }),
    );
    const labels: Partial<Record<Label, number>> = {};
    for (const m of measurements) labels[m.label] = (labels[m.label] ?? 0) + 1;

    const entry = metering.service.recordBatch({
      route: "/measure",
      method: "POST",
      payer: who.payer,
      network: who.network,
      scheme: who.scheme,
      units_requested: plan.units,
      units: measurements.map(toMeasurementUnit),
      unit_price_usd: cfg.unitPriceUsd,
      latency_ms: null,
      error: null,
    });

    // sans ces lignes, un lot REUSSI n'etait jamais raccroche a son reglement
    const slot = enCours.getStore();
    if (slot) {
      slot.receipt = entry;
      slot.block = plan.block;
    }
    // Sans peage (X402_ENABLED=0) il n'y aura pas de reglement, donc pas de hook : on
    // ancre ici, sinon le journal HCS resterait vide en local et ne serait jamais teste.
    if (!paid) void metering.service.anchorBatch(entry, { block: plan.block });

    c.header("X-Tare-Units", String(plan.units));
    c.header("X-Tare-Unit-Price-Usd", String(cfg.unitPriceUsd));
    c.header("X-Tare-Amount-Usd", String(entry.amount_usd));

    return c.json({
      usage_id: entry.batch_id,
      billing: {
        unit: "measurement",
        model: "per-measurement",
        units_requested: plan.units,
        units_executed: measurements.length,
        unit_price_usd: cfg.unitPriceUsd,
        amount_usd: entry.amount_usd,
      },
      plan: { block: plan.block, units: plan.units, resolution: plan.resolution },
      engine_rpc: cfg.rpcUrl,
      count: measurements.length,
      labels,
      measurements: measurements.map((m) => ({ ...m, replay_command: m.replay.command_exact })),
    });
  });

  /* ------------------------------------------------------------- compteur */

  // Le compteur a la mesure et le journal HCS vivent dans ./metering. Hono sert la PREMIERE
  // route enregistree, donc les anciens app.get("/usage") ont ete retires : sans ca le routeur
  // complet (rollups par payeur, reglements, ancrage HCS verifie sur le mirror) restait mort
  // derriere un resume qui ne connaissait ni les reglements ni le topic.
  app.route("/", metering.router);

  // L'identite d'agent HCS-14. Elle ne depend d'aucun etat du serveur : c'est une fonction
  // pure des six champs, et la route en donne de quoi la recalculer sans nous croire.
  app.route("/", createAgentRouter());

  // Le compte : identite par portefeuille, cles d'API, abonnement lu sur la chaine, et
  // l'historique de ce que l'extension et le MCP ont depose. Sans base configuree, chaque
  // route rend 503 en le DISANT — elle ne fait pas semblant de marcher.
  app.route("/", createCompteRouter({ abonnement: configDepuisEnv() }));

  /* --------------------------------------------------------------- graphe */

  // Les traversees structurelles (rayon de souffle, clones, orphelins,
  // contradictions, desaccord registre/mesure). Le graphe est charge UNE fois et
  // memorise par (chemin, mtime, taille) : voir la note de tete de graph-routes.ts.
  app.route("/", createGraphRouter({ chainId: cfg.chainId }));

  /* ------------------------------------------------------------------- rag */

  // La recherche vectorielle sur le corpus declare (docs de methode, 978 fiches du
  // registre, source Solidity des hooks mesures). Chaque morceau indexe a ete
  // PREFIXE d'un en-tete derive du graphe : le graphe nourrit l'index. Voir
  // engine/tare/rag/ pour la construction et src/rag/routes.ts pour les refus.
  app.route("/", createRagRouter({ store: deps.ragStore, embedder: deps.ragEmbedder }));

  /* ------------------------------------------------------------------ route */

  // "je veux echanger A contre B" : le classement des portes mesurees d'une paire,
  // ou l'aveu qu'il n'y en a qu'une. Voir la note de tete de route.ts : la route ne
  // classe que ce qui a un cout mesure, et liste le reste sans lui preter un zero.
  app.route("/", createRouteRouter());

  // POST /alternative — la substitution, atteignable en HTTP. Deux etages : la comparaison
  // est locale et gratuite (et repond « une seule porte » dans 99,71 % des cas), les trois
  // lectures on-chain n'ont lieu QUE si une porte mesuree moins chere existe. Le compte des
  // appels RPC est rendu dans la reponse.
  app.route("/", createAlternativeRouter());

  /* ------------------------------------------------------------ utilitaire */

  app.get("/replay/:id", (c) => {
    const m = loadDataset().byId.get(c.req.param("id"));
    if (!m) return c.text("unknown measurement\n", 404);
    return c.text(m.replay.command_exact + "\n");
  });

  /* --------------------------------------------------- ce qui rate, et ce qu'on en dit */

  /**
   * LE DERNIER FILET. Sans lui, toute exception non rattrapee sortait en
   * `Internal Server Error`, en `text/plain`, sans un mot sur ce qui s'est passe — et un
   * client qui parse du JSON recevait alors une chaine qui n'en est pas, donc une deuxieme
   * erreur qui masquait la premiere.
   *
   * On ne publie PAS la pile : elle porte des chemins de fichiers du serveur. On publie le
   * message, la route, et un identifiant qu'on ecrit aussi dans les journaux du serveur —
   * c'est ce qui permet de relier ce que l'utilisateur voit a ce que l'exploitant lit.
   */
  app.onError((e, c) => {
    const ref = Math.random().toString(36).slice(2, 10);
    console.error(`[api] ${ref} ${c.req.method} ${c.req.path} : ${e.stack ?? e.message}`);
    // Une HTTPException de Hono porte deja son propre statut et sa reponse : on la respecte.
    const httpe = e as Error & { getResponse?: () => Response; status?: number };
    if (typeof httpe.getResponse === "function") return httpe.getResponse();
    return c.json(
      {
        error: "internal error",
        detail: e.message.slice(0, 300),
        route: `${c.req.method} ${c.req.path}`,
        reference: ref,
        note: "the reference also appears in the server logs; the stack is not published, it carries internal paths",
      },
      500,
    );
  });

  /** Un 404 qui dit ou regarder plutot que de laisser deviner. */
  app.notFound((c) =>
    c.json(
      {
        error: "unknown route",
        route: `${c.req.method} ${c.req.path}`,
        note: "GET / lists every route, the account ones included",
      },
      404,
    ),
  );

  return { app, cfg, metering, layer, buildReplay };
}
