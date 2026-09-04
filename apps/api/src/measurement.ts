/**
 * La forme normalisee d'une mesure, et son identite.
 *
 * Regle dure n.4 : chaque valeur affichee porte son bloc, sa taille et son sens,
 * et se rejoue en une commande. Ces quatre choses sont des champs obligatoires ici.
 */
import { createHash } from "node:crypto";
import { resolveLabel, canCarryNumber, type Label } from "./labels.js";

export interface RawMeasurement {
  hook: string;
  pool_id: string;
  chain_id?: number;
  block_number: number;
  currency0?: string;
  currency1?: string;
  key_fee?: number;
  tick_spacing?: number;
  fee_is_dynamic?: boolean;
  stored_lp_fee?: number | null;
  stored_protocol_fee?: number | null;
  zero_for_one: boolean;
  amount_in: string | number;
  out_with?: string | null;
  out_without?: string | null;
  bps?: number | null;
  label: string;
  reason?: string | null;
  stub_hash?: string | null;
  engine_ver?: string | null;
  observed_at?: string | null;
}

export interface Replay {
  /** la commande courte publiee dans le README */
  command: string;
  /** la commande qui rejoue EXACTEMENT ce pool, cette taille, ce sens */
  command_exact: string;
  block_number: number;
  amount_in: string;
  zero_for_one: boolean;
}

export interface Measurement {
  id: string;
  hook: string;
  pool_id: string;
  chain_id: number;
  block_number: number;
  currency0: string | null;
  currency1: string | null;
  key_fee: number | null;
  tick_spacing: number | null;
  fee_is_dynamic: boolean | null;
  stored_lp_fee: number | null;
  stored_protocol_fee: number | null;
  zero_for_one: boolean;
  /** le sens, ecrit pour un humain */
  direction: "0->1" | "1->0";
  amount_in: string;
  out_with: string | null;
  out_without: string | null;
  bps: number | null;
  label: Label;
  label_source: string;
  reason: string | null;
  stub_hash: string | null;
  engine_ver: string | null;
  observed_at: string | null;
  source: string;
  replay: Replay;
}

function lower(a: unknown): string | null {
  return typeof a === "string" ? a.toLowerCase() : null;
}

/**
 * Identite deterministe d'une mesure : ce qui la definit physiquement.
 * Deux relectures du meme fichier donnent le meme id ; deux tailles donnent deux ids.
 */
export function measurementId(m: {
  chain_id: number;
  block_number: number;
  hook: string;
  pool_id: string;
  zero_for_one: boolean;
  amount_in: string;
}): string {
  const canonical = [
    m.chain_id,
    m.block_number,
    m.hook.toLowerCase(),
    m.pool_id.toLowerCase(),
    m.zero_for_one ? "1" : "0",
    m.amount_in,
  ].join("|");
  return "m_" + createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export interface NormalizeOptions {
  source: string;
  /** valeur de RPC affichee dans la commande de rejeu exacte */
  rpcPlaceholder?: string;
}

export function normalizeMeasurement(raw: RawMeasurement, opts: NormalizeOptions): Measurement {
  const { label, label_source, translation_note } = resolveLabel(raw.label);
  const chain_id = typeof raw.chain_id === "number" ? raw.chain_id : 8453;
  const amount_in = String(raw.amount_in);
  const hook = String(raw.hook).toLowerCase();
  const pool_id = String(raw.pool_id).toLowerCase();
  const zero_for_one = Boolean(raw.zero_for_one);
  const block_number = Number(raw.block_number);

  // Regle n.3 : un nombre ne survit pas a une etiquette qui ne peut pas le porter.
  const numeric = canCarryNumber(label);
  const bps = numeric && typeof raw.bps === "number" && Number.isFinite(raw.bps) ? raw.bps : null;

  const reasons: string[] = [];
  if (raw.reason) reasons.push(String(raw.reason));
  if (translation_note) reasons.push(translation_note);
  if (!numeric && typeof raw.bps === "number") reasons.push("bps_dropped:label_is_not_numeric");

  const id = measurementId({ chain_id, block_number, hook, pool_id, zero_for_one, amount_in });

  return {
    id,
    hook,
    pool_id,
    chain_id,
    block_number,
    currency0: lower(raw.currency0),
    currency1: lower(raw.currency1),
    key_fee: typeof raw.key_fee === "number" ? raw.key_fee : null,
    tick_spacing: typeof raw.tick_spacing === "number" ? raw.tick_spacing : null,
    fee_is_dynamic: typeof raw.fee_is_dynamic === "boolean" ? raw.fee_is_dynamic : null,
    stored_lp_fee: typeof raw.stored_lp_fee === "number" ? raw.stored_lp_fee : null,
    stored_protocol_fee:
      typeof raw.stored_protocol_fee === "number" ? raw.stored_protocol_fee : null,
    zero_for_one,
    direction: zero_for_one ? "0->1" : "1->0",
    amount_in,
    out_with: raw.out_with == null ? null : String(raw.out_with),
    out_without: raw.out_without == null ? null : String(raw.out_without),
    bps,
    label,
    label_source,
    reason: reasons.length ? reasons.join(" ; ") : null,
    stub_hash: raw.stub_hash ?? null,
    engine_ver: raw.engine_ver ?? null,
    observed_at: raw.observed_at ?? null,
    source: opts.source,
    replay: buildReplay(
      {
        hook,
        block_number,
        amount_in,
        zero_for_one,
        currency0: lower(raw.currency0),
        currency1: lower(raw.currency1),
        key_fee: typeof raw.key_fee === "number" ? raw.key_fee : null,
        tick_spacing: typeof raw.tick_spacing === "number" ? raw.tick_spacing : null,
      },
      opts.rpcPlaceholder ?? "$RPC",
    ),
  };
}

export function buildReplay(
  m: {
    hook: string;
    block_number: number;
    amount_in: string;
    zero_for_one: boolean;
    currency0: string | null;
    currency1: string | null;
    key_fee: number | null;
    tick_spacing: number | null;
  },
  rpc: string,
): Replay {
  const short = `make measure HOOK=${m.hook} BLOCK=${m.block_number}`;
  const parts = [
    "python3 apps/api/scripts/measure_one.py",
    `--rpc ${rpc}`,
    `--block ${m.block_number}`,
    `--hooks ${m.hook}`,
    m.currency0 ? `--currency0 ${m.currency0}` : null,
    m.currency1 ? `--currency1 ${m.currency1}` : null,
    m.key_fee !== null ? `--fee ${m.key_fee}` : null,
    m.tick_spacing !== null ? `--tick-spacing ${m.tick_spacing}` : null,
    `--zero-for-one ${m.zero_for_one}`,
    `--amount-in ${m.amount_in}`,
  ].filter(Boolean);
  return {
    command: short,
    command_exact: parts.join(" "),
    block_number: m.block_number,
    amount_in: m.amount_in,
    zero_for_one: m.zero_for_one,
  };
}
