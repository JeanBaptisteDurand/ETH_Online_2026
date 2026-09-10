/**
 * LE MAGASIN DES COMPTES, CONTRE LA VRAIE BASE.
 *
 * Ce module tient des secrets : un jeton de session, une cle d'API. Les tests qui comptent ne
 * verifient pas qu'il « marche » — ils verifient qu'il ne peut PAS mal marcher :
 *
 *   - un secret n'existe qu'une fois, dans la reponse qui l'a cree, et la base n'en garde que
 *     le sha256. Une base volee ne donne aucune session ni aucune cle utilisable.
 *   - un nonce ne sert qu'UNE fois, et seulement pour SON adresse.
 *   - une cle d'extension n'ouvre pas le MCP.
 *   - un abonnement jamais verifie sur la chaine n'est PAS actif, meme si une date figure
 *     en base.
 *   - une liste tronquee le DIT.
 *
 * Ils sautent proprement si Postgres n'est pas la : un prerequis absent est un etat, pas un
 * echec — meme regle que les suites du graphe.
 */
// config.js EN PREMIER : il pose le .env, et dsnDepuisEnv() est appele au corps du module.
// Dans l'autre ordre, le DSN etait lu avant d'exister et les 20 tests se sautaient en silence.
import "../src/config.js";
import { describe, it, expect, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { CompteStore, dsnDepuisEnv, hash } from "../src/compte/store.js";

const dsn = dsnDepuisEnv();

/**
 * La migration tourne AU CORPS DU MODULE, pas dans beforeAll.
 *
 * `it.skipIf(x)` est evalue quand le test est DEFINI, c'est-a-dire pendant la collecte —
 * donc avant que beforeAll n'ait tourne. Avec la migration dans beforeAll, `vivant` valait
 * encore false a la collecte et les vingt tests se sautaient en silence, base disponible ou
 * non. Un test saute pour la mauvaise raison est pire qu'un test rouge : il ne se plaint pas.
 */
const store: CompteStore | null = dsn ? new CompteStore(dsn) : null;
let vivant = false;
if (store) {
  try {
    await store.migrer();
    vivant = true;
  } catch (e) {
    console.warn(
      `Postgres injoignable (${(e as Error).message.slice(0, 80)}) : la suite des comptes est SAUTEE, pas en echec`,
    );
  }
}

/**
 * Chaque execution se donne un prefixe d'adresses UNIQUE et l'efface a la fin.
 *
 * Sans ca, les lignes de journal s'accumulaient d'une execution a l'autre : le test du resume
 * attendait 2 substitutions et en trouvait 8 a la quatrieme execution. Un test qui passe ou
 * echoue selon le nombre de fois qu'on l'a lance ne mesure rien.
 */
const NS = randomBytes(4).toString("hex");

afterAll(async () => {
  if (store && vivant) await store.purgerParPrefixe(`0x${NS}`).catch(() => undefined);
  await store?.close().catch(() => undefined);
});

/** Une adresse unique par test ET par execution : `0x<ns><nom>0000…`. */
const adr = (n: string) => `0x${NS}${n}`.padEnd(42, "0").slice(0, 42);

describe.skipIf(!vivant)("le compte", () => {
  it("est cree a la premiere venue, et retrouve ensuite", async () => {
    const a = adr("a1");
    const c1 = await store!.compte(a);
    const c2 = await store!.compte(a.toUpperCase());
    expect(c2.id).toBe(c1.id);
    // l'adresse est rangee en minuscules : sinon la meme personne aurait deux comptes
    expect(c2.adresse).toBe(a.toLowerCase());
  });
});

describe.skipIf(!vivant)("le nonce ne sert qu'une fois", () => {
  it("consomme, il ne se consomme plus", async () => {
    const a = adr("b1");
    const n = await store!.creerNonce(a);
    expect(await store!.consommerNonce(n, a)).toBe(true);
    expect(await store!.consommerNonce(n, a)).toBe(false);
  });

  it("il n'ouvre pas une AUTRE adresse", async () => {
    const n = await store!.creerNonce(adr("b2"));
    // C'est le piege : sans le lien nonce/adresse, un nonce vole ouvrirait n'importe quel compte.
    expect(await store!.consommerNonce(n, adr("b3"))).toBe(false);
  });

  it("expire", async () => {
    const a = adr("b4");
    const n = await store!.creerNonce(a, -1000); // deja expire
    expect(await store!.consommerNonce(n, a)).toBe(false);
  });
});

describe.skipIf(!vivant)("la session", () => {
  it("le jeton n'est jamais en base — seulement son sha256", async () => {
    const c = await store!.compte(adr("c1"));
    const jeton = await store!.ouvrirSession(c.id);
    const retrouve = await store!.compteDeSession(jeton);
    expect(retrouve?.id).toBe(c.id);
    // le hash, lui, ne doit PAS ouvrir de session : c'est ce qui rend une base volee inutile
    expect(await store!.compteDeSession(hash(jeton))).toBeNull();
  });

  it("fermee, elle n'ouvre plus rien", async () => {
    const c = await store!.compte(adr("c2"));
    const jeton = await store!.ouvrirSession(c.id);
    expect(await store!.fermerSession(jeton)).toBe(true);
    expect(await store!.compteDeSession(jeton)).toBeNull();
    // et on ne ferme pas deux fois
    expect(await store!.fermerSession(jeton)).toBe(false);
  });

  it("expiree, elle n'ouvre plus rien", async () => {
    const c = await store!.compte(adr("c3"));
    const jeton = await store!.ouvrirSession(c.id, -1000);
    expect(await store!.compteDeSession(jeton)).toBeNull();
  });

  it("un jeton inconnu n'ouvre rien, et ne leve pas", async () => {
    expect(await store!.compteDeSession("jeton-qui-n-existe-pas")).toBeNull();
  });
});

describe.skipIf(!vivant)("la cle d'API", () => {
  it("le secret n'est rendu qu'une fois, et la base n'en a que le hash", async () => {
    const c = await store!.compte(adr("d1"));
    const { cle, enregistree } = await store!.creerCle(c.id, "mon agent", "mcp");
    expect(cle).toMatch(/^tare_mcp_/);
    // le prefixe garde en base reconnait la cle sans permettre de la reconstituer
    expect(cle.startsWith(enregistree.prefixe)).toBe(true);
    expect(enregistree.prefixe.length).toBeLessThan(cle.length);
    const liste = await store!.cles(c.id);
    expect(liste.some((k) => k.id === enregistree.id)).toBe(true);
    // aucune ligne de la liste ne porte le secret
    expect(JSON.stringify(liste)).not.toContain(cle.slice(16));
  });

  it("une cle d'extension n'ouvre PAS le MCP", async () => {
    const c = await store!.compte(adr("d2"));
    const { cle } = await store!.creerCle(c.id, "mon navigateur", "extension");
    expect((await store!.compteDeCle(cle, "extension"))?.id).toBe(c.id);
    // La portee est une frontiere, pas une etiquette : une cle posee dans un navigateur est
    // lisible par qui inspecte l'extension, elle ne doit pas ouvrir l'API payante.
    expect(await store!.compteDeCle(cle, "mcp")).toBeNull();
  });

  it("revoquee, elle n'ouvre plus rien", async () => {
    const c = await store!.compte(adr("d3"));
    const { cle, enregistree } = await store!.creerCle(c.id, "a jeter", "mcp");
    expect(await store!.revoquerCle(c.id, enregistree.id)).toBe(true);
    expect(await store!.compteDeCle(cle, "mcp")).toBeNull();
    expect(await store!.revoquerCle(c.id, enregistree.id)).toBe(false);
  });

  it("un compte ne peut pas revoquer la cle d'un autre", async () => {
    const a = await store!.compte(adr("d4"));
    const b = await store!.compte(adr("d5"));
    const { cle, enregistree } = await store!.creerCle(a.id, "a moi", "mcp");
    expect(await store!.revoquerCle(b.id, enregistree.id)).toBe(false);
    expect((await store!.compteDeCle(cle, "mcp"))?.id).toBe(a.id);
  });

  it("l'usage est date, pour qu'on voie qu'une cle sert encore", async () => {
    const c = await store!.compte(adr("d6"));
    const { cle, enregistree } = await store!.creerCle(c.id, "vivante", "mcp");
    expect(enregistree.utilisee_le).toBeNull();
    await store!.compteDeCle(cle, "mcp");
    const apres = (await store!.cles(c.id)).find((k) => k.id === enregistree.id)!;
    expect(apres.utilisee_le).not.toBeNull();
  });
});

describe.skipIf(!vivant)("l'abonnement ne s'invente pas", () => {
  it("sans enregistrement, il est INACTIF et dit pourquoi", async () => {
    const c = await store!.compte(adr("e1"));
    const ab = await store!.abonnement(c.id);
    expect(ab.actif).toBe(false);
    expect(ab.verifie_le).toBeNull();
    expect(ab.raison).toMatch(/aucun abonnement/);
  });

  it("verifie et dans sa periode, il est actif", async () => {
    const c = await store!.compte(adr("e2"));
    const dans30j = new Date(Date.now() + 30 * 864e5).toISOString();
    await store!.ecrireAbonnement(c.id, {
      contrat: "0x" + "ab".repeat(20), chainId: 84532, transaction: "0xdead", actifJusquAu: dans30j, raison: null,
    });
    const ab = await store!.abonnement(c.id);
    expect(ab.actif).toBe(true);
    expect(ab.chain_id).toBe(84532);
    expect(ab.verifie_le).not.toBeNull();
  });

  it("expire, il n'est plus actif, et la raison le dit", async () => {
    const c = await store!.compte(adr("e3"));
    await store!.ecrireAbonnement(c.id, {
      contrat: "0x" + "cd".repeat(20), chainId: 84532, transaction: "0xbeef",
      actifJusquAu: new Date(Date.now() - 864e5).toISOString(), raison: null,
    });
    const ab = await store!.abonnement(c.id);
    expect(ab.actif).toBe(false);
    expect(ab.raison).toMatch(/expire|non verifie/);
  });
});

describe.skipIf(!vivant)("le journal", () => {
  it("garde ce que chaque surface a envoye, sans le reinterpreter", async () => {
    const c = await store!.compte(adr("f1"));
    const l = await store!.journaliser(c.id, {
      source: "extension",
      quoi: "verdict",
      sujet: "0x" + "11".repeat(20),
      detail: { verdict: "block", bps: 9999.53, pool: "0xabc" },
    });
    expect(l.source).toBe("extension");
    const d = l.detail as { bps: number };
    expect(d.bps).toBe(9999.53);
  });

  it("rend les plus recentes d'abord, et DIT quand c'est tronque", async () => {
    const c = await store!.compte(adr("f2"));
    for (let i = 0; i < 7; i++)
      await store!.journaliser(c.id, { source: "site", quoi: "analyse", sujet: `s${i}` });
    const j = await store!.journal(c.id, { limite: 3 });
    expect(j.lignes).toHaveLength(3);
    expect(j.total).toBeGreaterThanOrEqual(7);
    expect(j.tronque).toBe(true);
    // le plus recent en premier
    expect(j.lignes[0]!.sujet).toBe("s6");
  });

  it("se filtre par nature, et le resume compte au lieu d'estimer", async () => {
    const c = await store!.compte(adr("f3"));
    await store!.journaliser(c.id, { source: "site", quoi: "analyse" });
    await store!.journaliser(c.id, { source: "site", quoi: "substitution" });
    await store!.journaliser(c.id, { source: "site", quoi: "substitution" });
    const subs = await store!.journal(c.id, { quoi: "substitution" });
    expect(subs.lignes.every((l) => l.quoi === "substitution")).toBe(true);
    const r = await store!.resume(c.id);
    expect(r["substitution"]).toBe(2);
    expect(r["analyse"]).toBe(1);
    // les natures jamais utilisees valent 0, pas undefined : un compteur absent se lirait mal
    expect(r["mesure"]).toBe(0);
  });

  it("un compte ne voit pas le journal d'un autre", async () => {
    const a = await store!.compte(adr("f4"));
    const b = await store!.compte(adr("f5"));
    await store!.journaliser(a.id, { source: "site", quoi: "analyse", sujet: "secret-de-a" });
    const jb = await store!.journal(b.id);
    expect(jb.lignes.some((l) => l.sujet === "secret-de-a")).toBe(false);
  });
});
