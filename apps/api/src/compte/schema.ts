/**
 * LE SCHEMA DU COMPTE.
 *
 * Cinq tables, et chacune obeit a une regle du projet :
 *
 *   comptes       l'identite EST l'adresse. Aucun mot de passe, aucun courriel obligatoire :
 *                 rien a voler ici.
 *   nonces        a usage unique et lie a une adresse. Sans ca, une signature captee une fois
 *                 ouvre le compte pour toujours.
 *   sessions      le jeton est stocke HACHE. Une base lue ne donne aucune session utilisable.
 *   cles_api      pareil : hachee, avec un prefixe court en clair pour que l'utilisateur
 *                 reconnaisse sa cle dans une liste sans qu'on la detienne.
 *   abonnements   l'etat vient d'une LECTURE de la chaine, jamais d'une supposition. Un
 *                 abonnement non verifie n'est pas actif.
 *   journal       l'historique : ce que l'extension a attrape, les analyses faites, les
 *                 substitutions proposees. Une ligne par evenement, jamais reecrite.
 *
 * Le SQL est idempotent : `CREATE TABLE IF NOT EXISTS`. Il tourne au demarrage et a chaque
 * test, sur la meme base que l'index vectoriel.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS comptes (
  id           BIGSERIAL PRIMARY KEY,
  adresse      TEXT NOT NULL UNIQUE,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  vu_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce        TEXT PRIMARY KEY,
  adresse      TEXT NOT NULL,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le    TIMESTAMPTZ NOT NULL,
  -- non nul des qu'il a servi : un nonce ne sert qu'UNE fois
  consomme_le  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nonces_adresse ON nonces (adresse);

CREATE TABLE IF NOT EXISTS sessions (
  -- sha256 du jeton. Le jeton lui-meme n'existe que dans la reponse HTTP qui l'a cree.
  jeton_hash   TEXT PRIMARY KEY,
  compte_id    BIGINT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le    TIMESTAMPTZ NOT NULL,
  revoquee_le  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_compte ON sessions (compte_id);

CREATE TABLE IF NOT EXISTS cles_api (
  id           BIGSERIAL PRIMARY KEY,
  compte_id    BIGINT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  -- les 12 premiers caracteres, en clair : de quoi reconnaitre sa cle sans la detenir
  prefixe      TEXT NOT NULL,
  cle_hash     TEXT NOT NULL UNIQUE,
  nom          TEXT NOT NULL DEFAULT '',
  -- a quoi elle sert : 'extension' ou 'mcp'. Une cle d'extension ne doit pas ouvrir le MCP.
  portee       TEXT NOT NULL DEFAULT 'mcp',
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  utilisee_le  TIMESTAMPTZ,
  revoquee_le  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cles_compte ON cles_api (compte_id);

CREATE TABLE IF NOT EXISTS abonnements (
  compte_id    BIGINT PRIMARY KEY REFERENCES comptes(id) ON DELETE CASCADE,
  contrat      TEXT NOT NULL,
  chain_id     BIGINT NOT NULL,
  -- la transaction qui a paye. C'est ELLE qui fait foi, pas notre enregistrement.
  transaction  TEXT,
  actif_jusqu_au TIMESTAMPTZ,
  -- quand la chaine a ete lue pour la derniere fois. null = jamais verifie = PAS actif.
  verifie_le   TIMESTAMPTZ,
  raison       TEXT
);

CREATE TABLE IF NOT EXISTS journal (
  id           BIGSERIAL PRIMARY KEY,
  compte_id    BIGINT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  -- d'ou vient l'evenement : 'site' | 'extension' | 'mcp'
  source       TEXT NOT NULL,
  -- ce qui s'est passe : 'analyse' | 'verdict' | 'substitution' | 'mesure'
  quoi         TEXT NOT NULL,
  -- le sujet, quand il y en a un : une adresse de jeton, un pool, un hash de transaction
  sujet        TEXT,
  -- le detail brut, tel que la surface l'a envoye. On ne le reinterprete pas.
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_compte_date ON journal (compte_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS journal_quoi ON journal (compte_id, quoi);
`;

/** Les sources et natures acceptees. Une valeur hors liste est refusee, pas rangee ailleurs. */
export const SOURCES = ["site", "extension", "mcp"] as const;
export const NATURES = ["analyse", "verdict", "substitution", "mesure"] as const;
export const PORTEES = ["extension", "mcp"] as const;

export type Source = (typeof SOURCES)[number];
export type Nature = (typeof NATURES)[number];
export type Portee = (typeof PORTEES)[number];
