/**
 * Le service d'usage.
 *
 * Porte de CorLens v2 : apps/ai-service/src/services/usage.service.ts. CorLens
 * n'avait qu'une methode, `rollupSinceMonthStart()`, qui agregeait des appels de
 * modele par `purpose`. On la garde a l'identique dans sa FORME (meme fenetre :
 * depuis le 1er du mois UTC) et on change son CONTENU : elle agrege des MESURES
 * par payeur.
 *
 * S'y ajoute ce que CorLens n'avait pas : l'ancrage du lot sur HCS. Le compteur
 * dit combien on doit ; le topic HCS dit que le compteur ne peut plus etre
 * reecrit apres coup.
 */
import type { Label } from "../labels.js";
import {
  MeteringLedger,
  type BatchInput,
  type BatchReceipt,
  type PayerRollup,
  type UnitRow,
} from "./ledger.js";
import {
  HCS_SCHEMA,
  hashscanTopic,
  publishAnchor,
  verifyOnMirror,
  type AnchorPayload,
  type HcsConfig,
  type MirrorVerification,
  type PublishResult,
} from "./hcs.js";

/** Ce que le service attend d'un ancreur. Injectable : les tests n'ecrivent pas sur Hedera. */
export interface AnchorPublisher {
  readonly topic_id: string;
  readonly network: string;
  readonly hashscan: string;
  publish(payload: AnchorPayload): Promise<PublishResult>;
  verify(sequenceNumber: number, expectedMessage: string | null): Promise<MirrorVerification>;
}

/** L'ancreur reel : Hedera testnet, via @hiero-ledger/sdk deja installe. */
export function hederaAnchorPublisher(cfg: HcsConfig, topicId: string): AnchorPublisher {
  return {
    topic_id: topicId,
    network: cfg.network,
    hashscan: hashscanTopic(cfg.network, topicId),
    publish: (payload) => publishAnchor(cfg, topicId, payload),
    verify: (seq, expected) => verifyOnMirror(cfg, topicId, seq, expected),
  };
}

export interface AnchorOutcome {
  ok: boolean;
  /** NOT_ANCHORED n'est jamais promu en ANCHORED : l'echec reste lisible. */
  status: "ANCHORED" | "NOT_ANCHORED";
  batch_id: string;
  reason: string | null;
  publish: PublishResult | null;
  verification: MirrorVerification | null;
}

export interface MeteringServiceOptions {
  ledger: MeteringLedger;
  anchor?: AnchorPublisher | null;
  /** verifie chaque publication sur le mirror avant de la declarer ancree */
  verifyOnPublish?: boolean;
}

export class MeteringService {
  readonly ledger: MeteringLedger;
  readonly anchor: AnchorPublisher | null;
  private readonly verifyOnPublish: boolean;
  private readonly anchors: AnchorOutcome[] = [];

  constructor(opts: MeteringServiceOptions) {
    this.ledger = opts.ledger;
    this.anchor = opts.anchor ?? null;
    this.verifyOnPublish = opts.verifyOnPublish ?? true;
  }

  recordBatch(input: BatchInput): BatchReceipt {
    return this.ledger.recordBatch(input);
  }

  attachSettlement(
    batchId: string,
    settlement: { success: boolean; transaction: string | null; payer?: string | null },
  ): number {
    return this.ledger.attachSettlement(batchId, settlement);
  }

  /** La fenetre de CorLens, gardee telle quelle : depuis le 1er du mois, UTC. */
  static monthStartIso(now: Date = new Date()): string {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }

  /** rollupSinceMonthStart() de CorLens — `byPurpose` devient `byPayer`. */
  rollupSinceMonthStart(now: Date = new Date()): {
    since: string;
    unit: "measurement";
    byPayer: PayerRollup[];
  } {
    const since = MeteringService.monthStartIso(now);
    return { since, unit: "measurement", byPayer: this.ledger.rollupByPayer(since) };
  }

  /** Le corps de GET /usage. */
  usage(now: Date = new Date()): Record<string, unknown> {
    const monthStart = MeteringService.monthStartIso(now);
    const all = this.ledger.totals(null);
    const month = this.ledger.totals(monthStart);
    return {
      billing: {
        unit: "measurement",
        model: "per-measurement",
        definition:
          "Une unite = UNE mesure = une paire de cotations du meme swap (avec le hook, puis avec le stub inerte de 89 octets). Une requete qui demande 5 tailles x 2 sens vaut 10 unites, pas 1.",
        not_billed:
          "Une mesure etiquetee NOT_MEASURABLE n'est pas facturee : lecture bornee, timeout ou moteur muet ne produisent pas d'unite.",
      },
      totals: all,
      since_month_start: month,
      by_payer: this.ledger.rollupByPayer(null),
      by_label: this.ledger.rollupByLabel(null),
      by_hook: this.ledger.rollupByHook(null).slice(0, 25),
      settlements: this.settlements(),
      hcs: this.hcsStatus(),
      ledger: {
        path: this.ledger.path,
        rows_in_memory: this.ledger.size,
        rejected_lines: this.ledger.rejectedLines.length,
      },
    };
  }

  /** Les hashes de reglement, un par transaction, avec ce qu'ils ont paye. */
  settlements(): Array<{
    transaction: string;
    ok: boolean;
    payer: string | null;
    network: string | null;
    units: number;
    amount_usd: number;
    batches: string[];
    hcs_sequence_numbers: number[];
  }> {
    const acc = new Map<
      string,
      {
        transaction: string;
        ok: boolean;
        payer: string | null;
        network: string | null;
        units: number;
        amount_usd: number;
        batches: Set<string>;
        seqs: Set<number>;
      }
    >();
    for (const r of this.ledger.list(Number.MAX_SAFE_INTEGER)) {
      if (!r.settlement_tx) continue;
      const e = acc.get(r.settlement_tx) ?? {
        transaction: r.settlement_tx,
        ok: r.settlement_ok ?? false,
        payer: r.payer,
        network: r.network,
        units: 0,
        amount_usd: 0,
        batches: new Set<string>(),
        seqs: new Set<number>(),
      };
      if (r.billable) e.units += 1;
      e.amount_usd = Number((e.amount_usd + r.amount_usd).toFixed(6));
      e.batches.add(r.batch_id);
      if (r.hcs_sequence_number !== null) e.seqs.add(r.hcs_sequence_number);
      acc.set(r.settlement_tx, e);
    }
    return [...acc.values()].map((e) => ({
      transaction: e.transaction,
      ok: e.ok,
      payer: e.payer,
      network: e.network,
      units: e.units,
      amount_usd: e.amount_usd,
      batches: [...e.batches],
      hcs_sequence_numbers: [...e.seqs].sort((a, b) => a - b),
    }));
  }

  hcsStatus(): Record<string, unknown> {
    if (!this.anchor)
      return {
        enabled: false,
        note: "aucun topic HCS configure (HEDERA_HCS_TOPIC_ID absent) : les lots ne sont pas ancres. Ce n'est pas 'ancre a zero', c'est 'pas ancre'.",
        anchored_batches: 0,
        unanchored_batches: this.ledger.unanchoredBatches().length,
      };
    const anchored = this.anchors.filter((a) => a.ok);
    const fees = anchored
      .map((a) => a.publish?.charged_tx_fee_tinybar)
      .filter((v): v is number => typeof v === "number");
    return {
      enabled: true,
      schema: HCS_SCHEMA,
      topic_id: this.anchor.topic_id,
      network: this.anchor.network,
      hashscan: this.anchor.hashscan,
      anchored_batches: anchored.length,
      failed_anchors: this.anchors.length - anchored.length,
      unanchored_batches: this.ledger.unanchoredBatches().length,
      cost: fees.length
        ? {
            messages_with_known_cost: fees.length,
            total_tinybar: fees.reduce((a, b) => a + b, 0),
            avg_tinybar: Math.round(fees.reduce((a, b) => a + b, 0) / fees.length),
            avg_hbar: fees.reduce((a, b) => a + b, 0) / fees.length / 100_000_000,
          }
        : {
            messages_with_known_cost: 0,
            note: "aucun cout lu sur le mirror node — non verifie, pas gratuit",
          },
      recent: this.anchors.slice(-10).map((a) => ({
        batch_id: a.batch_id,
        status: a.status,
        reason: a.reason,
        sequence_number: a.publish?.sequence_number ?? null,
        consensus_timestamp: a.verification?.message?.consensus_timestamp ?? null,
        transaction_id: a.publish?.transaction_id ?? null,
        charged_tx_fee_tinybar: a.publish?.charged_tx_fee_tinybar ?? null,
        verified_on_mirror: a.verification?.verified ?? null,
      })),
    };
  }

  anchorHistory(): AnchorOutcome[] {
    return [...this.anchors];
  }

  /**
   * Publie l'empreinte d'un lot sur le topic HCS, puis la relit sur le mirror.
   * Tant que le mirror n'a pas rendu le meme contenu, le lot est NOT_ANCHORED :
   * un accuse de reception local ne vaut pas une piste d'audit publique.
   */
  async anchorBatch(receipt: BatchReceipt, extra: { block?: number | null } = {}): Promise<AnchorOutcome> {
    if (!this.anchor) {
      const out: AnchorOutcome = {
        ok: false,
        status: "NOT_ANCHORED",
        batch_id: receipt.batch_id,
        reason: "aucun topic HCS configure",
        publish: null,
        verification: null,
      };
      this.anchors.push(out);
      return out;
    }

    const rows: UnitRow[] = this.ledger.rowsOf(receipt.batch_id);
    const settlement = rows.find((r) => r.settlement_tx)?.settlement_tx ?? null;
    const payload: AnchorPayload = {
      v: HCS_SCHEMA,
      batch: receipt.batch_id,
      ts: receipt.ts,
      digest: receipt.digest,
      units: receipt.units_billed,
      unit_price_usd: receipt.unit_price_usd,
      amount_usd: receipt.amount_usd,
      payer: receipt.payer,
      settlement,
      block: extra.block ?? rows[0]?.block_number ?? null,
    };

    let published: PublishResult;
    try {
      published = await this.anchor.publish(payload);
    } catch (e) {
      const out: AnchorOutcome = {
        ok: false,
        status: "NOT_ANCHORED",
        batch_id: receipt.batch_id,
        reason: `publication refusee: ${(e as Error).message.slice(0, 200)}`,
        publish: null,
        verification: null,
      };
      this.anchors.push(out);
      return out;
    }

    let verification: MirrorVerification | null = null;
    if (this.verifyOnPublish) {
      verification = await this.anchor.verify(published.sequence_number, published.message);
      if (!verification.verified) {
        const out: AnchorOutcome = {
          ok: false,
          status: "NOT_ANCHORED",
          batch_id: receipt.batch_id,
          reason: verification.reason ?? "mirror node muet",
          publish: published,
          verification,
        };
        this.anchors.push(out);
        return out;
      }
    }

    this.ledger.attachAnchor(receipt.batch_id, {
      topic_id: published.topic_id,
      sequence_number: published.sequence_number,
    });
    const out: AnchorOutcome = {
      ok: true,
      status: "ANCHORED",
      batch_id: receipt.batch_id,
      reason: null,
      publish: published,
      verification,
    };
    this.anchors.push(out);
    return out;
  }
}

export type { BatchInput, BatchReceipt, Label, PayerRollup, UnitRow };
