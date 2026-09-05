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
import { engineHealth, runPlans, type EngineHealth } from "./engine.js";
import { createMetering, toMeasurementUnit } from "./metering/index.js";
import { createGraphRouter } from "./graph-routes.js";
import { createRagRouter } from "./rag/index.js";
import { createRouteRouter } from "./route.js";
import { createPaymentLayer, payerFromHeader, priceFor } from "./x402.js";
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
  "1. Le modele ne produit jamais un nombre : il choisit quoi interroger et explique ce qui revient.",
  "2. Chaque mesure porte une etiquette : MEASURED | INTERPOLATED | NOT_MEASURABLE | NOT_QUOTABLE.",
  "3. Une lecture bornee ou tronquee est un NOT_MEASURABLE, jamais une valeur.",
  "4. Chaque valeur porte son bloc, sa taille et son sens, et se rejoue en une commande.",
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
      what: "Mesure ce qu'un hook Uniswap v4 prend reellement sur un swap.",
      method:
        "Sur un fork epingle, anvil_setCode remplace le bytecode du hook par un stub inerte de 89 octets. Le pool ne bouge pas ; seul le code du hook change. On cote le meme swap deux fois. L'ecart EST ce que le hook a pris.",
      honesty_rules: HONESTY,
      routes: [
        "GET  /hooks               le classement par hook",
        "GET  /hook/:address       la fiche : tous les profils du hook",
        "GET  /measurement/:id     une mesure et sa commande de rejeu",
        "POST /measure             la mesure a la demande (payante, x402)",
        "GET  /usage               le compteur, unite = 1 mesure",
        "GET  /meta                sources, moteur, peage",
        "GET  /graph               le graphe : ce que les traversees revelent",
        "GET  /rag/search?q=..     les passages du corpus, avec fichier, ligne et distance",
        "GET  /rag/meta            l'etat de l'index vectoriel, lu en base",
        "GET  /route?currency0=..&currency1=..  par quel pool passer, et ce que ca coute",
      ],
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
            ? "aucun fichier de registre dans docs/ : le champ registry vaut null partout, ce qui ne veut PAS dire 'absent du registre'"
            : "registre charge : registry=null signifie alors 'absent du registre officiel'",
      },
      pools_with_liquidity: loadPools().length,
      engine: health,
      x402: cfg.x402Enabled
        ? layer.describe()
        : { enabled: false, note: "peage desactive (X402_ENABLED=0)" },
      billing: {
        unit: "measurement",
        model: "per-measurement",
        unit_price_usd: cfg.unitPriceUsd,
        example: `3 mesures => ${priceFor(3, cfg.unitPriceUsd)}`,
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
      return c.json({ error: "adresse invalide", address: c.req.param("address") }, 400);

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
          note: "aucune mesure publiee pour ce hook. Ce n'est pas un zero : c'est une absence de mesure.",
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

  /* ------------------------------------------------------------- une mesure */

  app.get("/measurement/:id", (c) => {
    const id = c.req.param("id");
    const ds = loadDataset();
    const m = ds.byId.get(id);
    if (!m)
      return c.json(
        {
          error: "mesure inconnue",
          id,
          hint: "les ids sont deterministes : sha256(chain|bloc|hook|pool|sens|taille). Liste-les via /hooks puis /hook/:address.",
        },
        404,
      );
    return c.json({
      ...m,
      replay_command: m.replay.command_exact,
      how_to_replay: [
        "1. docker compose up -d   (fork anvil epingle au bloc)",
        `2. ${m.replay.command_exact}`,
        `   ou, court : ${m.replay.command}`,
      ],
    });
  });

  /* ------------------------------------------------------- la route payante */

  const metering = createMetering({ unitPriceUsd: cfg.unitPriceUsd });
  let lastBatchId: string | null = null;
  const layer = createPaymentLayer(cfg, {
    facilitator: deps.facilitator,
    // Le hash de reglement x402 arrive APRES la reponse : on le raccroche au dernier lot.
    onSettled: (payer, st) => {
      if (lastBatchId) metering.service.attachSettlement(lastBatchId, { ...st, payer });
    },
  });

  // 1) on valide le plan AVANT le peage : personne ne paie pour une requete
  //    qu'on ne saurait pas executer.
  app.use("/measure", async (c, next) => {
    if (c.req.method !== "POST") return next();
    let body: Record<string, unknown> = {};
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
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
            hook: "0x… (un hook connu de docs/pools-liquides.json)",
            pool_id: "0x… (un pool deja mesure)",
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
    const paymentHeader = c.req.header("X-PAYMENT");
    const who = payerFromHeader(paymentHeader);
    const paid = cfg.x402Enabled && Boolean(paymentHeader);

    let raws;
    try {
      raws = await engine.run(cfg.python, cfg.rpcUrl, plan.block, plan.items);
    } catch (e) {
      lastBatchId = (metering.ledger.recordFailure({
        route: "/measure",
        method: "POST",
        payer: who.payer,
        network: who.network,
        scheme: who.scheme,
        units_requested: plan.units,
        unit_price_usd: cfg.unitPriceUsd,
        latency_ms: null,
        error: (e as Error).message.slice(0, 200),
      })).batch_id;
      return c.json(
        {
          error: "moteur indisponible",
          detail: (e as Error).message.slice(0, 300),
          plan: { units: plan.units, block: plan.block },
          note: "aucun nombre n'est renvoye : un moteur muet est un NOT_MEASURABLE, pas un zero.",
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

  /* ------------------------------------------------------------ utilitaire */

  app.get("/replay/:id", (c) => {
    const m = loadDataset().byId.get(c.req.param("id"));
    if (!m) return c.text("mesure inconnue\n", 404);
    return c.text(m.replay.command_exact + "\n");
  });

  return { app, cfg, metering, layer, buildReplay };
}
