// PUBLIER L'IDENTITE, ET LA RELIRE.
//
// Un identifiant d'agent qui ne vit que dans le code de l'agent ne prouve rien : il suffit
// de changer le code. Publie sur le topic HCS, il porte un horodatage de consensus que nous
// ne controlons pas, et n'importe qui peut le relire sur le mirror node PUIS le recalculer
// depuis les six champs. Deux verifications independantes, aucune parole donnee.
//
// C'est le meme topic que la piste de paiement — 0.0.10371106 — et c'est voulu : le champ
// `nativeId` de l'identite est le compte qui figure en `payer` dans les lignes du journal.
// Les deux se recoupent sans qu'on ait a les relier a la main.

import {
  publishMessage,
  verifyOnMirror,
  messageHash,
  hashscanTopic,
  type HcsConfig,
  type PublishResult,
  type MirrorVerification,
} from "../metering/hcs.js";
import { canonique, empreinte, type Identite } from "./hcs14.js";
import { TARE, UAID_TARE } from "./identite.js";

export const AGENT_SCHEMA = "tare.agent.v1";

export interface AgentMessage {
  v: typeof AGENT_SCHEMA;
  uaid: string;
  /** les six champs qui ont produit l'empreinte, pour que le lecteur la recalcule */
  canonical: ReturnType<typeof canonique>;
  ts: string;
}

/** Le message exact, tel qu'il part sur le topic. */
export function agentMessage(id: Identite, ts: string): string {
  return JSON.stringify({
    v: AGENT_SCHEMA,
    uaid: `uaid:aid:${empreinte(id)};registry=${id.registry};proto=${id.protocol};nativeId=${id.nativeId};uid=${id.uid ?? "0"}`,
    canonical: canonique(id),
    ts,
  } satisfies AgentMessage);
}

export interface AnnonceResult {
  published: PublishResult;
  verification: MirrorVerification;
  /** ANNOUNCED seulement si le mirror rend le message octet pour octet. */
  state: "ANNOUNCED" | "NOT_ANNOUNCED";
  reason: string | null;
}

/**
 * Publie l'identite et la relit sur le mirror node. Comme pour les ancrages du journal :
 * tant que le mirror n'a pas rendu le message identique, l'etat reste `NOT_ANNOUNCED`
 * AVEC sa raison. Une publication dont on n'a pas relu la trace n'est pas une publication.
 */
export async function annoncer(
  cfg: HcsConfig,
  opts: { id?: Identite; ts?: string; fetchImpl?: typeof fetch } = {},
): Promise<AnnonceResult> {
  if (!cfg.topicId) throw new Error("aucun topic HCS configure : HEDERA_HCS_TOPIC_ID est vide");
  const id = opts.id ?? TARE;
  const message = agentMessage(id, opts.ts ?? new Date().toISOString());

  const published = await publishMessage(cfg, cfg.topicId, message, { fetchImpl: opts.fetchImpl });
  const verification = await verifyOnMirror(
    cfg,
    cfg.topicId,
    published.sequence_number,
    message,
    { fetchImpl: opts.fetchImpl },
  );
  const ok = verification.verified;
  return {
    published,
    verification,
    state: ok ? "ANNOUNCED" : "NOT_ANNOUNCED",
    reason: ok ? null : (verification.reason ?? "le mirror node n'a pas rendu le message"),
  };
}

/** Ce que la route rend : l'identite, sa preuve, et de quoi la recalculer sans nous. */
export function identiteJson(cfg: HcsConfig | null) {
  const c = canonique(TARE);
  const json = JSON.stringify(c, Object.keys(c).sort() as (keyof typeof c)[]);
  return {
    uaid: UAID_TARE,
    standard: "HCS-14",
    spec: "https://hol.org/docs/standards/hcs-14/",
    canonical: c,
    canonical_json: json,
    canonical_json_sha256: messageHash(json),
    method: {
      hash: "sha384",
      encoding: "base58 (alphabet Bitcoin)",
      note:
        "L'empreinte ne porte QUE les six champs canoniques. Les parametres de routage " +
        "(registry, proto, nativeId, uid) sont apres le « ; » et n'entrent pas dans le hash.",
    },
    topic: cfg?.topicId
      ? { id: cfg.topicId, hashscan: hashscanTopic(cfg.network, cfg.topicId) }
      : null,
    limites: [
      "La norme HCS-14 publie deux vecteurs de test AVEC leurs entrees mais SANS leurs " +
        "empreintes : il n'existe aucun resultat de reference publie contre lequel se comparer.",
      "Son exemple de JSON canonique montre des cles NON triees, alors que son pseudo-code " +
        "les trie. On suit le pseudo-code, qui est executable ; l'autre lecture existe.",
      "registry vaut « self » parce que TARE n'est inscrit dans aucun annuaire d'agents. " +
        "Ce n'est pas une inscription, c'est une declaration.",
    ],
  };
}
