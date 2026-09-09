/**
 * Les routes de l'identite d'agent.
 *
 * Sous-app Hono autonome, montee en une ligne :  app.route("/", createAgentRouter(cfg));
 */
import { Hono } from "hono";
import { hcsConfigFromEnv } from "../metering/hcs.js";
import { identiteJson } from "./publish.js";
import { readTopic } from "../metering/hcs.js";
import { AGENT_SCHEMA } from "./publish.js";

export function createAgentRouter(): Hono {
  const app = new Hono();

  app.get("/agent", (c) => c.json(identiteJson(hcsConfigFromEnv())));

  /**
   * L'annonce telle qu'elle est LUE sur le topic, pas telle qu'on l'a envoyee. Si le topic
   * n'en porte aucune, la route le dit — elle ne rend jamais l'identite locale en la faisant
   * passer pour publiee.
   */
  app.get("/agent/hcs", async (c) => {
    const cfg = hcsConfigFromEnv();
    if (!cfg?.topicId)
      return c.json(
        { state: "NOT_CONFIGURED", reason: "HEDERA_HCS_TOPIC_ID est vide : rien a relire" },
        503,
      );
    const lu = await readTopic(cfg, cfg.topicId);
    // Le mirror rend le message deja decode. On ne garde que ce qui se relit ET porte notre
    // schema : une ligne illisible est ecartee, jamais completee par ce qu'on croit savoir.
    const annonces = lu.messages.flatMap((m) => {
      let j: { v?: string } | null = null;
      try {
        j = JSON.parse(m.message_utf8) as { v?: string };
      } catch {
        return [];
      }
      if (j?.v !== AGENT_SCHEMA) return [];
      return [{ sequence_number: m.sequence_number, consensus_timestamp: m.consensus_timestamp, ...j }];
    });
    if (!lu.complete)
      return c.json(
        {
          state: "NOT_READABLE",
          reason: "la pagination du mirror node s'est interrompue : la liste serait incomplete",
          annonces,
        },
        503,
      );
    if (annonces.length === 0)
      return c.json(
        { state: "NOT_ANNOUNCED", reason: "aucune annonce d'identite sur ce topic", topic: cfg.topicId },
        404,
      );
    return c.json({ state: "ANNOUNCED", topic: cfg.topicId, annonces });
  });

  return app;
}
