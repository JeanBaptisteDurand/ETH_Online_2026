/**
 * LES ROUTES DU COMPTE, DE BOUT EN BOUT.
 *
 * C'est la surface exposee : ce qui passe ici entre dans la base, et ce qui en sort est ce
 * qu'un navigateur croit. Les tests signent avec une VRAIE cle privee et une vraie signature
 * secp256k1 — aucune simulation de l'authentification, sinon on ne testerait que nos mocks.
 *
 * Ce qu'ils tiennent :
 *
 *   - le parcours complet : nonce -> signature -> jeton -> compte -> cle -> journal ;
 *   - un nonce ne sert qu'UNE fois, meme avec une signature parfaite ;
 *   - une signature valide mais d'une AUTRE adresse est refusee ;
 *   - une cle d'API n'ouvre pas la lecture du compte, et une session n'ecrit pas au journal ;
 *   - sans abonnement actif, aucune cle n'est delivree — et le refus dit pourquoi ;
 *   - un compte ne voit rien d'un autre ;
 *   - chaque refus porte sa raison. Un 401 muet oblige l'appelant a deviner, et il devine mal.
 */
import "../src/config.js";
import { describe, it, expect, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { createCompteRouter } from "../src/compte/router.js";
import { CompteStore, dsnDepuisEnv } from "../src/compte/store.js";
import { hashPersonalSign } from "../src/compte/adresse.js";

const dsn = dsnDepuisEnv();
const store: CompteStore | null = dsn ? new CompteStore(dsn) : null;
let vivant = false;
if (store) {
  try {
    await store.migrer();
    vivant = true;
  } catch (e) {
    console.warn(`Postgres injoignable (${(e as Error).message.slice(0, 60)}) : suite SAUTEE`);
  }
}

/** Un portefeuille jetable : cle privee, adresse, et de quoi signer comme MetaMask. */
function portefeuille() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const adresse =
    "0x" +
    Array.from(keccak_256(pub.slice(1)), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(-40);
  const signer = (message: string): string => {
    const sig = secp256k1.sign(hashPersonalSign(message), priv);
    const r = sig.r.toString(16).padStart(64, "0");
    const s = sig.s.toString(16).padStart(64, "0");
    // v = 27 + recovery, la forme qu'ecrivent MetaMask et Rainbow
    const v = (27 + sig.recovery).toString(16).padStart(2, "0");
    return `0x${r}${s}${v}`;
  };
  return { adresse, signer };
}

const NS = randomBytes(4).toString("hex");
const app = createCompteRouter({ store: store ?? undefined });

afterAll(async () => {
  if (store && vivant) {
    // les portefeuilles jetables ont des adresses aleatoires : on nettoie par leur trace
    for (const a of nettoyer) await store.purgerParPrefixe(a.slice(0, 12)).catch(() => undefined);
    await store.purgerParPrefixe(`0x${NS}`).catch(() => undefined);
    await store.close().catch(() => undefined);
  }
});
const nettoyer: string[] = [];

/** Le JSON d'une reponse, type assez pour que tsc suive sans noyer les tests d'assertions. */
type Json = Record<string, any>;
const lire = async (r: Response): Promise<Json> => (await r.json()) as Json;

const post = (chemin: string, corps: unknown, entetes: Record<string, string> = {}) =>
  app.request(`http://t${chemin}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  });
const get = (chemin: string, entetes: Record<string, string> = {}) =>
  app.request(`http://t${chemin}`, { headers: entetes });
const del = (chemin: string, entetes: Record<string, string> = {}) =>
  app.request(`http://t${chemin}`, { method: "DELETE", headers: entetes });

/** Ouvre une session pour un portefeuille neuf, et rend le jeton. */
async function connecter(): Promise<{ jeton: string; adresse: string }> {
  const w = portefeuille();
  nettoyer.push(w.adresse);
  const n = await lire(await post("/compte/nonce", { adresse: w.adresse }));
  const r = await post("/compte/session", {
    adresse: w.adresse,
    nonce: n.nonce,
    signature: w.signer(n.message),
  });
  const body = await lire(r);
  expect(r.status, JSON.stringify(body)).toBe(200);
  return { jeton: body.jeton, adresse: w.adresse };
}

/** Rend l'abonnement actif en base, sans toucher a la chaine. */
async function abonner(adresse: string) {
  const c = await store!.compte(adresse);
  await store!.ecrireAbonnement(c.id, {
    contrat: "0x" + "11".repeat(20),
    chainId: 84532,
    transaction: "0xtest",
    actifJusquAu: new Date(Date.now() + 30 * 864e5).toISOString(),
    raison: null,
  });
  return c;
}

describe.skipIf(!vivant)("le parcours de connexion", () => {
  it("nonce -> signature -> jeton, et le jeton ouvre le compte", async () => {
    const { jeton, adresse } = await connecter();
    const r = await get("/compte", { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(200);
    const b = await lire(r);
    expect(b.compte.adresse).toBe(adresse.toLowerCase());
    // sans abonnement, aucun telechargement n'est ouvert, et la raison est dite
    expect(b.abonnement.actif).toBe(false);
    expect(b.telechargements).toBeNull();
    expect(b.note).toMatch(/abonnement n'est pas actif/);
  });

  it("le message a signer est rendu par le serveur, pas reconstruit par le client", async () => {
    const w = portefeuille();
    nettoyer.push(w.adresse);
    const n = await lire(await post("/compte/nonce", { adresse: w.adresse }));
    // Il porte l'adresse et le nonce, et RIEN qui bouge — pas d'horloge : une premiere
    // version en avait une, reconstruite a la verification, donc aucune signature n'aurait
    // jamais verifie.
    expect(n.message).toContain(w.adresse.toLowerCase());
    expect(n.message).toContain(n.nonce);
    expect(n.message).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("un nonce ne sert qu'une fois, meme avec une signature parfaite", async () => {
    const w = portefeuille();
    nettoyer.push(w.adresse);
    const n = await lire(await post("/compte/nonce", { adresse: w.adresse }));
    const sig = w.signer(n.message);
    expect((await post("/compte/session", { adresse: w.adresse, nonce: n.nonce, signature: sig })).status).toBe(200);
    const deux = await post("/compte/session", { adresse: w.adresse, nonce: n.nonce, signature: sig });
    expect(deux.status).toBe(401);
    expect((await lire(deux)).error).toMatch(/nonce refuse/);
  });

  it("une signature valide d'une AUTRE adresse est refusee", async () => {
    const vrai = portefeuille();
    const imposteur = portefeuille();
    nettoyer.push(vrai.adresse, imposteur.adresse);
    const n = await lire(await post("/compte/nonce", { adresse: vrai.adresse }));
    // L'imposteur signe le message du vrai : la signature est mathematiquement valide, mais
    // elle ne vient pas de l'adresse annoncee. C'est le coeur du controle.
    const r = await post("/compte/session", {
      adresse: vrai.adresse,
      nonce: n.nonce,
      signature: imposteur.signer(n.message),
    });
    expect(r.status).toBe(401);
    const b = await lire(r);
    expect(b.error).toMatch(/autre adresse/);
    expect(b.detail).toContain(imposteur.adresse.toLowerCase());
  });

  it("une signature illisible est refusee en 400, pas en 500", async () => {
    const w = portefeuille();
    nettoyer.push(w.adresse);
    const n = await lire(await post("/compte/nonce", { adresse: w.adresse }));
    const r = await post("/compte/session", { adresse: w.adresse, nonce: n.nonce, signature: "0xdeadbeef" });
    expect(r.status).toBe(400);
    expect((await lire(r)).error).toMatch(/illisible/);
  });

  it("une adresse malformee est refusee avant tout travail", async () => {
    const r = await post("/compte/nonce", { adresse: "pas-une-adresse" });
    expect(r.status).toBe(400);
    expect((await lire(r)).attendu).toMatch(/40 hex/);
  });

  it("la deconnexion ferme la session, et le jeton ne rouvre rien", async () => {
    const { jeton } = await connecter();
    expect((await del("/compte/session", { authorization: `Bearer ${jeton}` })).status).toBe(200);
    const r = await get("/compte", { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(401);
    expect((await lire(r)).detail).toMatch(/ferme ou expire/);
  });

  it("sans en-tete, le refus DIT ce qu'il attendait", async () => {
    const r = await get("/compte");
    expect(r.status).toBe(401);
    expect((await lire(r)).detail).toMatch(/authorization: Bearer/);
  });
});

describe.skipIf(!vivant)("les cles d'API", () => {
  it("sans abonnement actif, aucune cle — et le refus dit pourquoi, en 402", async () => {
    const { jeton } = await connecter();
    const r = await post("/compte/cle", { portee: "mcp" }, { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(402);
    const b = await lire(r);
    expect(b.error).toMatch(/abonnement inactif/);
    expect(b.detail).toBeTruthy();
  });

  it("avec abonnement, la cle est delivree UNE fois et le dit", async () => {
    const { jeton, adresse } = await connecter();
    await abonner(adresse);
    const r = await post("/compte/cle", { portee: "mcp", nom: "mon agent" }, { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(201);
    const b = await lire(r);
    expect(b.cle).toMatch(/^tare_mcp_/);
    expect(b.note).toMatch(/rendue qu'une fois/);
    // et elle n'est plus jamais lisible : la liste ne porte que le prefixe
    const compte = await lire(await get("/compte", { authorization: `Bearer ${jeton}` }));
    expect(JSON.stringify(compte.cles)).not.toContain(b.cle.slice(20));
    expect(compte.telechargements).not.toBeNull();
  });

  it("revoquee, elle disparait de l'usage ; et on ne revoque pas celle d'un autre", async () => {
    const a = await connecter();
    await abonner(a.adresse);
    const cle = await lire(await post("/compte/cle", { portee: "mcp" }, { authorization: `Bearer ${a.jeton}` }));
    const b = await connecter();
    // b tente de revoquer la cle de a
    expect((await del(`/compte/cle/${cle.enregistree.id}`, { authorization: `Bearer ${b.jeton}` })).status).toBe(404);
    expect((await del(`/compte/cle/${cle.enregistree.id}`, { authorization: `Bearer ${a.jeton}` })).status).toBe(200);
  });
});

describe.skipIf(!vivant)("les deux authentifications ne se melangent pas", () => {
  it("une cle d'API n'ouvre PAS la lecture du compte", async () => {
    const { jeton, adresse } = await connecter();
    await abonner(adresse);
    const cle = await lire(await post("/compte/cle", { portee: "mcp" }, { authorization: `Bearer ${jeton}` }));
    // La cle est un secret de machine : elle ne doit pas donner acces a l'espace personnel.
    const r = await get("/compte", { authorization: `Bearer ${cle.cle}` });
    expect(r.status).toBe(401);
  });

  it("une session n'ecrit PAS au journal : l'ecriture demande une cle", async () => {
    const { jeton } = await connecter();
    const r = await post("/compte/journal", { source: "site", quoi: "analyse" }, { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(401);
    expect((await lire(r)).error).toMatch(/x-tare-cle/);
  });

  it("une cle d'extension ne peut pas deposer en se disant 'mcp'", async () => {
    const { jeton, adresse } = await connecter();
    await abonner(adresse);
    const ext = await lire(await post("/compte/cle", { portee: "extension" }, { authorization: `Bearer ${jeton}` }));
    // Sans ce controle, l'historique du compte mentirait sur l'origine de ce qu'il montre.
    const r = await post("/compte/journal", { source: "mcp", quoi: "analyse" }, { "x-tare-cle": ext.cle });
    expect(r.status).toBe(401);
    expect((await lire(r)).detail).toMatch(/portee differente/);
    // mais elle depose bien en tant qu'extension
    expect((await post("/compte/journal", { source: "extension", quoi: "verdict" }, { "x-tare-cle": ext.cle })).status).toBe(201);
  });
});

describe.skipIf(!vivant)("l'historique", () => {
  it("ce que l'extension depose apparait sur le compte, sans etre reinterprete", async () => {
    const { jeton, adresse } = await connecter();
    await abonner(adresse);
    const ext = await lire(await post("/compte/cle", { portee: "extension" }, { authorization: `Bearer ${jeton}` }));
    await post(
      "/compte/journal",
      { source: "extension", quoi: "verdict", sujet: "0x" + "22".repeat(20), detail: { verdict: "block", bps: 9999.53 } },
      { "x-tare-cle": ext.cle },
    );
    const j = await lire(await get("/compte/journal", { authorization: `Bearer ${jeton}` }));
    expect(j.lignes[0].source).toBe("extension");
    expect(j.lignes[0].detail.bps).toBe(9999.53);
    const compte = await lire(await get("/compte", { authorization: `Bearer ${jeton}` }));
    expect(compte.compteurs.verdict).toBeGreaterThanOrEqual(1);
  });

  it("il se filtre, et une nature inconnue est refusee plutot que rangee ailleurs", async () => {
    const { jeton } = await connecter();
    const r = await get("/compte/journal?quoi=nimportequoi", { authorization: `Bearer ${jeton}` });
    expect(r.status).toBe(400);
    expect((await lire(r)).attendu).toContain("substitution");
  });

  it("un compte ne voit rien du journal d'un autre", async () => {
    const a = await connecter();
    await abonner(a.adresse);
    const cle = await lire(await post("/compte/cle", { portee: "extension" }, { authorization: `Bearer ${a.jeton}` }));
    await post("/compte/journal", { source: "extension", quoi: "verdict", sujet: "secret-de-a" }, { "x-tare-cle": cle.cle });
    const b = await connecter();
    const j = await lire(await get("/compte/journal", { authorization: `Bearer ${b.jeton}` }));
    expect(j.lignes.some((l: { sujet: string }) => l.sujet === "secret-de-a")).toBe(false);
    expect(j.total).toBe(0);
  });
});
