/**
 * Les routes du compteur.
 *
 * Porte de CorLens v2 : apps/ai-service/src/controllers/usage.controller.ts.
 * CorLens exposait un seul GET /usage (Fastify + Zod) rendant un rollup par
 * `purpose` depuis le 1er du mois. On garde cette route et sa fenetre, et on
 * ajoute ce qu'un compteur a l'unite doit pouvoir montrer : le detail ligne a
 * ligne, le lot, et la piste d'audit HCS relue sur le mirror node.
 *
 * Ce routeur est un sous-app Hono autonome. Il se monte en une ligne :
 *   app.route("/", meteringRouter(service));
 */
import { Hono } from "hono";
import { hmacGuard } from "./hmac.js";
import { MeteringService } from "./service.js";
import { batchDigest } from "./ledger.js";
import { verifyOnMirror, type HcsConfig } from "./hcs.js";

export interface MeteringRouterOptions {
  /** secret HMAC des routes d'ecriture. null => garde desactivee, et annoncee. */
  hmacSecret?: string | null;
  hmacMaxAgeSeconds?: number;
  /** config Hedera, pour la relecture live d'un message par le mirror node */
  hcs?: HcsConfig | null;
}

export function meteringRouter(service: MeteringService, opts: MeteringRouterOptions = {}) {
  const app = new Hono();
  const guard = hmacGuard({
    secret: opts.hmacSecret ?? null,
    maxAgeSeconds: opts.hmacMaxAgeSeconds ?? 60,
  });

  /** d) le compteur : total de mesures facturees, par payeur, avec les hashes de reglement */
  app.get("/usage", (c) => c.json(service.usage()));

  /** la forme CorLens, conservee telle quelle : rollup depuis le 1er du mois UTC */
  app.get("/usage/rollup", (c) => c.json(service.rollupSinceMonthStart()));

  app.get("/usage/log", (c) => {
    const raw = Number(c.req.query("limit") ?? 100);
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 100, 1000);
    const rows = service.ledger.list(limit);
    return c.json({
      unit: "measurement",
      limit,
      returned: rows.length,
      total_rows_in_memory: service.ledger.size,
      truncated: service.ledger.size > rows.length,
      note: "une ligne = une mesure, pas une requete.",
      rows,
    });
  });

  app.get("/usage/batch/:id", (c) => {
    const id = c.req.param("id");
    const rows = service.ledger.rowsOf(id);
    if (rows.length === 0)
      return c.json({ error: "lot inconnu", batch_id: id }, 404);
    return c.json({
      batch_id: id,
      units_recorded: rows.length,
      units_billed: rows.filter((r) => r.billable).length,
      amount_usd: Number(rows.reduce((a, r) => a + r.amount_usd, 0).toFixed(6)),
      hcs: {
        topic_id: rows[0]?.hcs_topic_id ?? null,
        sequence_number: rows[0]?.hcs_sequence_number ?? null,
      },
      settlement: { transaction: rows[0]?.settlement_tx ?? null, ok: rows[0]?.settlement_ok ?? null },
      rows,
    });
  });

  /** c) le journal HCS, tel que le service le connait */
  app.get("/usage/hcs", (c) => c.json(service.hcsStatus()));

  app.get("/usage/hcs/history", (c) =>
    c.json({
      count: service.anchorHistory().length,
      anchors: service.anchorHistory().map((a) => ({
        batch_id: a.batch_id,
        status: a.status,
        reason: a.reason,
        sequence_number: a.publish?.sequence_number ?? null,
        transaction_id: a.publish?.transaction_id ?? null,
        message: a.publish?.message ?? null,
        message_bytes: a.publish?.message_bytes ?? null,
        charged_tx_fee_tinybar: a.publish?.charged_tx_fee_tinybar ?? null,
        charged_tx_fee_hbar: a.publish?.charged_tx_fee_hbar ?? null,
        fee_note: a.publish?.fee_note ?? null,
        verified_on_mirror: a.verification?.verified ?? null,
        consensus_timestamp: a.verification?.message?.consensus_timestamp ?? null,
        hashscan: a.publish?.hashscan ?? null,
      })),
    }),
  );

  /**
   * Relecture LIVE d'un message par le mirror node. C'est la route qui prouve
   * l'ancrage a un juge : elle ne rend pas ce que TARE croit avoir ecrit, elle
   * rend ce que Hedera a horodate.
   */
  app.get("/usage/hcs/message/:seq", async (c) => {
    const seq = Number(c.req.param("seq"));
    if (!Number.isInteger(seq) || seq <= 0)
      return c.json({ error: "sequence number invalide", value: c.req.param("seq") }, 400);
    const anchor = service.anchor;
    const cfg = opts.hcs ?? null;
    if (!anchor || !cfg)
      return c.json(
        { error: "aucun topic HCS configure", status: "NOT_VERIFIED", sequence_number: seq },
        503,
      );
    const known = service.anchorHistory().find((a) => a.publish?.sequence_number === seq);
    const v = await verifyOnMirror(cfg, anchor.topic_id, seq, known?.publish?.message ?? null, {
      attempts: 3,
      delayMs: 1000,
    });
    return c.json(
      {
        status: v.verified ? "VERIFIED" : "NOT_VERIFIED",
        ...v,
        hashscan: anchor.hashscan,
        note: v.verified
          ? "contenu relu sur le mirror node, octet pour octet."
          : "le mirror n'a pas rendu ce message : NOT_VERIFIED, jamais 'publie quand meme'.",
      },
      v.verified ? 200 : 503,
    );
  });

  /** b) le middleware HMAC : la seule route d'ecriture est signee. */
  app.post("/usage/anchor", guard, async (c) => {
    let body: { batch_id?: unknown } = {};
    try {
      body = (await c.req.json()) as { batch_id?: unknown };
    } catch {
      return c.json({ error: "corps JSON invalide" }, 400);
    }
    const batchId = typeof body.batch_id === "string" ? body.batch_id : null;
    if (!batchId) return c.json({ error: "batch_id manquant" }, 400);
    const rows = service.ledger.rowsOf(batchId);
    if (rows.length === 0) return c.json({ error: "lot inconnu", batch_id: batchId }, 404);

    const billed = rows.filter((r) => r.billable);
    const outcome = await service.anchorBatch({
      batch_id: batchId,
      ts: rows[0]!.ts,
      units_requested: rows.length,
      units_recorded: rows.length,
      units_billed: billed.length,
      unit_price_usd: rows[0]!.unit_price_usd,
      amount_usd: Number(billed.reduce((a, r) => a + r.amount_usd, 0).toFixed(6)),
      by_label: {},
      digest: batchDigest(rows),
      payer: rows[0]!.payer,
      error: rows[0]!.error,
    });
    return c.json(outcome, outcome.ok ? 200 : 503);
  });

  return app;
}

/** Le montage, en une ligne, dans src/app.ts. */
export function mountMetering(
  app: Hono,
  service: MeteringService,
  opts: MeteringRouterOptions = {},
): Hono {
  return app.route("/", meteringRouter(service, opts));
}
