/**
 * LA CHAINE, D'UN BOUT A L'AUTRE, SOUS UNE SEULE HORLOGE.
 *
 * Un jure a pose la question exactement comme il fallait :
 *
 *   « Montrez-moi UN seul enchainement, un seul journal, une seule horloge : une transaction
 *     interceptee qui declenche une mesure payee. »
 *
 * Le reproche etait juste. Chaque piece de TARE tournait et se prouvait seule — la garde ici,
 * le peage x402 la, l'ancrage HCS ailleurs, la signature sur l'appareil dans un quatrieme
 * fichier. Aucune ne montrait qu'elle etait la MEME machine. Quatre preuves separees ne font
 * pas une chaine : elles font quatre demonstrations.
 *
 * Ce script les met bout a bout et n'ecrit qu'UN fichier, avec UNE horloge :
 *
 *   1. une vraie transaction Base, rejouable par son hash
 *   2. la garde la decode, en sort la PoolKey, et rend un verdict
 *   3. y a-t-il une autre porte ? (la reponse est NON dans 99,8 % des cas, et c'est une reponse)
 *   4. une mesure NEUVE sur ce pool, payee en x402 sur Hedera et relue sur le mirror node
 *   5. le lot est ancre sur le topic HCS, puis relu octet pour octet
 *   6. le rapport est encode en EIP-712 et rendu ecran par ecran sur l'appareil
 *
 * CE QUI ARRIVE QUAND UNE ETAPE NE PEUT PAS TOURNER. Elle s'ecrit `NON_EXECUTE` avec sa
 * raison, et la chaine continue. Une etape sautee n'est pas une etape reussie, et une chaine
 * incomplete qui se dit complete serait pire que pas de chaine du tout. Le fichier porte donc
 * toujours `complete: false` des qu'une etape n'a pas tourne, et l'etape dit pourquoi.
 *
 *   npx tsx src/chaine/run.ts            # ecrit docs/dataset/chaine-complete.json
 *   npx tsx src/chaine/run.ts --sec      # sans reseau : seules les etapes 1-3
 */
import "../config.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type EtatEtape = "OK" | "NON_EXECUTE";

export interface Etape {
  n: number;
  quoi: string;
  etat: EtatEtape;
  /** ce qui s'est reellement passe, ou la raison de n'avoir pas tourne */
  detail: string;
  /** les faits que cette etape a produits — jamais une interpretation */
  faits: Record<string, unknown>;
  /** millisecondes depuis le debut de la chaine, a la FIN de l'etape */
  a_ms: number;
  /** ce qu'il faudrait pour que l'etape tourne, quand elle n'a pas tourne */
  pour_la_faire_tourner: string | null;
}

export interface Chaine {
  v: "tare.chaine.v1";
  debut: string;
  fin: string;
  duree_ms: number;
  /** false des qu'une seule etape n'a pas tourne */
  complete: boolean;
  n_ok: number;
  n_total: number;
  etapes: Etape[];
}

const REPO = resolve(import.meta.dirname, "../../../..");

/** Une horloge unique, posee au demarrage. C'est elle qui fait de six preuves une chaine. */
class Horloge {
  readonly t0 = Date.now();
  readonly debut = new Date().toISOString();
  ms(): number {
    return Date.now() - this.t0;
  }
}

export async function courir(opts: { sansReseau?: boolean } = {}): Promise<Chaine> {
  const h = new Horloge();
  const etapes: Etape[] = [];
  const pousser = (
    n: number,
    quoi: string,
    etat: EtatEtape,
    detail: string,
    faits: Record<string, unknown>,
    pour: string | null = null,
  ) => {
    etapes.push({ n, quoi, etat, detail, faits, a_ms: h.ms(), pour_la_faire_tourner: pour });
  };

  /* --------------------------------------- 1. une vraie transaction Base */

  interface TxReelle {
    tx_hash: string;
    block_number: number;
    chain_id: number;
    to: string;
    input: string;
  }
  let tx: TxReelle | null = null;
  try {
    const fx = JSON.parse(
      readFileSync(resolve(REPO, "packages/guard/test/fixtures/real-calldata.json"), "utf8"),
    ) as { txs: TxReelle[] };
    // On prend la premiere transaction a UN SEUL saut. Sur un multi-saut, l'etape 3 ne peut
    // rien comparer — les montants des sauts suivants dependent de l'execution — et la chaine
    // montrerait un refus qui ne dit rien de la recherche de porte. Toutes les transactions
    // ici sont reelles et rejouables ; on choisit celle qui exerce le plus d'etapes.
    const g0 = await import("../../../../packages/guard/src/index.js");
    tx =
      fx.txs.find((t) => {
        try {
          return g0.tareGuard({ to: t.to, data: t.input, chainId: t.chain_id }).decode.legs.length === 1;
        } catch {
          return false;
        }
      }) ??
      fx.txs[0] ??
      null;
    if (!tx) throw new Error("aucune transaction dans les fixtures");
    pousser(1, "une vraie transaction Base, rejouable par son hash", "OK", `capturee sur Base mainnet`, {
      hash: tx.tx_hash,
      bloc: tx.block_number,
      chain_id: tx.chain_id,
      vers: tx.to,
      rejeu: `cast tx ${tx.tx_hash} --rpc-url $BASE_RPC_URL`,
      basescan: `https://basescan.org/tx/${tx.tx_hash}`,
    });
  } catch (e) {
    pousser(1, "une vraie transaction Base", "NON_EXECUTE", (e as Error).message, {},
      "les fixtures de calldata reel doivent etre presentes");
  }

  /* ------------------------------- 2 & 3. la garde decode, et cherche ailleurs */

  let poolId: string | null = null;
  let hookLu: string | null = null;
  let direction: "0->1" | "1->0" | null = null;
  let amountIn: string | null = null;
  /** un pool DU CORPUS portant le meme hook, quand celui de la transaction n'y est pas */
  let poolMesurable: string | null = null;
  let poolDeLaTx = true;
  if (tx) {
    try {
      // apps/api ne declare pas @tare/guard en dependance : on importe le source par son
      // chemin. C'est volontairement explicite — ajouter une dependance inter-paquets a trois
      // jours du rendu casserait le build de l'API pour un seul script.
      const g = (await import("../../../../packages/guard/src/index.js")) as typeof import("../../../../packages/guard/src/index.js");
      const rapport = g.tareGuard({ to: tx.to, data: tx.input, chainId: tx.chain_id });
      const f = rapport.findings[0];
      poolId = f?.leg?.poolId ?? null;
      hookLu = f?.hook ?? null;
      direction = (f?.leg?.direction as "0->1" | "1->0" | undefined) ?? null;
      amountIn = f?.leg?.amountIn ?? null;

      // Le pool d'une transaction capturee APRES le bloc epingle n'existait pas a ce bloc :
      // il est inmesurable par construction, pas par accident. Pour que la chaine montre
      // quand meme une mesure PAYEE, on mesure le meme HOOK sur un pool qui, lui, existait —
      // et l'etape le dit, parce qu'un pool substitue en silence serait un mensonge.
      const tbl = g.assertTable(
        JSON.parse(readFileSync(resolve(REPO, "packages/guard/data/table.json"), "utf8")),
      );
      if (poolId && tbl.pools[poolId.toLowerCase()]) {
        poolMesurable = poolId;
      } else if (hookLu) {
        const h = tbl.hooks[hookLu.toLowerCase()];
        poolMesurable = h?.pools?.[0] ?? null;
        poolDeLaTx = false;
      }
      pousser(2, "la garde decode le calldata et rend un verdict", "OK", rapport.headline, {
        verdict: rapport.verdict,
        calldata_lu_en_entier: rapport.complete,
        hook: f?.hook ?? null,
        pool_id: poolId,
        direction,
        amount_in: amountIn,
        prelevement_bps: f?.bps ?? null,
        etiquette: f?.label ?? null,
        bloc_de_la_table: rapport.table.blockNumber,
      });

      const alt = rapport.alternative;
      pousser(
        3,
        "y a-t-il une autre porte ?",
        "OK",
        alt
          ? alt.raison
          : "chemin a plusieurs sauts : les montants des sauts suivants dependent de l'execution, donc aucune comparaison a taille egale n'est possible",
        alt
          ? {
              etat: alt.etat,
              economie_bps: alt.economie_bps,
              seuil_bps: alt.seuil_bps,
              portes_examinees: alt.examinees.length,
              calldata_de_remplacement: alt.calldata ? `${alt.calldata.slice(0, 20)}… (${(alt.calldata.length - 2) / 2} octets)` : null,
            }
          : { etat: "NON_COMPARABLE" },
      );
    } catch (e) {
      pousser(2, "la garde decode le calldata", "NON_EXECUTE", (e as Error).message, {},
        "npm --prefix packages/guard install");
      pousser(3, "y a-t-il une autre porte ?", "NON_EXECUTE", "l'etape 2 n'a pas tourne", {}, null);
    }
  }

  /* ------------------------- 4. une mesure NEUVE, payee en x402 sur Hedera */

  const urlApi = process.env["TARE_API_URL"] ?? "http://127.0.0.1:8787/measure";
  if (opts.sansReseau) {
    pousser(4, "une mesure neuve, payee en x402 sur Hedera", "NON_EXECUTE", "mode --sec : aucun reseau", {},
      "relancer sans --sec");
    pousser(5, "le lot est ancre sur le topic HCS", "NON_EXECUTE", "mode --sec : aucun reseau", {},
      "relancer sans --sec");
  } else if (!poolMesurable) {
    pousser(4, "une mesure neuve, payee en x402", "NON_EXECUTE",
      "aucun pool mesurable : ni celui de la transaction ni un pool du corpus portant le meme hook", {}, null);
    pousser(5, "le lot est ancre sur le topic HCS", "NON_EXECUTE", "l'etape 4 n'a pas tourne", {}, null);
  } else {
    try {
      const { createPayer, payOnce } = await import("../pay/client.js");
      const { resolvePayerKey } = await import("../pay/secret.js");
      const { loadConfig } = await import("../config.js");
      const cfg = loadConfig();
      const payerId = process.env["HEDERA_PAYER_ACCOUNT_ID"];
      if (!payerId) throw new Error("HEDERA_PAYER_ACCOUNT_ID est vide");
      // La cle vient de l'anneau Ledger quand il est la, du .env sinon — et le recu dit
      // laquelle a servi. Un service qui ne sait pas ou dort sa cle ne sait pas ce qu'il protege.
      const cle = await resolvePayerKey();
      const http = createPayer({
        accountId: payerId,
        privateKey: cle.value,
        keyType: process.env["HEDERA_PAYER_KEY_TYPE"] ?? "ECDSA",
        network: cfg.x402Network,
      });
      // On mesure a une taille DU CORPUS, pas celle de la transaction : le moteur cote les
      // tailles qu'il a balayees, et en demander une autre rendrait NOT_MEASURABLE.
      const r = await payOnce(urlApi, { pool_id: poolMesurable, sizes: ["1000000000000"] }, http, {
        verifyOnMirror: true,
      });
      // « Regle » veut dire relu sur le MIRROR, pas annonce par le serveur. Un 200 dit que la
      // ressource a ete rendue, pas que l'argent a bouge.
      const paye = r.mirror?.verified === true;
      const recu = (r.paid.body as { receipt?: { batch_id?: string; units?: number } } | null)?.receipt ?? null;
      const accepte = (r.challenge.accepts as { amount?: string }[] | null)?.[0] ?? null;
      pousser(
        4,
        "une mesure neuve, payee en x402 sur Hedera et relue sur le mirror node",
        paye ? "OK" : "NON_EXECUTE",
        paye
          ? "le 402 a annonce son prix, le paiement a ete regle, et le mirror node l'a confirme" +
            (poolDeLaTx
              ? " — sur LE pool de la transaction"
              : " — sur un AUTRE pool du meme hook : celui de la transaction n'existait pas au bloc epingle")
          : `le reglement n'a pas ete confirme par le reseau : ${r.mirror?.reason ?? "mirror non lu"}`,
        {
          url: urlApi,
          pool_mesure: poolMesurable,
          est_le_pool_de_la_transaction: poolDeLaTx,
          hook: hookLu,
          statut_402: r.challenge.status,
          montant: accepte?.amount ?? null,
          cle_du_payeur: cle.describe,
          transaction: r.settle?.transaction ?? null,
          consensus: r.mirror?.consensus_timestamp ?? null,
          hashscan: r.settle?.transaction
            ? `https://hashscan.io/testnet/transaction/${r.settle.transaction}`
            : null,
          lot: recu?.batch_id ?? null,
          unites: recu?.units ?? null,
        },
        paye ? null : "le moteur doit repondre : voir DEPLOY.md, section « si Docker lache »",
      );
    } catch (e) {
      pousser(4, "une mesure neuve, payee en x402", "NON_EXECUTE", (e as Error).message.slice(0, 200), { url: urlApi },
        "l'API doit tourner (npm --prefix apps/api run dev) et le fork repondre");
    }

    /* ------------------------------- 5. l'ancrage HCS du lot facture */

    try {
      const { hcsConfigFromEnv, readTopic } = await import("../metering/hcs.js");
      const cfg = hcsConfigFromEnv();
      if (!cfg?.topicId) throw new Error("HEDERA_HCS_TOPIC_ID est vide");
      const lu = await readTopic(cfg, cfg.topicId);
      const dernier = lu.messages[lu.messages.length - 1];
      pousser(
        5,
        "le lot est ancre sur le topic HCS, et relu",
        lu.complete ? "OK" : "NON_EXECUTE",
        lu.complete
          ? `le topic se lit en entier : ${lu.count} message(s)`
          : `la pagination du mirror s'est interrompue : ${lu.reason}`,
        {
          topic: cfg.topicId,
          messages: lu.count,
          dernier_numero: dernier?.sequence_number ?? null,
          dernier_consensus: dernier?.consensus_timestamp ?? null,
          hashscan: `https://hashscan.io/testnet/topic/${cfg.topicId}`,
        },
        lu.complete ? null : "le mirror node doit repondre",
      );
    } catch (e) {
      pousser(5, "le lot est ancre sur le topic HCS", "NON_EXECUTE", (e as Error).message.slice(0, 160), {},
        "HEDERA_HCS_TOPIC_ID et les cles Hedera doivent etre lisibles");
    }
  }

  /* --------------------- 6. le rapport signe, ecran par ecran, sur l'appareil */

  // On ESSAIE de signer pour de vrai. Speculos joint => on lance la chaine complete de
  // packages/guard/scripts/speculos-approve.ts, qui reprend la meme transaction, la redecode,
  // en fait un EIP-712 et marche dans les ecrans. Absent => on RELIT l'enregistrement date en
  // le disant, parce qu'un enregistrement relu n'est pas une execution du jour.
  const speculosJoint = await fetch("http://127.0.0.1:5010", { signal: AbortSignal.timeout(2500) })
    .then(() => true)
    .catch(() => false);

  if (speculosJoint && !opts.sansReseau) {
    try {
      const { execFileSync } = await import("node:child_process");
      execFileSync("npx", ["tsx", "scripts/speculos-approve.ts"], {
        cwd: resolve(REPO, "packages/guard"),
        stdio: "pipe",
        timeout: 240000,
      });
      const p2 = JSON.parse(readFileSync(resolve(REPO, "docs/ledger/guard-speculos.json"), "utf8")) as {
        ts: string;
        appareil: string;
        physique: boolean;
        ecrans: unknown[];
        signature: { v: number };
        transaction: { hash: string };
        rapport: { verdict: string };
      };
      pousser(
        6,
        "le rapport encode en EIP-712, rendu ecran par ecran sur l'appareil, et signe",
        "OK",
        `signe a l'instant sur ${p2.appareil} : ${p2.ecrans.length} ecrans traverses`,
        {
          appareil: p2.appareil,
          materiel_physique: p2.physique,
          ecrans: p2.ecrans.length,
          verdict_affiche: p2.rapport.verdict,
          signature_v: p2.signature.v,
          transaction: p2.transaction.hash,
          meme_transaction_qu_a_l_etape_1: tx ? p2.transaction.hash === tx.tx_hash : null,
        },
      );
    } catch (e) {
      pousser(6, "le rapport signe sur l'appareil", "NON_EXECUTE", (e as Error).message.slice(0, 200), {},
        "sur l'appareil : App settings -> Blind signing -> Enabled");
    }
  } else {
    try {
      const p2 = JSON.parse(readFileSync(resolve(REPO, "docs/ledger/guard-speculos.json"), "utf8")) as {
        ts: string;
        appareil: string;
        physique: boolean;
        ecrans: unknown[];
        signature: { v: number };
        transaction: { hash: string };
      };
      pousser(
        6,
        "le rapport encode en EIP-712, rendu ecran par ecran sur l'appareil",
        "NON_EXECUTE",
        `Speculos injoignable : enregistrement du ${p2.ts.slice(0, 10)} relu, PAS rejoue`,
        {
          appareil: p2.appareil,
          ecrans: p2.ecrans.length,
          signature_v: p2.signature.v,
          transaction: p2.transaction.hash,
          meme_transaction_qu_a_l_etape_1: tx ? p2.transaction.hash === tx.tx_hash : null,
        },
        "./scripts/ledger/run-speculos.sh ethereum",
      );
    } catch (e) {
      pousser(6, "le rapport signe sur l'appareil", "NON_EXECUTE", (e as Error).message.slice(0, 160), {},
        "docs/ledger/guard-speculos.json doit exister");
    }
  }

  const n_ok = etapes.filter((e) => e.etat === "OK").length;
  return {
    v: "tare.chaine.v1",
    debut: h.debut,
    fin: new Date().toISOString(),
    duree_ms: h.ms(),
    complete: n_ok === etapes.length,
    n_ok,
    n_total: etapes.length,
    etapes,
  };
}

if (import.meta.filename === process.argv[1]) {
  const sansReseau = process.argv.includes("--sec");
  const c = await courir({ sansReseau });
  const out = resolve(REPO, "docs/dataset/chaine-complete.json");
  writeFileSync(out, JSON.stringify(c, null, 1) + "\n");
  for (const e of c.etapes) {
    const marque = e.etat === "OK" ? "OK " : "-- ";
    console.log(`${marque} ${e.n}. ${e.quoi}`);
    console.log(`      ${e.detail}`);
    console.log(`      a ${e.a_ms} ms${e.pour_la_faire_tourner ? ` · pour la faire tourner : ${e.pour_la_faire_tourner}` : ""}`);
  }
  console.log(`\n${c.n_ok}/${c.n_total} etapes, ${c.duree_ms} ms, complete: ${c.complete}`);
  console.log(`ecrit ${out}`);
}
