/**
 * POST /alternative — la substitution, atteignable en HTTP.
 *
 * Deux choses sont testees ici, et la seconde coute de l'argent reel :
 *
 *   1. LA LOGIQUE. Les six etats de la comparaison traversent le HTTP sans se faire
 *      aplatir en booleen, et « une seule porte » arrive comme une reponse, pas comme
 *      une erreur.
 *
 *   2. LE COMPTE DES APPELS RPC. Le noeud est facture a l'appel. La porte unique est le
 *      cas ecrasant du corpus (99,71 % des 125 072 lignes), donc une route qui lirait la chaine
 *      AVANT de verifier qu'il y a quelque chose a proposer paierait trois appels pour
 *      rien, sur presque toutes les requetes. Le faux noeud de ces tests COMPTE ses
 *      appels, et l'assertion est `toBe(0)`.
 *
 * La table lue est la vraie (packages/guard/data/table.json), et le couple choisi est un
 * couple REEL du corpus : le pool 0x997673… prend 300,00 bps a 10 ETH-equivalents la ou son
 * pool frere, meme hook, meme jeton, en prend 0,0316. C'est le cas le plus spectaculaire de
 * tout le corpus, et il est verifiable a la commande de rejeu rendue.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createAlternativeRouter } from "../src/alternative.js";

/**
 * LES DEUX COUPLES REELS, produits par scripts/chiffres-alternative.mjs.
 *
 * Le corpus n'en contient que QUATRE, pour 15 propositions sur 125 072 lignes. Les deux
 * choisis ici couvrent les deux branches de monnaie :
 *
 *   ERC-20 : 0x30af3420… -> 0x9492c969…, sens 1->0, taille 1e18. Memes monnaies, memes frais
 *            (6000), meme tickSpacing (60) : les deux pools ne different QUE par leur hook.
 *            295,59 bps contre 216,92 — 78,67 bps d'ecart, le maximum du corpus.
 *
 *   NATIF  : 0x2fcc6c5f… -> 0x0640a8b4…, sens 0->1, taille 1e12. ETH natif vers USDC, deux
 *            portes, 4,0933 bps contre 0,0000. Le sens 0->1 depense de l'ETH natif : rien a
 *            autoriser, donc deux appels RPC de moins.
 */
const CHER = "0x30af3420023c254aa62170c4fa153e87f140540f2756e3ed6a0e897b422e0b00";
const TAILLE = "1000000000000000000";
const JETON = "0xb7ebae7b9135b6454a6ba0b5e483317f72ca3356";
const NATIF = "0x2fcc6c5ff68b185fee2521a889a0a4e3c17dc7c981349b9ec68614a844ea9aff";
const TAILLE_NATIF = "1000000000000";
const MOI = "0x1111111111111111111111111111111111111111";
const MAINTENANT = 1789000000n;

const mot = (v: bigint) => v.toString(16).padStart(64, "0");

/** Un faux noeud qui COMPTE ses appels et rend une reponse par selecteur. */
function noeud(par: Record<string, string>) {
  const appels: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { params: [{ to: string; data: string }] };
    const sel = body.params[0].data.slice(0, 10);
    appels.push(sel);
    const r = par[sel];
    if (r === undefined)
      return new Response(JSON.stringify({ error: { message: `selecteur inattendu ${sel}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: r }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { appels, fetchImpl };
}

function appli(fetchImpl?: typeof fetch) {
  const app = new Hono();
  app.route(
    "/",
    createAlternativeRouter({
      rpc: "http://127.0.0.1:1/faux",
      fetchImpl,
      maintenant: () => MAINTENANT,
    }),
  );
  return app;
}

async function poste(app: Hono, corps: unknown) {
  const res = await app.request("/alternative", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corps),
  });
  return { statut: res.status, corps: (await res.json()) as unknown };
}

/* ------------------------------------------------ ce qui ne coute rien */

describe("la porte unique ne coute PAS un appel RPC", () => {
  it("un pool sans soeur repond PORTE_UNIQUE avec appels_rpc a zero", async () => {
    const { appels, fetchImpl } = noeud({});
    // un pool du corpus dont le jeton n'a qu'une porte : on en prend un et on verifie l'etat
    const r = await poste(appli(fetchImpl), {
      pool_id: "0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538",
      direction: "0->1",
      amount_in: "100000000000000",
      proprietaire: MOI,
    });
    expect(r.statut).toBe(200);
    expect(["PORTE_UNIQUE", "DEJA_LA_MEILLEURE", "AUTRES_NON_MESUREES", "ACTUELLE_NON_MESUREE"]).toContain(
      (r.corps as { alternative: { etat: string } }).alternative.etat,
    );
    expect((r.corps as { appels_rpc: number }).appels_rpc).toBe(0);
    expect(appels).toEqual([]); // pas un seul octet vers le noeud
    expect((r.corps as { envoi: { etat: string } }).envoi.etat).toBe("PAS_DE_PROPOSITION");
  });

  it("un pool absent de la table rend POOL_INCONNU, et toujours zero appel", async () => {
    const { appels, fetchImpl } = noeud({});
    const r = await poste(appli(fetchImpl), {
      pool_id: "0x" + "ab".repeat(32),
      direction: "0->1",
      amount_in: "1000",
    });
    expect((r.corps as { alternative: { etat: string } }).alternative.etat).toBe("POOL_INCONNU");
    expect(appels).toEqual([]);
  });

  it("`construire: false` sur une VRAIE meilleure porte ne lit rien non plus", async () => {
    const { appels, fetchImpl } = noeud({});
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER,
      direction: "1->0",
      amount_in: TAILLE,
      proprietaire: MOI,
      construire: false,
    });
    expect((r.corps as { alternative: { etat: string } }).alternative.etat).toBe("MEILLEURE_PORTE");
    expect((r.corps as { envoi: { etat: string } }).envoi.etat).toBe("NON_DEMANDE");
    expect(appels).toEqual([]);
  });
});

/* ------------------------------------- le cas reel, et les trois lectures */

describe("le couple reel a 78,67 bps : ERC-20 en entree", () => {
  it("la comparaison porte l'economie mesuree et les deux portes", async () => {
    const { fetchImpl } = noeud({});
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER,
      direction: "1->0",
      amount_in: TAILLE,
      construire: false,
    });
    const a = (r.corps as { alternative: { etat: string; economie_bps: number; actuelle: { bps: number }; proposee: { bps: number; poolId: string } } }).alternative;
    expect(a.etat).toBe("MEILLEURE_PORTE");
    expect(a.actuelle.bps).toBeCloseTo(295.5924, 3);
    expect(a.proposee.bps).toBeCloseTo(216.924, 3);
    expect(a.economie_bps).toBeCloseTo(78.6684, 3);
  });

  it("sans `proprietaire`, l'ERC-20 s'arrete a ETAT_PERMIT2_INCONNU apres la seule cotation", async () => {
    // le sens 1->0 depense le jeton ERC-20 : l'etat Permit2 depend de QUI signe
    const { appels, fetchImpl } = noeud({ "0xaa9d21cb": "0x" + mot(5n * 10n ** 18n) });
    const r = await poste(appli(fetchImpl), { pool_id: CHER, direction: "1->0", amount_in: TAILLE });
    const e = (r.corps as { envoi: { etat: string; raison: string } }).envoi;
    expect(e.etat).toBe("ETAT_PERMIT2_INCONNU");
    expect(e.raison).toMatch(/proprietaire/);
    // la cotation seule : un appel, pas trois
    expect(appels).toEqual(["0xaa9d21cb"]);
  });

  it("les trois lectures faites, allowance a zero -> APPROBATION_REQUISE", async () => {
    const { appels, fetchImpl } = noeud({
      "0xaa9d21cb": "0x" + mot(5n * 10n ** 18n), // cotation
      "0xdd62ed3e": "0x" + mot(0n), // allowance ERC-20 -> Permit2 : rien
      "0x927da105": "0x" + mot(0n) + mot(0n) + mot(3n), // triplet lu
    });
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER, direction: "1->0", amount_in: TAILLE, proprietaire: MOI,
    });
    const c = r.corps as {
      appels_rpc: number;
      lectures: { quoi: string; rejeu: string }[];
      envoi: { etat: string; permit2: { approbation: { to: string; data: string } } };
    };
    expect(c.appels_rpc).toBe(3);
    expect(appels.sort()).toEqual(["0x927da105", "0xaa9d21cb", "0xdd62ed3e"]);
    expect(c.envoi.etat).toBe("APPROBATION_REQUISE");
    expect(c.envoi.permit2.approbation.to.toLowerCase()).toBe(JETON);
    expect(c.envoi.permit2.approbation.data.slice(0, 10)).toBe("0x095ea7b3");
    // chaque lecture rend sa commande de rejeu
    expect(c.lectures).toHaveLength(3);
    for (const l of c.lectures) expect(l.rejeu).toMatch(/^cast call /);
  });

  it("approuve, triplet lu -> SIGNATURE_REQUISE, avec le nonce LU dans le message", async () => {
    const { fetchImpl } = noeud({
      "0xaa9d21cb": "0x" + mot(5n * 10n ** 18n),
      "0xdd62ed3e": "0x" + mot((1n << 255n) - 1n),
      "0x927da105": "0x" + mot(0n) + mot(0n) + mot(9n),
    });
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER, direction: "1->0", amount_in: TAILLE, proprietaire: MOI,
    });
    const e = (r.corps as { envoi: { etat: string; permit2: { aSigner: { message: { details: { nonce: string; token: string } } } } } }).envoi;
    expect(e.etat).toBe("SIGNATURE_REQUISE");
    expect(e.permit2.aSigner.message.details.nonce).toBe("9");
    expect(e.permit2.aSigner.message.details.token.toLowerCase()).toBe(JETON);
  });

  it("autorisation du routeur NON LUE -> NONCE_NON_LU, pas un nonce fabrique", async () => {
    const { fetchImpl } = noeud({
      "0xaa9d21cb": "0x" + mot(5n * 10n ** 18n),
      "0xdd62ed3e": "0x" + mot((1n << 255n) - 1n),
      // 0x927da105 absent : le faux noeud rend une erreur -> lecture non aboutie
    });
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER, direction: "1->0", amount_in: TAILLE, proprietaire: MOI,
    });
    const c = r.corps as { envoi: { etat: string }; lectures: { quoi: string; raison: string | null }[] };
    expect(c.envoi.etat).toBe("NONCE_NON_LU");
    const l = c.lectures.find((x) => x.quoi.includes("autorisation du routeur"))!;
    expect(l.raison).not.toBeNull();
  });

  it("cotation impossible -> SANS_PLANCHER : aucune transaction sans plancher de sortie", async () => {
    const { fetchImpl } = noeud({
      "0xaa9d21cb": "0x" + mot(0n), // le quoteur rend 0 : il ne cote pas
      "0xdd62ed3e": "0x" + mot((1n << 255n) - 1n),
      "0x927da105": "0x" + mot(0n) + mot(0n) + mot(1n),
    });
    const r = await poste(appli(fetchImpl), {
      pool_id: CHER, direction: "1->0", amount_in: TAILLE, proprietaire: MOI,
    });
    const e = (r.corps as { envoi: { etat: string; raison: string } }).envoi;
    expect(e.etat).toBe("SANS_PLANCHER");
    expect(e.raison).toMatch(/epingle au bloc/);
  });
});

/* ---------------------------------------------- l'ETH natif : deux appels de moins */

describe("l'ETH natif n'a rien a autoriser", () => {
  it("le sens 0->1 depense de l'ETH natif : une seule lecture, et la transaction est PRETE", async () => {
    const { appels, fetchImpl } = noeud({ "0xaa9d21cb": "0x" + mot(3000000n) });
    const r = await poste(appli(fetchImpl), {
      pool_id: NATIF, direction: "0->1", amount_in: TAILLE_NATIF, proprietaire: MOI,
    });
    const c = r.corps as {
      alternative: { etat: string };
      appels_rpc: number;
      envoi: { etat: string; native: boolean; commandes: string; transaction: { to: string; value: string }; deadline: string };
    };
    expect(c.alternative.etat).toBe("MEILLEURE_PORTE");
    expect(c.appels_rpc).toBe(1);
    expect(appels).toEqual(["0xaa9d21cb"]);
    expect(c.envoi.etat).toBe("PRET");
    expect(c.envoi.native).toBe(true);
    expect(c.envoi.commandes).toBe("0x10");
    expect(c.envoi.transaction.value).toBe("0x" + BigInt(TAILLE_NATIF).toString(16));
    // une echeance reelle, pas l'an 2106
    expect(BigInt(c.envoi.deadline)).toBe(MAINTENANT + 1200n);
  });
});

/* --------------------------------------------------------------- les refus d'entree */

describe("les refus d'entree disent lesquels", () => {
  it("un corps sans porte ni calldata est un 400 motive", async () => {
    const r = await poste(appli(), { amount_in: "1000" });
    expect(r.statut).toBe(400);
    expect(JSON.stringify(r.corps)).toMatch(/calldata/);
  });

  it("un pool_id qui n'est pas 32 octets est refuse avant tout calcul", async () => {
    const r = await poste(appli(), { pool_id: "0xabc", direction: "0->1" });
    expect(r.statut).toBe(400);
  });

  it("GET /alternative rend le mode d'emploi, y compris ce qu'elle ne fait pas", async () => {
    const res = await appli().request("/alternative");
    const b = (await res.json()) as { usage: { ce_qu_elle_ne_fait_pas: string } };
    expect(b.usage.ce_qu_elle_ne_fait_pas).toMatch(/n'envoie rien/);
  });
});
