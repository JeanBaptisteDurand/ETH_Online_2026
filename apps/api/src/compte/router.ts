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
 *   GET  /compte/extension.zip -> l'extension, empaquetee, abonnement actif requis
 *   GET  /compte/mcp.tgz    -> le serveur MCP, empaquete par `npm pack`
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
import type { Context } from "hono";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { CompteStore, dsnDepuisEnv, type Compte } from "./store.js";
import { adresseQuiASigne, estAdresse, messageAsigner, SignatureInvalide } from "./adresse.js";
import { NATURES, PORTEES, SOURCES } from "./schema.js";
import { verifierAbonnement, type ConfigAbonnement } from "./abonnement.js";
import { estAbsent, paquetExtension, paquetMcp, type Resultat } from "./telechargement.js";

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

  /**
   * La base doit exister avant la premiere requete. La memoire de « c'est fait » vit dans le
   * STORE et pas ici : un drapeau local resterait vrai apres une perte de base, et la
   * requete suivante echouerait sur des tables absentes en annoncant autre chose. Le store
   * remet son drapeau a faux des qu'il recree un pool.
   */
  async function pret(): Promise<CompteStore | null> {
    if (!store) return null;
    await store.migrerSiBesoin();
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
        ? { extension: "/compte/extension.zip", mcp: "/compte/mcp.tgz", details: "/compte/paquets" }
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

    // LA PORTE OUVERTE, ET POURQUOI ELLE EST NOMMEE.
    //
    // Le contrat d'abonnement est ecrit et passe ses tests, mais il n'est DEPLOYE sur aucun
    // reseau public : sans lui, `ab.actif` est faux pour tout le monde, et personne ne peut
    // obtenir de cle — pas meme pour essayer l'extension ou le MCP. Une surface qu'on ne peut
    // pas essayer n'existe pas.
    //
    // `TARE_CLES_OUVERTES=1` leve la condition, et la reponse le DIT : `abonnement_exige:
    // false`. On n'ouvre pas en silence une porte qu'on presente comme fermee — l'ecran
    // affiche l'etat reel, et le jour ou le contrat est deploye, la variable disparait et la
    // regle revient sans qu'une ligne de code change.
    const ouvertes = process.env["TARE_CLES_OUVERTES"] === "1";
    if (!ab.actif && !ouvertes)
      return c.json({ error: "abonnement inactif", detail: ab.raison, abonnement: ab }, 402);

    const { cle, enregistree } = await s.creerCle(r.compte.id, corps.data.nom, corps.data.portee);
    return c.json(
      {
        cle,
        note: "notez-la maintenant : elle n'est rendue qu'une fois, la base n'en detient que le sha256",
        enregistree,
        abonnement_exige: !ouvertes,
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

  /* ------------------------------------------------------- les telechargements */

  /**
   * Les deux paquets, derriere la session ET l'abonnement.
   *
   * L'abonnement est relu EN BASE a chaque appel, pas deduit du fait qu'une session existe :
   * une session ouverte pendant l'abonnement survivrait a son expiration, et le
   * telechargement avec elle.
   *
   * Le refus dit toujours QUOI FAIRE. Un paquet non construit rend un 503 portant la commande
   * exacte — c'est un defaut d'exploitation de notre cote, pas une erreur de l'utilisateur,
   * et le faire passer pour un 404 lui ferait chercher chez lui.
   */
  async function servir(c: Context, produire: () => Resultat): Promise<Response> {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);

    const ab = await s.abonnement(r.compte.id);
    if (!ab.actif)
      return c.json(
        {
          error: "abonnement inactif",
          detail: ab.raison,
          abonnement: ab,
          note: "les telechargements sont fermes tant que l'abonnement n'est pas actif sur la chaine",
        },
        402,
      );

    let p: Resultat;
    try {
      p = produire();
    } catch (e) {
      return c.json({ error: "empaquetage impossible", detail: (e as Error).message.slice(0, 200) }, 503);
    }
    if (estAbsent(p))
      return c.json(
        {
          error: "paquet non construit",
          raison: p.raison,
          commande: p.commande,
          note: "ce n'est pas une erreur de ton cote : l'artefact n'a pas ete produit sur le serveur",
        },
        503,
      );

    // La ligne d'historique part AVANT l'envoi : un telechargement qu'on n'a pas note est un
    // trou dans l'historique que le compte promet de montrer.
    await s
      .journaliser(r.compte.id, {
        source: "site",
        quoi: "analyse",
        sujet: p.nom,
        detail: { telechargement: p.nom, version: p.version, sha256: p.sha256, octets: p.octets },
      })
      .catch(() => {
        /* un journal indisponible ne prive personne de son telechargement */
      });

    const corps = new Uint8Array(readFileSync(p.chemin));
    return new Response(corps, {
      status: 200,
      headers: {
        "content-type": p.type,
        "content-length": String(p.octets),
        "content-disposition": `attachment; filename="${p.nom}"`,
        // Le sha256 est dans un en-tete pour qu'on puisse verifier le fichier recu sans
        // nous refaire confiance : `shasum -a 256 tare-guard.zip`.
        "x-tare-sha256": p.sha256,
        "x-tare-version": p.version ?? "inconnue",
        "x-tare-construit-le": p.construit_le,
        "cache-control": "no-store",
      },
    });
  }

  app.get("/compte/extension.zip", (c) => servir(c, paquetExtension));
  app.get("/compte/mcp.tgz", (c) => servir(c, paquetMcp));

  /**
   * Ce que les deux paquets contiennent, SANS les telecharger. L'ecran du compte s'en sert
   * pour afficher la taille et la version avant de proposer le bouton.
   */
  app.get("/compte/paquets", async (c) => {
    const s = await pret();
    if (!s) return c.json(sansBase(), 503);
    const r = await parSession(s, c.req.header("authorization"));
    if ("error" in r) return c.json(r, 401);
    const ab = await s.abonnement(r.compte.id);
    const decrire = (p: Resultat) =>
      estAbsent(p)
        ? { disponible: false, raison: p.raison, commande: p.commande }
        : {
            disponible: true,
            nom: p.nom,
            octets: p.octets,
            sha256: p.sha256,
            version: p.version,
            construit_le: p.construit_le,
            contenu: p.contenu,
          };
    return c.json({
      abonnement: { actif: ab.actif, raison: ab.raison },
      ouverts: ab.actif,
      extension: decrire(paquetExtension()),
      mcp: decrire(paquetMcp()),
      note: ab.actif
        ? null
        : "les paquets sont decrits mais leur telechargement est ferme : l'abonnement n'est pas actif",
    });
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

    // `Number("abc")` vaut NaN, et un NaN traverse Math.min/Math.max intact pour finir dans
    // un `LIMIT` SQL, ou Postgres refuse et ou l'API rendait un 500 muet. Le refus est ici,
    // et il dit ce qu'il attendait.
    const limiteBrute = c.req.query("limite");
    let limite = 50;
    if (limiteBrute !== undefined) {
      if (!/^[0-9]+$/.test(limiteBrute))
        return c.json(
          { error: `limite invalide : ${limiteBrute}`, attendu: "un entier entre 1 et 500" },
          400,
        );
      limite = Number(limiteBrute);
      if (limite < 1 || limite > 500)
        return c.json(
          { error: `limite hors bornes : ${limite}`, attendu: "un entier entre 1 et 500" },
          400,
        );
    }

    const j = await s.journal(r.compte.id, {
      limite,
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

    // LA CLE NE SUFFIT PAS : l'abonnement doit etre actif au moment de l'ecriture. Sans ce
    // controle, une cle delivree pendant l'abonnement continuait d'ecrire indefiniment apres
    // son expiration — le service etait donc gratuit a vie pour qui s'etait abonne une fois.
    //
    // Le refus est NON DESTRUCTIF, et c'est important : l'extension analyse hors ligne, avec
    // sa table embarquee, et n'a besoin de personne pour rendre un verdict. Seul
    // l'HISTORIQUE sur le compte est un service abonne. Un 402 lui dit de continuer sans
    // journaliser, pas de s'arreter.
    const ab = await s.abonnement(compte.id);
    if (!ab.actif)
      return c.json(
        {
          error: "abonnement inactif",
          detail: ab.raison,
          abonnement: ab,
          note:
            "la cle est valide mais l'abonnement ne l'est plus : l'historique est ferme. " +
            "L'analyse locale, elle, ne depend pas de ce service et continue de fonctionner.",
        },
        402,
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
