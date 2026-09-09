/**
 * L'identite d'agent en ligne de commande.
 *
 *   npx tsx src/agent/cli.ts show       calcule et affiche l'identifiant, sans reseau
 *   npx tsx src/agent/cli.ts publish    publie l'annonce sur le topic HCS, puis la relit
 *   npx tsx src/agent/cli.ts read       relit les annonces deja presentes sur le topic
 *   npx tsx src/agent/cli.ts export     ecrit docs/dataset/agent-identity.json, LU sur le mirror
 *
 * `export` ne recopie pas ce que le code croit : il relit le topic et n'ecrit que ce que le
 * mirror node rend. C'est ce fichier que les surfaces (site, landing) affichent, pour qu'aucune
 * d'elles n'ait a repeter une chaine a la main.
 *
 * `publish` coute du HBAR et laisse une trace permanente. Il refuse donc de republier une
 * identite deja annoncee a l'identique : une piste ou la meme annonce figure deux fois
 * n'est plus une piste, c'est du bruit.
 */
// L'import de ../config.js charge le .env de la racine. Sans lui, `show` annoncerait
// « aucun topic » sur une machine qui en a un — et ce serait faux.
import "../config.js";
import { hcsConfigFromEnv, readTopic, hashscanTopic } from "../metering/hcs.js";
import { annoncer, agentMessage, AGENT_SCHEMA } from "./publish.js";
import { identiteJson } from "./publish.js";
import { TARE, UAID_TARE } from "./identite.js";
import { jsonCanonique } from "./hcs14.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cmd = process.argv[2] ?? "show";

function exigerConfig() {
  const cfg = hcsConfigFromEnv();
  if (!cfg) {
    console.error("aucune configuration Hedera lisible dans l'environnement.");
    process.exit(1);
  }
  if (!cfg.topicId) {
    console.error("HEDERA_HCS_TOPIC_ID est vide : il n'y a aucun topic ou publier.");
    process.exit(1);
  }
  return cfg;
}

/** Les annonces deja sur le topic, avec l'etat de la lecture — jamais une liste courte
 *  presentee comme complete. */
async function annoncesDuTopic(cfg: ReturnType<typeof hcsConfigFromEnv>) {
  const c = cfg!;
  const lu = await readTopic(c, c.topicId!);
  const annonces = lu.messages.flatMap((m) => {
    let j: { v?: string; uaid?: string } | null = null;
    try {
      j = JSON.parse(m.message_utf8) as { v?: string; uaid?: string };
    } catch {
      return [];
    }
    if (j?.v !== AGENT_SCHEMA) return [];
    return [{ seq: m.sequence_number, ts: m.consensus_timestamp, uaid: j.uaid ?? null }];
  });
  return { complete: lu.complete, reason: lu.reason, annonces };
}

if (cmd === "show") {
  const j = identiteJson(hcsConfigFromEnv());
  console.log("uaid           :", UAID_TARE);
  console.log("json canonique :", jsonCanonique(TARE));
  console.log("sha256 du json :", j.canonical_json_sha256);
  console.log("competences    :", TARE.skills.join(", "));
  console.log("topic          :", j.topic ? `${j.topic.id} — ${j.topic.hashscan}` : "(aucun)");
  console.log("\nlimites :");
  for (const l of j.limites) console.log("  -", l);
} else if (cmd === "read") {
  const cfg = exigerConfig();
  const { complete, reason, annonces } = await annoncesDuTopic(cfg);
  console.log("topic   :", cfg.topicId, "—", hashscanTopic(cfg.network, cfg.topicId!));
  console.log("lecture :", complete ? "complete" : `INCOMPLETE (${reason})`);
  if (annonces.length === 0) console.log("aucune annonce d'identite sur ce topic.");
  for (const a of annonces) console.log(`  #${a.seq}  ${a.ts}  ${a.uaid}`);
} else if (cmd === "publish") {
  const cfg = exigerConfig();
  const { complete, annonces } = await annoncesDuTopic(cfg);
  const deja = annonces.find((a) => a.uaid === UAID_TARE);
  if (deja) {
    console.log(`identite deja annoncee au message #${deja.seq} (${deja.ts}).`);
    console.log("rien n'est republie : chaque message coute du HBAR, et un doublon n'ajoute rien.");
    console.log(hashscanTopic(cfg.network, cfg.topicId!));
    process.exit(0);
  }
  if (!complete) {
    console.error("la lecture du topic est incomplete : on ne peut pas savoir si l'identite y est deja.");
    console.error("republier a l'aveugle risquerait un doublon permanent. On s'arrete.");
    process.exit(1);
  }
  const ts = new Date().toISOString();
  console.log("message :", agentMessage(TARE, ts));
  const r = await annoncer(cfg, { ts });
  console.log("etat            :", r.state, r.reason ? `(${r.reason})` : "");
  console.log("sequence        :", r.published.sequence_number);
  console.log("transaction     :", r.published.transaction_id);
  console.log(
    "cout            :",
    r.published.charged_tx_fee_tinybar === null
      ? `non lu — ${r.published.fee_note}`
      : `${r.published.charged_tx_fee_tinybar} tinybar (${r.published.charged_tx_fee_hbar} HBAR)`,
  );
  console.log("octets          :", r.published.message_bytes);
  console.log("hashscan        :", r.published.hashscan);
  if (r.state !== "ANNOUNCED") process.exit(1);
} else if (cmd === "export") {
  const cfg = exigerConfig();
  const { complete, reason, annonces } = await annoncesDuTopic(cfg);
  if (!complete) {
    console.error(`lecture du topic incomplete (${reason}) : on n'ecrit pas un fichier de faits partiel.`);
    process.exit(1);
  }
  const mienne = annonces.find((a) => a.uaid === UAID_TARE) ?? null;
  const faits = {
    v: "tare.agent.identity.v1",
    standard: "HCS-14",
    spec: "https://hol.org/docs/standards/hcs-14/",
    uaid: UAID_TARE,
    canonical: JSON.parse(jsonCanonique(TARE)) as unknown,
    canonical_json: jsonCanonique(TARE),
    competences: TARE.skills,
    topic: cfg.topicId,
    hashscan: hashscanTopic(cfg.network, cfg.topicId!),
    reseau: cfg.network,
    // Ce qui suit est LU sur le mirror node, pas affirme. Si l'identite n'y est pas,
    // `annonce` vaut null et l'etat le dit — jamais un objet vide qui aurait l'air d'une preuve.
    etat: mienne ? "ANNOUNCED" : "NOT_ANNOUNCED",
    annonce: mienne
      ? { sequence_number: mienne.seq, consensus_timestamp: mienne.ts }
      : null,
    lu_le: new Date().toISOString(),
  };
  const chemin = resolve(import.meta.dirname, "../../../../docs/dataset/agent-identity.json");
  writeFileSync(chemin, JSON.stringify(faits, null, 1) + "\n");
  console.log(`ecrit ${chemin}`);
  console.log(`etat ${faits.etat}${mienne ? ` — message #${mienne.seq}` : ""}`);
} else {
  console.error(`commande inconnue : ${cmd}. Attendu : show | publish | read | export`);
  process.exit(1);
}
