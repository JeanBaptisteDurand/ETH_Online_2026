/**
 * Le compteur d'usage.
 *
 * L'unite facturee est LA MESURE, pas la requete : une requete qui demande cinq
 * tailles coute cinq unites. C'est le point "compute metering rather than a flat
 * per-request charge" — et il n'est credible que si le journal le montre, donc
 * chaque ligne porte units_requested, units_executed et le prix unitaire.
 *
 * Journal en JSONL, append-only, dans apps/api/var/usage.jsonl (hors git).
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Label } from "./labels.js";

export interface UsageEntry {
  id: string;
  ts: string;
  route: string;
  method: string;
  paid: boolean;
  payer: string | null;
  network: string | null;
  scheme: string | null;
  units_requested: number;
  units_executed: number;
  unit_price_usd: number;
  amount_usd: number;
  labels: Partial<Record<Label, number>>;
  settlement: { success: boolean; transaction?: string | null } | null;
  note: string | null;
}

export interface UsageSummary {
  calls: number;
  paid_calls: number;
  units_requested: number;
  units_executed: number;
  amount_usd: number;
  unit: "measurement";
  billing_model: "per-measurement";
  by_payer: Record<string, { calls: number; units: number; amount_usd: number }>;
  by_label: Partial<Record<Label, number>>;
  first_at: string | null;
  last_at: string | null;
}

export class UsageMeter {
  private entries: UsageEntry[] = [];
  private readonly max = 5000;

  constructor(
    private readonly logPath: string | null,
    private readonly unitPriceUsd: number,
  ) {
    if (logPath) {
      try {
        mkdirSync(dirname(logPath), { recursive: true });
        if (existsSync(logPath)) this.replay(logPath);
      } catch {
        /* le journal est un bonus, jamais un point de panne */
      }
    }
  }

  private replay(path: string): void {
    // Le journal est append-only : une meme ligne peut y figurer deux fois, la
    // seconde portant le reglement. On garde la derniere version de chaque id.
    const byId = new Map<string, UsageEntry>();
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as UsageEntry;
        if (e && typeof e.id === "string") byId.set(e.id, { ...e, note: e.note ?? null });
      } catch {
        /* ligne illisible : ignoree, jamais reparee a la devinette */
      }
    }
    this.entries = [...byId.values()];
    if (this.entries.length > this.max) this.entries = this.entries.slice(-this.max);
  }

  record(partial: Omit<UsageEntry, "id" | "ts" | "amount_usd" | "unit_price_usd"> & {
    unit_price_usd?: number;
  }): UsageEntry {
    const unit_price_usd = partial.unit_price_usd ?? this.unitPriceUsd;
    const entry: UsageEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      ...partial,
      unit_price_usd,
      amount_usd: Number((partial.units_requested * unit_price_usd).toFixed(6)),
    };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    if (this.logPath) {
      try {
        appendFileSync(this.logPath, JSON.stringify(entry) + "\n");
      } catch {
        /* idem */
      }
    }
    return entry;
  }

  /**
   * Rattache le resultat du reglement a la derniere ligne qui n'en a pas.
   * Le reglement x402 arrive APRES la reponse du handler : sans ce raccroc, le
   * journal dirait "paye" sans jamais dire "regle".
   */
  attachSettlement(payer: string | null, settlement: { success: boolean; transaction: string | null }): boolean {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (!e || !e.paid || e.settlement) continue;
      if (payer && e.payer && e.payer !== payer) continue;
      e.settlement = settlement;
      if (!e.payer && payer) e.payer = payer;
      if (this.logPath) {
        try {
          appendFileSync(this.logPath, JSON.stringify(e) + "\n");
        } catch {
          /* le journal est un bonus */
        }
      }
      return true;
    }
    return false;
  }

  list(limit = 100): UsageEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  summary(): UsageSummary {
    const s: UsageSummary = {
      calls: this.entries.length,
      paid_calls: 0,
      units_requested: 0,
      units_executed: 0,
      amount_usd: 0,
      unit: "measurement",
      billing_model: "per-measurement",
      by_payer: {},
      by_label: {},
      first_at: this.entries[0]?.ts ?? null,
      last_at: this.entries[this.entries.length - 1]?.ts ?? null,
    };
    for (const e of this.entries) {
      if (e.paid) s.paid_calls += 1;
      s.units_requested += e.units_requested;
      s.units_executed += e.units_executed;
      s.amount_usd += e.amount_usd;
      const payer = e.payer ?? "(non paye)";
      const bucket = (s.by_payer[payer] ??= { calls: 0, units: 0, amount_usd: 0 });
      bucket.calls += 1;
      bucket.units += e.units_requested;
      bucket.amount_usd = Number((bucket.amount_usd + e.amount_usd).toFixed(6));
      for (const [label, n] of Object.entries(e.labels)) {
        const k = label as Label;
        s.by_label[k] = (s.by_label[k] ?? 0) + (n as number);
      }
    }
    s.amount_usd = Number(s.amount_usd.toFixed(6));
    return s;
  }
}
