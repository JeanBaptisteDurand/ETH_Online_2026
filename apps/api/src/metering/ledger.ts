/**
 * Le registre des unites facturees.
 *
 * Porte de CorLens v2 : apps/ai-service/src/repositories/prompt-log.repo.ts.
 * CorLens ecrivait UNE ligne par appel de modele, puis agregait par `purpose`
 * avec un groupBy Prisma. Ici :
 *
 *   - le stockage Prisma/Postgres devient un JSONL append-only. TARE n'a pas de
 *     base ; ajouter Postgres pour un compteur serait un poste de panne de plus.
 *   - `purpose` devient `payer` : ce qu'on veut voir, c'est qui doit combien.
 *   - et surtout : L'UNITE N'EST PLUS L'APPEL, C'EST LA MESURE. Une requete qui
 *     demande 5 tailles x 2 sens ecrit DIX lignes, pas une. Le groupBy compte
 *     des mesures. C'est tout l'ecart entre "pay-per-call" et le
 *     "per-measurement metering" que ce lot doit prouver : la preuve est dans
 *     le fait qu'il y ait dix lignes.
 *
 * Regle dure n.3 appliquee a la facturation : une mesure etiquetee
 * NOT_MEASURABLE n'est PAS facturee. Une lecture bornee, un timeout, un moteur
 * muet ne produisent pas d'unite. On ne facture pas un silence.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Label } from "../labels.js";

/** Les etiquettes qui correspondent a un travail reellement effectue. */
export const DEFAULT_BILLABLE_LABELS: readonly Label[] = [
  "MEASURED",
  "INTERPOLATED",
  "NOT_QUOTABLE",
];

export interface MeasurementUnit {
  /** identifiant deterministe de la mesure (src/measurement.ts) quand il existe */
  measurement_id: string | null;
  hook: string;
  pool_id: string;
  block_number: number;
  amount_in: string;
  direction: "0->1" | "1->0";
  label: Label;
  bps: number | null;
}

export interface BatchInput {
  route: string;
  method: string;
  payer: string | null;
  network: string | null;
  scheme: string | null;
  /** ce que le plan avait promis, avant execution */
  units_requested: number;
  units: MeasurementUnit[];
  unit_price_usd: number;
  latency_ms: number | null;
  /** renseigne quand le moteur n'a rien rendu : aucune unite n'est alors facturee */
  error: string | null;
}

export interface UnitRow {
  /** identite de la LIGNE de registre (unique, meme si la mesure est rejouee) */
  id: string;
  batch_id: string;
  ts: string;
  route: string;
  method: string;
  payer: string | null;
  network: string | null;
  scheme: string | null;
  measurement_id: string | null;
  hook: string;
  pool_id: string;
  block_number: number;
  amount_in: string;
  direction: "0->1" | "1->0";
  label: Label;
  bps: number | null;
  billable: boolean;
  unit_price_usd: number;
  amount_usd: number;
  /** hash de reglement x402, raccroche apres coup */
  settlement_tx: string | null;
  settlement_ok: boolean | null;
  /** ancrage HCS, raccroche apres publication */
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
  latency_ms: number | null;
  error: string | null;
}

export interface BatchReceipt {
  batch_id: string;
  ts: string;
  units_requested: number;
  units_recorded: number;
  units_billed: number;
  unit_price_usd: number;
  amount_usd: number;
  by_label: Partial<Record<Label, number>>;
  /** empreinte canonique du lot — c'est ELLE qui part sur HCS */
  digest: string;
  payer: string | null;
  error: string | null;
}

export interface PayerRollup {
  payer: string;
  batches: number;
  units_recorded: number;
  units_billed: number;
  amount_usd: number;
  by_label: Partial<Record<Label, number>>;
  settlements: Array<{ transaction: string; ok: boolean; units: number }>;
  first_at: string;
  last_at: string;
}

/**
 * Empreinte canonique d'un lot : sha256 sur une serialisation ordonnee et
 * stable. Deux processus qui voient les memes mesures publient la meme
 * empreinte — sinon l'ancrage HCS ne prouverait rien.
 */
export function batchDigest(rows: readonly UnitRow[]): string {
  const canonical = rows
    .map((r) =>
      [
        r.measurement_id ?? "-",
        r.hook.toLowerCase(),
        r.pool_id.toLowerCase(),
        r.block_number,
        r.amount_in,
        r.direction,
        r.label,
        r.bps === null ? "-" : r.bps.toFixed(6),
        r.billable ? "1" : "0",
        r.amount_usd.toFixed(6),
      ].join("|"),
    )
    .sort()
    .join("\n");
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

export interface LedgerOptions {
  /** chemin du JSONL. `null` ou "" => registre purement en memoire. */
  path: string | null;
  billableLabels?: readonly Label[];
  /** nombre max de lignes gardees en memoire */
  maxRows?: number;
}

export class MeteringLedger {
  private rows: UnitRow[] = [];
  private readonly billable: ReadonlySet<Label>;
  private readonly maxRows: number;
  readonly path: string | null;
  /** lignes du JSONL qu'on n'a pas su relire. Jamais reparees a la devinette. */
  readonly rejectedLines: number[] = [];

  constructor(opts: LedgerOptions) {
    this.path = opts.path && opts.path.length > 0 ? opts.path : null;
    this.billable = new Set(opts.billableLabels ?? DEFAULT_BILLABLE_LABELS);
    this.maxRows = opts.maxRows ?? 20000;
    if (this.path) {
      try {
        mkdirSync(dirname(this.path), { recursive: true });
        if (existsSync(this.path)) this.replay(this.path);
      } catch {
        /* le journal disque est un bonus, jamais un point de panne */
      }
    }
  }

  private replay(path: string): void {
    const byId = new Map<string, UnitRow>();
    const lines = readFileSync(path, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = (lines[i] ?? "").trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t) as UnitRow;
        if (r && typeof r.id === "string" && typeof r.batch_id === "string") byId.set(r.id, r);
        else this.rejectedLines.push(i + 1);
      } catch {
        this.rejectedLines.push(i + 1);
      }
    }
    this.rows = [...byId.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    if (this.rows.length > this.maxRows) this.rows = this.rows.slice(-this.maxRows);
  }

  private write(row: UnitRow): void {
    if (!this.path) return;
    try {
      appendFileSync(this.path, JSON.stringify(row) + "\n");
    } catch {
      /* idem */
    }
  }

  isBillable(label: Label): boolean {
    return this.billable.has(label);
  }

  /** Une requete => N lignes, une par mesure. C'est le coeur du lot. */
  recordBatch(input: BatchInput): BatchReceipt {
    const batch_id = "b_" + randomUUID().replace(/-/g, "").slice(0, 20);
    const ts = new Date().toISOString();
    const rows: UnitRow[] = input.units.map((u, i) => {
      const billable = input.error === null && this.isBillable(u.label);
      return {
        id: `${batch_id}:${i}`,
        batch_id,
        ts,
        route: input.route,
        method: input.method,
        payer: input.payer,
        network: input.network,
        scheme: input.scheme,
        measurement_id: u.measurement_id,
        hook: u.hook.toLowerCase(),
        pool_id: u.pool_id.toLowerCase(),
        block_number: u.block_number,
        amount_in: u.amount_in,
        direction: u.direction,
        label: u.label,
        bps: u.bps,
        billable,
        unit_price_usd: input.unit_price_usd,
        amount_usd: billable ? Number(input.unit_price_usd.toFixed(6)) : 0,
        settlement_tx: null,
        settlement_ok: null,
        hcs_topic_id: null,
        hcs_sequence_number: null,
        latency_ms: input.latency_ms,
        error: input.error,
      };
    });

    for (const r of rows) {
      this.rows.push(r);
      this.write(r);
    }
    while (this.rows.length > this.maxRows) this.rows.shift();

    const by_label: Partial<Record<Label, number>> = {};
    for (const r of rows) by_label[r.label] = (by_label[r.label] ?? 0) + 1;
    const units_billed = rows.filter((r) => r.billable).length;

    return {
      batch_id,
      ts,
      units_requested: input.units_requested,
      units_recorded: rows.length,
      units_billed,
      unit_price_usd: input.unit_price_usd,
      amount_usd: Number((units_billed * input.unit_price_usd).toFixed(6)),
      by_label,
      digest: batchDigest(rows),
      payer: input.payer,
      error: input.error,
    };
  }

  /**
   * Une requete qui n'a produit AUCUNE mesure. On l'inscrit quand meme, a zero
   * unite : le registre doit montrer les pannes, pas les taire.
   */
  recordFailure(input: Omit<BatchInput, "units">): BatchReceipt {
    return this.recordBatch({ ...input, units: [] });
  }

  rowsOf(batchId: string): UnitRow[] {
    return this.rows.filter((r) => r.batch_id === batchId);
  }

  /** Le hash de reglement x402 arrive APRES la reponse : on le raccroche ici. */
  attachSettlement(
    batchId: string,
    settlement: {
      success: boolean;
      transaction: string | null;
      payer?: string | null;
      /** le reseau CAIP-2 tel que le RENDS le reglement, jamais celui qu'on esperait */
      network?: string | null;
    },
  ): number {
    let n = 0;
    for (const r of this.rows) {
      if (r.batch_id !== batchId) continue;
      r.settlement_tx = settlement.transaction;
      r.settlement_ok = settlement.success;
      // Le payeur et le reseau ne sont lisibles qu'au reglement : l'en-tete de paiement
      // Hedera porte une transaction serialisee, pas des champs JSON. On complete ce
      // qu'on ne savait pas ; on n'ecrase jamais ce qu'on savait deja.
      if (!r.payer && settlement.payer) r.payer = settlement.payer;
      if (!r.network && settlement.network) r.network = settlement.network;
      this.write(r);
      n++;
    }
    return n;
  }

  /** Idem pour l'ancrage HCS : sequence number et topic, une fois publies. */
  attachAnchor(batchId: string, anchor: { topic_id: string; sequence_number: number }): number {
    let n = 0;
    for (const r of this.rows) {
      if (r.batch_id !== batchId) continue;
      r.hcs_topic_id = anchor.topic_id;
      r.hcs_sequence_number = anchor.sequence_number;
      this.write(r);
      n++;
    }
    return n;
  }

  /** Les lots pas encore ancres sur HCS, du plus ancien au plus recent. */
  unanchoredBatches(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of this.rows) {
      if (r.hcs_sequence_number !== null || seen.has(r.batch_id)) continue;
      seen.add(r.batch_id);
      out.push(r.batch_id);
    }
    return out;
  }

  list(limit = 100): UnitRow[] {
    return this.rows.slice(-limit).reverse();
  }

  get size(): number {
    return this.rows.length;
  }

  private since(sinceIso: string | null): UnitRow[] {
    if (!sinceIso) return this.rows;
    return this.rows.filter((r) => r.ts >= sinceIso);
  }

  /** Le groupBy de CorLens, par payeur au lieu de par `purpose`. */
  rollupByPayer(sinceIso: string | null = null): PayerRollup[] {
    const acc = new Map<string, PayerRollup & { _batches: Set<string>; _tx: Map<string, { ok: boolean; units: number }> }>();
    for (const r of this.since(sinceIso)) {
      const key = r.payer ?? "(non paye)";
      let e = acc.get(key);
      if (!e) {
        e = {
          payer: key,
          batches: 0,
          units_recorded: 0,
          units_billed: 0,
          amount_usd: 0,
          by_label: {},
          settlements: [],
          first_at: r.ts,
          last_at: r.ts,
          _batches: new Set(),
          _tx: new Map(),
        };
        acc.set(key, e);
      }
      e._batches.add(r.batch_id);
      e.units_recorded += 1;
      if (r.billable) e.units_billed += 1;
      e.amount_usd += r.amount_usd;
      e.by_label[r.label] = (e.by_label[r.label] ?? 0) + 1;
      if (r.ts < e.first_at) e.first_at = r.ts;
      if (r.ts > e.last_at) e.last_at = r.ts;
      if (r.settlement_tx) {
        const t = e._tx.get(r.settlement_tx) ?? { ok: r.settlement_ok ?? false, units: 0 };
        t.units += 1;
        t.ok = r.settlement_ok ?? t.ok;
        e._tx.set(r.settlement_tx, t);
      }
    }
    return [...acc.values()]
      .map((e) => ({
        payer: e.payer,
        batches: e._batches.size,
        units_recorded: e.units_recorded,
        units_billed: e.units_billed,
        amount_usd: Number(e.amount_usd.toFixed(6)),
        by_label: e.by_label,
        settlements: [...e._tx.entries()].map(([transaction, v]) => ({
          transaction,
          ok: v.ok,
          units: v.units,
        })),
        first_at: e.first_at,
        last_at: e.last_at,
      }))
      .sort((a, b) => b.units_billed - a.units_billed || a.payer.localeCompare(b.payer));
  }

  rollupByLabel(sinceIso: string | null = null): Partial<Record<Label, number>> {
    const out: Partial<Record<Label, number>> = {};
    for (const r of this.since(sinceIso)) out[r.label] = (out[r.label] ?? 0) + 1;
    return out;
  }

  rollupByHook(
    sinceIso: string | null = null,
  ): Array<{ hook: string; units_recorded: number; units_billed: number; amount_usd: number }> {
    const acc = new Map<string, { units_recorded: number; units_billed: number; amount_usd: number }>();
    for (const r of this.since(sinceIso)) {
      const e = acc.get(r.hook) ?? { units_recorded: 0, units_billed: 0, amount_usd: 0 };
      e.units_recorded += 1;
      if (r.billable) e.units_billed += 1;
      e.amount_usd = Number((e.amount_usd + r.amount_usd).toFixed(6));
      acc.set(r.hook, e);
    }
    return [...acc.entries()]
      .map(([hook, v]) => ({ hook, ...v }))
      .sort((a, b) => b.units_billed - a.units_billed);
  }

  totals(sinceIso: string | null = null): {
    since: string | null;
    batches: number;
    units_recorded: number;
    units_billed: number;
    units_unbilled: number;
    amount_usd: number;
    amount_settled_usd: number;
    credit_units: number;
    credit_usd: number;
    first_at: string | null;
    last_at: string | null;
    settled_transactions: number;
    anchored_units: number;
  } {
    const rows = this.since(sinceIso);
    const batches = new Set<string>();
    const tx = new Set<string>();
    let billed = 0;
    let amount = 0;
    let anchored = 0;
    // x402 encaisse AVANT que le moteur ne tourne : le prix est fige au 402, l'argent
    // bouge au reglement, et l'etiquette n'existe qu'apres. Une unite NOT_MEASURABLE est
    // donc payee puis declaree non facturable — les deux a la fois. Dire seulement
    // `amount_usd: 0` presenterait comme gratuit ce qui a bel et bien ete preleve.
    // On tient donc les deux chiffres, et leur ecart : c'est un CREDIT du, pas un zero.
    let settledAmount = 0;
    let creditUnits = 0;
    let creditAmount = 0;
    for (const r of rows) {
      batches.add(r.batch_id);
      if (r.billable) billed += 1;
      amount += r.amount_usd;
      if (r.settlement_tx) tx.add(r.settlement_tx);
      if (r.settlement_ok === true) {
        settledAmount += r.unit_price_usd;
        if (!r.billable) {
          creditUnits += 1;
          creditAmount += r.unit_price_usd;
        }
      }
      if (r.hcs_sequence_number !== null) anchored += 1;
    }
    return {
      since: sinceIso,
      batches: batches.size,
      units_recorded: rows.length,
      units_billed: billed,
      units_unbilled: rows.length - billed,
      amount_usd: Number(amount.toFixed(6)),
      amount_settled_usd: Number(settledAmount.toFixed(6)),
      credit_units: creditUnits,
      credit_usd: Number(creditAmount.toFixed(6)),
      first_at: rows[0]?.ts ?? null,
      last_at: rows[rows.length - 1]?.ts ?? null,
      settled_transactions: tx.size,
      anchored_units: anchored,
    };
  }
}
