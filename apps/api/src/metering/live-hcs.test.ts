/**
 * Le test qui va voir Hedera.
 *
 * Il ne publie RIEN : il relit, sur le mirror node public, le message que
 * `tsx src/metering/cli.ts anchor` a reellement ecrit sur le topic
 * 0.0.10371106 (Hedera testnet).
 *
 *   HashScan : https://hashscan.io/testnet/topic/0.0.10371106
 *   Mirror   : https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10371106/messages
 *
 * Il se saute tout seul sans topic dans l'environnement, ou avec
 * TARE_LIVE_HCS=0 — un test reseau ne doit pas faire rougir une suite hors
 * ligne. Mais quand il tourne, il ne prouve rien de moins que : ce que TARE
 * pretend avoir ancre, le consensus Hedera l'a horodate.
 */
import "../config.js";
import { describe, it, expect } from "vitest";
import { AGENT_SCHEMA } from "../agent/publish.js";
import { UAID_TARE } from "../agent/identite.js";
import { HCS_SCHEMA, hcsConfigFromEnv, readTopic, verifyOnMirror } from "./hcs.js";

const cfg = hcsConfigFromEnv();
const LIVE = process.env.TARE_LIVE_HCS !== "0" && Boolean(cfg?.topicId);

describe.skipIf(!LIVE)("le topic HCS reel (Hedera testnet, lecture seule)", () => {
  it("le mirror node rend le message n.1 et il est bien un ancrage TARE", async () => {
    const v = await verifyOnMirror(cfg!, cfg!.topicId!, 1, null, { attempts: 4, delayMs: 2000 });
    expect(v.verified, `mirror: ${v.reason}`).toBe(true);
    const m = v.message!;
    expect(m.sequence_number).toBe(1);
    expect(m.consensus_timestamp).toMatch(/^\d+\.\d+$/);
    expect(m.parsed, "le message n'est pas un ancrage tare.metering.v1").not.toBeNull();
    expect(m.parsed!.v).toBe(HCS_SCHEMA);
    expect(m.parsed!.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(m.parsed!.units).toBeGreaterThan(0);
    expect(m.parsed!.unit_price_usd).toBeGreaterThan(0);
    // l'unite est bien la mesure : le montant vaut unites x prix unitaire
    expect(m.parsed!.amount_usd).toBeCloseTo(m.parsed!.units * m.parsed!.unit_price_usd, 9);
  });

  it("la piste d'audit se lit ENTIEREMENT, pages comprises", async () => {
    const all = await readTopic(cfg!, cfg!.topicId!);
    expect(all.complete, `lecture incomplete: ${all.reason}`).toBe(true);
    expect(all.count).toBeGreaterThanOrEqual(1);
    // les sequence numbers se suivent : aucun trou, donc aucune page perdue
    expect(all.messages.map((m) => m.sequence_number)).toEqual(
      all.messages.map((_, i) => i + 1),
    );

    // Le topic porte DEUX schemas depuis l'annonce d'identite (message #12, ../agent) :
    // `tare.metering.v1` pour les ancrages de lots, `tare.agent.v1` pour l'identite HCS-14.
    // Ce test verifiait « tout message est un ancrage », ce qui confondait deux choses :
    // que la lecture soit complete, et qu'elle ne contienne qu'une sorte de ligne. Ce qui
    // doit tenir, c'est qu'AUCUN message ne soit illisible — une ligne qu'on ne sait pas
    // nommer sur une piste d'audit est exactement ce qu'on ne veut pas.
    const inconnus = all.messages.filter((m) => {
      if (m.parsed !== null) return false;
      try {
        const j = JSON.parse(m.message_utf8) as { v?: string };
        return j?.v !== AGENT_SCHEMA;
      } catch {
        return true;
      }
    });
    expect(
      inconnus.map((m) => `#${m.sequence_number}: ${m.message_utf8.slice(0, 80)}`),
      "message sur le topic dont le schema n'est ni un ancrage ni une identite",
    ).toEqual([]);
    expect(all.messages.filter((m) => m.parsed !== null).length).toBeGreaterThan(0);
  });

  it("l'identite d'agent est bien annoncee, et elle est celle qu'on calcule", async () => {
    const all = await readTopic(cfg!, cfg!.topicId!);
    expect(all.complete, `lecture incomplete: ${all.reason}`).toBe(true);
    const annonces = all.messages.flatMap((m) => {
      try {
        const j = JSON.parse(m.message_utf8) as { v?: string; uaid?: string };
        return j?.v === AGENT_SCHEMA ? [j] : [];
      } catch {
        return [];
      }
    });
    // Une seule : `cli.ts publish` refuse de republier une identite deja annoncee.
    expect(annonces.length).toBe(1);
    expect(annonces[0]!.uaid).toBe(UAID_TARE);
  });
});

describe.skipIf(LIVE)("le topic HCS reel", () => {
  it("saute : pas de HEDERA_HCS_TOPIC_ID, ou TARE_LIVE_HCS=0", () => {
    expect(true).toBe(true);
  });
});
