/**
 * LES ROUTES DU COMPTE.
 *
 * Sous-app Hono autonome, montee en une ligne :  app.route("/", createCompteRouter());
 *
 * Le parcours, dans l'ordre ou il se vit :
 *
 *   POST /compte/nonce      -> un nonce et le TEXTE a signer, pour cette adresse
 *   POST /compte/session    -> {adresse, signature} verifiee -> un jeton de session
 *   GET  /compte            -> le compte, son abonnement, ses cles, ses compteurs
 *   POST /compte/cle        -> une cle d'API. Le secret est rendu UNE FOIS.
 *   DELETE /compte/cle/:id  -> revoquee
 *   GET  /compte/journal    -> l'historique : analyses, verdicts, substitutions
 *   POST /compte/journal    -> l'extension et le MCP y deposent, authentifies par CLE
 *   DELETE /compte/session  -> deconnexion
 *
 * Deux authentifications, jamais melangees. Le jeton de session (`authorization: Bearer`)
 * appartient a un humain devant un navigateur : il ouvre la lecture du compte et la gestion
 * des cles. La cle d'API (`x-tare-cle`) appartient a une machine : elle ouvre l'ecriture au
 * journal et rien d'autre. Une cle ne doit jamais pouvoir en creer une autre.
 *
 * Et le refus dit toujours sa raison. Un 401 muet oblige l'appelant a deviner, et il devine
 * mal — c'est la meme regle que les etiquettes du corpus.
 */
import { Hono } from "hono";
import { z } from "zod";
import { CompteStore, dsnDepuisEnv, type Compte } from "./store.js";
import { adresseQuiASigne, estAdresse, messageAsigner, SignatureInvalide } from "./adresse.js";
import { NATURES, PORTEES, SOURCES } from "./schema.js";
import { verifierAbonnement, type ConfigAbonnement } from "./abonnement.js";

const Nonce = z.object({ adresse: z.string() });
const Session = z.object({ adresse: z.string(), nonce: z.string(), signature: z.string() });
const NouvelleCle = z.object({
  nom: z.string().max(80).default(""),
  portee: z.enum(PORTEES),
});
const Evenement = z.object({
  source: z.enum(SOURCES),
  quoi: z.enum(NATURES),
  sujet: z.string().max(120).nullish(),
  detail: z.unknown().optional(),
});

export interface CompteRouterDeps {
  store?: CompteStore | null;
  abonnement?: ConfigAbonnement | null;
  /** injectable pour les tests : la lecture on-chain de l'abonnement */
  verifier?: typeof verifierAbonnement;
}

export function createCompteRouter(deps: CompteRouterDeps = {}): Hono {
  const dsn = dsnDepuisEnv();
  const store = deps.store ?? (dsn ? new CompteStore(dsn) : null);
  const verifier = deps.verifier ?? verifierAbonnement;
  let migre = false;

  /** La base doit exister avant la premiere requete. On migre une fois, paresseusement. */
  async function pret(): Promise<CompteStore | null> {
    if (!store) return null;
    if (!migre) {
      await store.migrer();
      migre = true;
    }
    return store;
  }

  const app = new Hono();

  /** Sans base, aucune route ne fait semblant de marcher. */
  const sansBase = () => ({
    error: "comptes indisponibles",
    detail:
      "aucune base n'est configuree (TARE_PG_DSN ou DATABASE_URL). Les comptes, les cles d'API " +
      "et l'historique en dependent ; le reste de l'API fonctionne sans.",
  });

  /* --------------------------------------------------- la preuve de possession */

  app.post("/compte/nonce", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const corps = Nonce.safeParse(await c.req.json().catch(() => null));
    if (!corps.success) return c.json({ error: "corps attendu : {adresse}" }, 400);
    const adresse = corps.data.adresse.toLowerCase();
    if (!estAdresse(adresse))
      return c.json({ error: `adresse malformee : ${corps.data.adresse}`, attendu: "0x + 40 hex" }, 400);

    const nonce = await s.creerNonce(adresse);
    return c.json({
      adresse,
      nonce,
      // On rend le TEXTE EXACT a signer. Le client ne le reconstruit pas : deux
      // reconstructions divergeraient un jour, et la signature ne verifierait plus.
      message: messageAsigner(adresse, nonce),
      expire_dans_s: 300,
    });
  });

  app.post("/compte/session", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const corps = Session.safeParse(await c.req.json().catch(() => null));
    if (!corps.success) return c.json({ error: "corps attendu : {adresse, nonce, signature}" }, 400);
    const adresse = corps.data.adresse.toLowerCase();
    if (!estAdresse(adresse)) return c.json({ error: `adresse malformee : ${corps.data.adresse}` }, 400);

    // Le nonce d'abord : consomme-le AVANT de verifier la signature. Sinon une signature
    // invalide laisserait le nonce vivant, et on pourrait la reessayer indefiniment.
    const ok = await s.consommerNonce(corps.data.nonce, adresse);
    if (!ok)
      return c.json(
        {
          error: "nonce refuse",
          detail: "inconnu, deja utilise, expire, ou emis pour une autre adresse. Demandez-en un neuf.",
        },
        401,
      );

    let signataire: string;
    try {
      // Le texte est reconstruit A L'IDENTIQUE : adresse + nonce, et rien qui bouge. C'est
      // pour ca que le message ne porte pas d'horloge.
      signataire = adresseQuiASigne(messageAsigner(adresse, corps.data.nonce), corps.data.signature);
    } catch (e) {
      if (e instanceof SignatureInvalide)
        return c.json({ error: "signature illisible", detail: e.message }, 400);
      throw e;
    }
    if (signataire !== adresse)
      return c.json(
        {
          error: "signature d'une autre adresse",
          detail: `signee par ${signataire}, annoncee pour ${adresse}`,
        },
        401,
      );

    const compte = await s.compte(adresse);
    const jeton = await s.ouvrirSession(compte.id);
    return c.json({
      jeton,
      // Le jeton n'est rendu qu'ici. On le dit, pour que le client le garde.
      note: "ce jeton n'est rendu qu'une fois : la base n'en detient que le sha256",
      compte: { adresse: compte.adresse, cree_le: compte.cree_le },
      expire_dans_j: 7,
    });
  });

  app.delete("/compte/session", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const jeton = bearer(c.req.header("authorization"));
    if (!jeton) return c.json({ error: "en-tete attendu : authorization: Bearer <jeton>" }, 401);
    const ferme = await s.fermerSession(jeton);
    return c.json({ ferme, note: ferme ? null : "session inconnue, deja fermee ou expiree" });
  });

  /* ------------------------------------------------------- le compte lui-meme */

  app.get("/compte", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);

    const [abonnement, cles, resume] = await Promise.all([
      s.abonnement(r.compte.id),
      s.cles(r.compte.id),
      s.resume(r.compte.id),
    ]);
    return c.json({
      compte: { adresse: r.compte.adresse, cree_le: r.compte.cree_le, vu_le: r.compte.vu_le },
      abonnement,
      // Aucune cle n'est rendue en clair ici, et il n'y a aucune route pour ca : un secret
      // qu'on peut relire n'est plus un secret.
      cles,
      compteurs: resume,
      telechargements: abonnement.actif
        ? { extension: "/compte/extension.zip", mcp: "/compte/mcp.tgz" }
        : null,
      note: abonnement.actif ? null : "l'abonnement n'est pas actif : les telechargements sont fermes",
    });
  });

  /* ----------------------------------------------------------- les cles d'API */

  app.post("/compte/cle", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);
    const corps = NouvelleCle.safeParse(await c.req.json().catch(() => ({})));
    if (!corps.success)
      return c.json({ error: "corps attendu : {portee: 'extension'|'mcp', nom?}" }, 400);

    // Une cle ne sert a rien sans abonnement, et le dire ici vaut mieux que de la delivrer
    // pour qu'elle soit refusee plus tard, sans qu'on sache pourquoi.
    const ab = await s.abonnement(r.compte.id);
    if (!ab.actif)
      return c.json({ error: "abonnement inactif", detail: ab.raison, abonnement: ab }, 402);

    const { cle, enregistree } = await s.creerCle(r.compte.id, corps.data.nom, corps.data.portee);
    return c.json(
      {
        cle,
        note: "notez-la maintenant : elle n'est rendue qu'une fois, la base n'en detient que le sha256",
        enregistree,
      },
      201,
    );
  });

  app.delete("/compte/cle/:id", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);
    const revoquee = await s.revoquerCle(r.compte.id, c.req.param("id"));
    return c.json(
      { revoquee, note: revoquee ? null : "cle inconnue, deja revoquee, ou appartenant a un autre compte" },
      revoquee ? 200 : 404,
    );
  });

  /* ---------------------------------------------------------- l'abonnement */

  app.post("/compte/abonnement", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);
    const cfg = deps.abonnement ?? null;
    if (!cfg)
      return c.json(
        {
          error: "abonnement non configure",
          detail: "TARE_ABONNEMENT_CONTRAT et TARE_ABONNEMENT_RPC sont requis pour lire la chaine",
        },
        503,
      );

    // L'etat vient d'une LECTURE de la chaine. Rien n'est cru sur parole, pas meme la
    // transaction que le client nous donnerait.
    const lu = await verifier(cfg, r.compte.adresse);
    await s.ecrireAbonnement(r.compte.id, {
      contrat: cfg.contrat,
      chainId: cfg.chainId,
      transaction: lu.transaction,
      actifJusquAu: lu.actifJusquAu,
      raison: lu.raison,
    });
    const ab = await s.abonnement(r.compte.id);
    return c.json({ abonnement: ab, lecture: lu }, ab.actif ? 200 : 402);
  });

  /* -------------------------------------------------------------- le journal */

  app.get("/compte/journal", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);
    const quoiBrut = c.req.query("quoi");
    if (quoiBrut && !(NATURES as readonly string[]).includes(quoiBrut))
      return c.json({ error: `nature inconnue : ${quoiBrut}`, attendu: NATURES }, 400);
    const j = await s.journal(r.compte.id, {
      limite: Number(c.req.query("limite") ?? 50),
      quoi: quoiBrut as (typeof NATURES)[number] | undefined,
    });
    return c.json(j);
  });

  /**
   * L'extension et le MCP deposent ici, authentifies par leur CLE — jamais par une session.
   * La portee est lue dans l'en-tete et verifiee : une cle d'extension ne peut pas se
   * declarer 'mcp' pour ecrire.
   */
  app.post("/compte/journal", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const cle = c.req.header("x-tare-cle");
    if (!cle) return c.json({ error: "en-tete attendu : x-tare-cle" }, 401);
    const corps = Evenement.safeParse(await c.req.json().catch(() => null));
    if (!corps.success)
      return c.json({ error: "corps attendu : {source, quoi, sujet?, detail?}", attendu: { source: SOURCES, quoi: NATURES } }, 400);

    // La source declaree doit correspondre a la portee de la cle. Sans ce controle, une cle
    // d'extension pourrait deposer des lignes en se disant 'mcp', et l'historique du compte
    // mentirait sur l'origine de ce qu'il montre.
    const portee = corps.data.source === "extension" ? "extension" : "mcp";
    const compte = await s.compteDeCle(cle, portee);
    if (!compte)
      return c.json(
        {
          error: "cle refusee",
          detail: `inconnue, revoquee, ou de portee differente de « ${portee} » (deduite de source=${corps.data.source})`,
        },
        401,
      );

    const ligne = await s.journaliser(compte.id, {
      source: corps.data.source,
      quoi: corps.data.quoi,
      sujet: corps.data.sujet ?? null,
      detail: corps.data.detail ?? {},
    });
    return c.json({ enregistre: ligne }, 201);
  });

  return app;
}

/* ------------------------------------------------------------------ utilitaires */

function bearer(h: string | undefined): string | null {
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]!.trim() : null;
}

async function parSession(
  s: CompteStore,
  header: string | undefined,
): Promise<{ compte: Compte } | { error: string; detail: string }> {
  const jeton = bearer(header);
  if (!jeton)
    return { error: "non authentifie", detail: "en-tete attendu : authorization: Bearer <jeton>" };
  const compte = await s.compteDeSession(jeton);
  if (!compte)
    return { error: "session refusee", detail: "jeton inconnu, ferme ou expire. Reconnectez-vous." };
  return { compte };
}
