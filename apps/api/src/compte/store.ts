/**
 * L'ACCES A LA BASE DES COMPTES.
 *
 * Meme base que l'index vectoriel — un seul Postgres a faire tourner. Les regles qui comptent
 * sont dans les types, pas dans les commentaires :
 *
 *   - un jeton et une cle d'API ne sont JAMAIS stockes en clair. On stocke leur sha256, et le
 *     secret n'existe que dans la reponse HTTP qui l'a cree. Perdu, il est perdu : c'est le
 *     comportement voulu, et le seul qui rend une base volee inutile.
 *   - un nonce ne sert qu'une fois : `consommerNonce` fait la verification et la consommation
 *     dans UNE requete atomique. Deux appels concurrents ne peuvent pas le consommer deux fois.
 *   - un abonnement dont `verifie_le` est nul n'est PAS actif. Jamais de supposition.
 */
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { SCHEMA_SQL, type Nature, type Portee, type Source } from "./schema.js";

export const hash = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

export interface Compte {
  id: string;
  adresse: string;
  cree_le: string;
  vu_le: string;
}

export interface CleApi {
  id: string;
  prefixe: string;
  nom: string;
  portee: Portee;
  cree_le: string;
  utilisee_le: string | null;
  revoquee_le: string | null;
}

export interface Abonnement {
  actif: boolean;
  contrat: string | null;
  chain_id: number | null;
  transaction: string | null;
  actif_jusqu_au: string | null;
  verifie_le: string | null;
  raison: string | null;
}

export interface LigneJournal {
  id: string;
  source: Source;
  quoi: Nature;
  sujet: string | null;
  detail: unknown;
  cree_le: string;
}

export class CompteStore {
  private pool: pg.Pool | null = null;

  constructor(readonly dsn: string) {}

  private p(): pg.Pool {
    if (!this.pool) this.pool = new pg.Pool({ connectionString: this.dsn, max: 4 });
    return this.pool;
  }

  async migrer(): Promise<void> {
    await this.p().query(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
    this.pool = null;
  }

  /* ------------------------------------------------------------ les comptes */

  /** Le compte de cette adresse, cree s'il n'existe pas. `vu_le` est rafraichi. */
  async compte(adresse: string): Promise<Compte> {
    const a = adresse.toLowerCase();
    const r = await this.p().query<Compte>(
      `INSERT INTO comptes (adresse) VALUES ($1)
       ON CONFLICT (adresse) DO UPDATE SET vu_le = now()
       RETURNING id::text, adresse, cree_le, vu_le`,
      [a],
    );
    return r.rows[0]!;
  }

  /* -------------------------------------------------------------- les nonces */

  async creerNonce(adresse: string, dureeMs = 5 * 60 * 1000): Promise<string> {
    const nonce = randomBytes(16).toString("hex");
    await this.p().query(
      `INSERT INTO nonces (nonce, adresse, expire_le) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
      [nonce, adresse.toLowerCase(), String(dureeMs)],
    );
    return nonce;
  }

  /**
   * Consomme le nonce s'il est valide POUR CETTE ADRESSE et pas encore consomme.
   * Rend false sinon — et un false ne dit pas laquelle des trois conditions a manque,
   * volontairement : distinguer « nonce inconnu » de « nonce deja servi » renseignerait
   * un attaquant sur ce qu'il a touche.
   */
  async consommerNonce(nonce: string, adresse: string): Promise<boolean> {
    const r = await this.p().query(
      `UPDATE nonces SET consomme_le = now()
        WHERE nonce = $1 AND adresse = $2 AND consomme_le IS NULL AND expire_le > now()`,
      [nonce, adresse.toLowerCase()],
    );
    return (r.rowCount ?? 0) === 1;
  }

  /* ------------------------------------------------------------ les sessions */

  /** Cree une session et rend le jeton EN CLAIR — la seule fois ou il existe. */
  async ouvrirSession(compteId: string, dureeMs = 7 * 24 * 3600 * 1000): Promise<string> {
    const jeton = randomBytes(32).toString("base64url");
    await this.p().query(
      `INSERT INTO sessions (jeton_hash, compte_id, expire_le)
       VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
      [hash(jeton), compteId, String(dureeMs)],
    );
    return jeton;
  }

  async compteDeSession(jeton: string): Promise<Compte | null> {
    const r = await this.p().query<Compte>(
      `SELECT c.id::text, c.adresse, c.cree_le, c.vu_le
         FROM sessions s JOIN comptes c ON c.id = s.compte_id
        WHERE s.jeton_hash = $1 AND s.revoquee_le IS NULL AND s.expire_le > now()`,
      [hash(jeton)],
    );
    return r.rows[0] ?? null;
  }

  async fermerSession(jeton: string): Promise<boolean> {
    const r = await this.p().query(
      `UPDATE sessions SET revoquee_le = now() WHERE jeton_hash = $1 AND revoquee_le IS NULL`,
      [hash(jeton)],
    );
    return (r.rowCount ?? 0) === 1;
  }

  /* ----------------------------------------------------------- les cles d'API */

  /**
   * Cree une cle et rend le secret EN CLAIR une seule fois. Le prefixe garde en base est
   * assez long pour reconnaitre sa cle dans une liste, trop court pour la reconstituer.
   */
  async creerCle(
    compteId: string,
    nom: string,
    portee: Portee,
  ): Promise<{ cle: string; enregistree: CleApi }> {
    const secret = `tare_${portee}_${randomBytes(24).toString("base64url")}`;
    const r = await this.p().query<CleApi>(
      `INSERT INTO cles_api (compte_id, prefixe, cle_hash, nom, portee)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text, prefixe, nom, portee, cree_le, utilisee_le, revoquee_le`,
      [compteId, secret.slice(0, 16), hash(secret), nom, portee],
    );
    return { cle: secret, enregistree: r.rows[0]! };
  }

  async cles(compteId: string): Promise<CleApi[]> {
    const r = await this.p().query<CleApi>(
      `SELECT id::text, prefixe, nom, portee, cree_le, utilisee_le, revoquee_le
         FROM cles_api WHERE compte_id = $1 ORDER BY cree_le DESC`,
      [compteId],
    );
    return r.rows;
  }

  async revoquerCle(compteId: string, id: string): Promise<boolean> {
    const r = await this.p().query(
      `UPDATE cles_api SET revoquee_le = now()
        WHERE id = $1 AND compte_id = $2 AND revoquee_le IS NULL`,
      [id, compteId],
    );
    return (r.rowCount ?? 0) === 1;
  }

  /**
   * Le compte derriere une cle d'API, si elle est vivante ET de la bonne portee.
   * `utilisee_le` est rafraichi : le compte doit pouvoir voir qu'une cle sert encore.
   */
  async compteDeCle(cle: string, portee: Portee): Promise<Compte | null> {
    const r = await this.p().query<Compte>(
      `UPDATE cles_api SET utilisee_le = now()
         WHERE cle_hash = $1 AND portee = $2 AND revoquee_le IS NULL
       RETURNING (SELECT id::text FROM comptes WHERE id = cles_api.compte_id) AS id,
                 (SELECT adresse FROM comptes WHERE id = cles_api.compte_id) AS adresse,
                 (SELECT cree_le FROM comptes WHERE id = cles_api.compte_id) AS cree_le,
                 (SELECT vu_le   FROM comptes WHERE id = cles_api.compte_id) AS vu_le`,
      [hash(cle), portee],
    );
    return r.rows[0] ?? null;
  }

  /* ----------------------------------------------------------- l'abonnement */

  async ecrireAbonnement(
    compteId: string,
    a: { contrat: string; chainId: number; transaction: string | null; actifJusquAu: string | null; raison: string | null },
  ): Promise<void> {
    await this.p().query(
      `INSERT INTO abonnements (compte_id, contrat, chain_id, transaction, actif_jusqu_au, verifie_le, raison)
       VALUES ($1, $2, $3, $4, $5, now(), $6)
       ON CONFLICT (compte_id) DO UPDATE SET
         contrat = $2, chain_id = $3, transaction = $4,
         actif_jusqu_au = $5, verifie_le = now(), raison = $6`,
      [compteId, a.contrat, a.chainId, a.transaction, a.actifJusquAu, a.raison],
    );
  }

  /** L'abonnement tel qu'il est en base. `actif` est FAUX si rien n'a jamais ete verifie. */
  async abonnement(compteId: string): Promise<Abonnement> {
    const r = await this.p().query<{
      contrat: string; chain_id: string; transaction: string | null;
      actif_jusqu_au: string | null; verifie_le: string | null; raison: string | null;
    }>(
      `SELECT contrat, chain_id::text, transaction, actif_jusqu_au, verifie_le, raison
         FROM abonnements WHERE compte_id = $1`,
      [compteId],
    );
    const l = r.rows[0];
    if (!l) {
      return {
        actif: false, contrat: null, chain_id: null, transaction: null,
        actif_jusqu_au: null, verifie_le: null,
        raison: "aucun abonnement enregistre pour ce compte",
      };
    }
    // Un abonnement jamais verifie sur la chaine n'est pas actif, meme si une date figure ici.
    const actif =
      l.verifie_le !== null &&
      l.actif_jusqu_au !== null &&
      new Date(l.actif_jusqu_au).getTime() > Date.now();
    return {
      actif,
      contrat: l.contrat,
      chain_id: Number(l.chain_id),
      transaction: l.transaction,
      actif_jusqu_au: l.actif_jusqu_au,
      verifie_le: l.verifie_le,
      raison: actif ? null : (l.raison ?? "abonnement expire ou non verifie sur la chaine"),
    };
  }

  /* -------------------------------------------------------------- le journal */

  async journaliser(
    compteId: string,
    e: { source: Source; quoi: Nature; sujet?: string | null; detail?: unknown },
  ): Promise<LigneJournal> {
    const r = await this.p().query<LigneJournal>(
      `INSERT INTO journal (compte_id, source, quoi, sujet, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id::text, source, quoi, sujet, detail, cree_le`,
      [compteId, e.source, e.quoi, e.sujet ?? null, JSON.stringify(e.detail ?? {})],
    );
    return r.rows[0]!;
  }

  async journal(
    compteId: string,
    opts: { limite?: number; quoi?: Nature } = {},
  ): Promise<{ lignes: LigneJournal[]; total: number; tronque: boolean }> {
    const limite = Math.min(Math.max(opts.limite ?? 50, 1), 500);
    const cond = opts.quoi ? `AND quoi = $3` : ``;
    const args: unknown[] = opts.quoi ? [compteId, limite, opts.quoi] : [compteId, limite];
    const r = await this.p().query<LigneJournal>(
      `SELECT id::text, source, quoi, sujet, detail, cree_le
         FROM journal WHERE compte_id = $1 ${cond}
        ORDER BY cree_le DESC, id DESC LIMIT $2`,
      args,
    );
    const t = await this.p().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM journal WHERE compte_id = $1 ${opts.quoi ? "AND quoi = $2" : ""}`,
      opts.quoi ? [compteId, opts.quoi] : [compteId],
    );
    const total = Number(t.rows[0]?.n ?? "0");
    // `tronque` est dit : une liste courte presentee comme complete est un mensonge.
    return { lignes: r.rows, total, tronque: total > r.rows.length };
  }

  /** Les compteurs que le compte affiche. Comptes, jamais estimes. */
  async resume(compteId: string): Promise<Record<string, number>> {
    const r = await this.p().query<{ quoi: string; n: string }>(
      `SELECT quoi, count(*)::text AS n FROM journal WHERE compte_id = $1 GROUP BY quoi`,
      [compteId],
    );
    const out: Record<string, number> = { analyse: 0, verdict: 0, substitution: 0, mesure: 0 };
    for (const l of r.rows) out[l.quoi] = Number(l.n);
    return out;
  }

  /**
   * Supprime les comptes dont l'adresse commence par ce prefixe, et tout ce qui en depend.
   *
   * Reserve aux TESTS : chaque execution se donne un prefixe unique et le nettoie a la fin.
   * Sans ca, les compteurs du journal montaient d'une execution a l'autre et un test passait
   * ou echouait selon le nombre de fois qu'on l'avait lance — c'est-a-dire un test qui ne
   * mesure rien. Le prefixe est exige non vide et assez long : un prefixe court effacerait
   * de vrais comptes.
   */
  async purgerParPrefixe(prefixe: string): Promise<number> {
    const p = prefixe.toLowerCase();
    if (!p.startsWith("0x") || p.length < 10) {
      throw new Error(`prefixe trop court ou malforme : ${prefixe}`);
    }
    const r = await this.p().query(`DELETE FROM comptes WHERE adresse LIKE $1`, [`${p}%`]);
    await this.p().query(`DELETE FROM nonces WHERE adresse LIKE $1`, [`${p}%`]);
    return r.rowCount ?? 0;
  }
}

export function dsnDepuisEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  return env["TARE_PG_DSN"] ?? env["DATABASE_URL"] ?? null;
}
