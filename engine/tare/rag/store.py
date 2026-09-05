"""Le magasin : PostgreSQL + pgvector, image pgvector/pgvector:pg16 du compose.

Deux tables, et la deuxieme est la lecon du bug qu'on refuse d'heriter.

  rag_chunks   un morceau, son en-tete de graphe, son contenu, SON FICHIER ET
               SES LIGNES, et son vecteur. Index HNSW vector_cosine_ops.
  rag_builds   une ligne par construction : le modele, la dimension, le nombre
               de morceaux ecrits, les empreintes des fichiers sources. C'est ce
               qui permet de PROUVER qu'un index est peuple, et de dire avec
               quoi. CorLens a livre un `void ragIndex;` — un index construit,
               jamais rempli, et rien dans le systeme ne pouvait le contredire.

Trois refus explicites :

  * `load()` n'ecrit RIEN si la liste de morceaux est vide. Un TRUNCATE suivi de
    zero INSERT remplacerait un index valide par un index vide, en silence.
  * la table est creee a la dimension du fournisseur courant. Si une table
    existe a une autre dimension, on ne la reutilise pas : on refuse, ou on la
    recree explicitement (`recreate=True`). Melanger 768 et 1536 rend des
    distances plausibles et fausses.
  * `search()` sur une table vide leve `EmptyIndexError`, il ne rend pas `[]`.
    "L'index est vide" et "aucun passage ne correspond" sont deux phrases
    differentes, et l'API doit pouvoir les distinguer.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence

DEFAULT_DSN = "postgresql://tare:tare@127.0.0.1:5432/tare"
CHUNKS_TABLE = "rag_chunks"
BUILDS_TABLE = "rag_builds"


class StoreError(RuntimeError):
    pass


class EmptyIndexError(StoreError):
    """La table existe et ne contient aucune ligne. Ce n'est pas 'zero resultat'."""


class DimMismatchError(StoreError):
    """La table est dans un autre espace vectoriel que la requete."""


REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parents[3]

# Les deux seules clefs que ce module lit dans le .env. La liste est fermee : on
# ne charge pas un fichier de secrets entier dans l'environnement du moteur pour
# aller chercher une chaine de connexion.
_ENV_KEYS = ("TARE_PG_DSN", "DATABASE_URL")


def _from_dotenv(key: str) -> Optional[str]:
    """Lit UNE clef dans le .env de la racine. Rien n'est journalise, rien n'est
    exporte : la valeur est rendue a l'appelant et c'est tout. Le moteur tourne
    sous `make test`, qui ne source pas le .env — sans cela le test qui compte
    les lignes en base serait saute sur une machine ou la base tourne."""
    if key not in _ENV_KEYS:
        return None
    path = REPO_ROOT / ".env"
    if not path.exists():
        return None
    try:
        for raw in path.read_text(errors="replace").split("\n"):
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() != key:
                continue
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            return v or None
    except OSError:
        return None
    return None


def dsn_from_env(explicit: Optional[str] = None) -> str:
    """L'ordre : argument explicite, puis TARE_PG_DSN, puis DATABASE_URL, chacun
    cherche d'abord dans l'environnement puis dans le .env de la racine.

    TARE_PG_DSN existe parce que la machine de dev a deja un Postgres sur 5432 :
    le service `db` du compose y est demarre avec TARE_DB_PORT, et TARE_PG_DSN
    pointe dessus sans toucher a DATABASE_URL, que l'API utilise."""
    if explicit:
        return explicit
    for key in _ENV_KEYS:
        v = os.environ.get(key) or _from_dotenv(key)
        if v:
            return v
    return DEFAULT_DSN


def _vec(embedding: Sequence[float]) -> str:
    """pgvector accepte un litteral '[a,b,c]'. `repr(float)` conserve la
    precision aller-retour, contrairement a un format a n decimales."""
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


@dataclass
class Passage:
    id: str
    corpus: str
    doc_id: str
    title: str
    source_file: str
    line_start: int
    line_end: int
    header: str
    content: str
    chain_id: Optional[int]
    address: Optional[str]
    graph_node: Optional[str]
    distance: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "corpus": self.corpus, "doc_id": self.doc_id, "title": self.title,
            "source": {"file": self.source_file, "line_start": self.line_start,
                       "line_end": self.line_end,
                       "cite": f"{self.source_file}:{self.line_start}-{self.line_end}",
                       "replay": f"sed -n '{self.line_start},{self.line_end}p' {self.source_file}"},
            "chain_id": self.chain_id, "address": self.address, "graph_node": self.graph_node,
            "distance": round(self.distance, 6),
            "cosine_similarity": round(1.0 - self.distance, 6),
            "header": self.header, "content": self.content,
        }


class PgVectorStore:
    def __init__(self, dsn: Optional[str] = None, dim: int = 768,
                 chunks_table: str = CHUNKS_TABLE, builds_table: str = BUILDS_TABLE):
        self.dsn = dsn_from_env(dsn)
        self.dim = int(dim)
        self.chunks_table = chunks_table
        self.builds_table = builds_table

    # -- connexion

    def _conn(self):
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover - depend de l'environnement
            raise StoreError("psycopg absent : pip install 'psycopg[binary]'") from exc
        try:
            return psycopg.connect(self.dsn, autocommit=True, connect_timeout=10)
        except Exception as exc:
            raise StoreError(f"connexion refusee ({_safe_dsn(self.dsn)}): {exc}") from exc

    def reachable(self) -> tuple:
        try:
            with self._conn() as c:
                c.execute("SELECT 1")
            return True, ""
        except StoreError as exc:
            return False, str(exc)

    # -- schema

    def existing_dim(self) -> Optional[int]:
        """La dimension de la colonne `embedding` telle qu'elle est en base, ou
        None si la table n'existe pas. On la LIT, on ne la suppose pas."""
        with self._conn() as c:
            row = c.execute(
                "SELECT a.atttypmod FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid "
                "WHERE t.relname = %s AND a.attname = 'embedding' AND a.attnum > 0",
                (self.chunks_table,)).fetchone()
        return int(row[0]) if row and row[0] and row[0] > 0 else None

    def ensure_schema(self, recreate: bool = False) -> None:
        cur_dim = None
        try:
            cur_dim = self.existing_dim()
        except StoreError:
            raise
        if cur_dim is not None and cur_dim != self.dim and not recreate:
            raise DimMismatchError(
                f"{self.chunks_table} est en dimension {cur_dim}, l'embedder en {self.dim}. "
                "Deux espaces vectoriels ne se comparent pas : relancer avec --recreate.")
        with self._conn() as c:
            c.execute("CREATE EXTENSION IF NOT EXISTS vector")
            if recreate and cur_dim is not None and cur_dim != self.dim:
                c.execute(f"DROP TABLE IF EXISTS {self.chunks_table}")
            c.execute(
                f"CREATE TABLE IF NOT EXISTS {self.chunks_table} ("
                " id text PRIMARY KEY,"
                " corpus text NOT NULL,"
                " doc_id text NOT NULL,"
                " title text,"
                " source_file text NOT NULL,"
                " line_start integer NOT NULL,"
                " line_end integer NOT NULL,"
                " header text NOT NULL,"
                " content text NOT NULL,"
                " n_chars integer NOT NULL,"
                " chain_id integer,"
                " address text,"
                " graph_node text,"
                " embed_model text NOT NULL,"
                " embed_provider text NOT NULL,"
                " sha256 text NOT NULL,"
                " built_at timestamptz NOT NULL DEFAULT now(),"
                f" embedding vector({self.dim}) NOT NULL)")
            # HNSW + cosinus : l'operateur <=> est celui que search() utilise.
            c.execute(f"CREATE INDEX IF NOT EXISTS {self.chunks_table}_emb_hnsw "
                      f"ON {self.chunks_table} USING hnsw (embedding vector_cosine_ops)")
            c.execute(f"CREATE INDEX IF NOT EXISTS {self.chunks_table}_corpus "
                      f"ON {self.chunks_table} (corpus)")
            c.execute(f"CREATE INDEX IF NOT EXISTS {self.chunks_table}_addr "
                      f"ON {self.chunks_table} (address)")
            c.execute(
                f"CREATE TABLE IF NOT EXISTS {self.builds_table} ("
                " id bigserial PRIMARY KEY,"
                " built_at timestamptz NOT NULL DEFAULT now(),"
                " engine_ver text NOT NULL,"
                " embed_provider text NOT NULL,"
                " embed_model text NOT NULL,"
                " embed_dim integer NOT NULL,"
                " n_chunks integer NOT NULL,"
                " by_corpus jsonb NOT NULL,"
                " sources jsonb NOT NULL,"
                " graph jsonb NOT NULL,"
                " notes text)")

    # -- ecriture

    def load(self, rows: Sequence[Dict[str, Any]], embed_provider: str, embed_model: str,
             recreate: bool = False) -> int:
        """Remplace le contenu de la table par `rows`. Refuse une liste vide."""
        if not rows:
            raise StoreError(
                "aucun morceau a charger : on ne remplace pas un index existant par du vide. "
                "C'est exactement le `void ragIndex;` qu'on refuse d'heriter.")
        self.ensure_schema(recreate=recreate)
        cols = ("id", "corpus", "doc_id", "title", "source_file", "line_start", "line_end",
                "header", "content", "n_chars", "chain_id", "address", "graph_node",
                "embed_model", "embed_provider", "sha256", "embedding")
        placeholders = ",".join(["%s"] * (len(cols) - 1) + ["%s::vector"])
        with self._conn() as c, c.cursor() as cur:
            cur.execute(f"TRUNCATE {self.chunks_table}")
            for r in rows:
                emb = r.get("embedding")
                if not emb or len(emb) != self.dim:
                    raise StoreError(
                        f"{r.get('id')}: vecteur de dimension "
                        f"{len(emb) if emb else 0}, attendu {self.dim}")
                cur.execute(
                    f"INSERT INTO {self.chunks_table} ({','.join(cols)}) VALUES ({placeholders})",
                    (r["id"], r["corpus"], r["doc_id"], r.get("title"), r["source_file"],
                     int(r["line_start"]), int(r["line_end"]), r["header"], r["content"],
                     int(r.get("n_chars") or len(r["header"]) + len(r["content"])),
                     r.get("chain_id"), r.get("address"), r.get("graph_node"),
                     embed_model, embed_provider, r.get("sha256") or "", _vec(emb)))
            n = cur.execute(f"SELECT count(*) FROM {self.chunks_table}").fetchone()[0]
        if n != len(rows):
            raise StoreError(f"{len(rows)} morceaux envoyes, {n} en base — chargement incomplet")
        return int(n)

    def record_build(self, *, engine_ver: str, embed_provider: str, embed_model: str,
                     embed_dim: int, n_chunks: int, by_corpus: Dict[str, int],
                     sources: Any, graph: Any, notes: str = "") -> int:
        self.ensure_schema()
        with self._conn() as c:
            row = c.execute(
                f"INSERT INTO {self.builds_table} "
                "(engine_ver, embed_provider, embed_model, embed_dim, n_chunks, by_corpus, "
                " sources, graph, notes) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (engine_ver, embed_provider, embed_model, int(embed_dim), int(n_chunks),
                 json.dumps(by_corpus), json.dumps(sources), json.dumps(graph), notes)
            ).fetchone()
        return int(row[0])

    # -- lecture

    def count(self, corpus: Optional[str] = None) -> int:
        """Le compte reel des lignes. Une erreur de connexion LEVE : elle ne
        rend pas 0, sinon 'base injoignable' deviendrait 'index vide'."""
        with self._conn() as c:
            if corpus:
                row = c.execute(
                    f"SELECT count(*) FROM {self.chunks_table} WHERE corpus = %s",
                    (corpus,)).fetchone()
            else:
                row = c.execute(f"SELECT count(*) FROM {self.chunks_table}").fetchone()
        return int(row[0])

    def counts_by_corpus(self) -> Dict[str, int]:
        with self._conn() as c:
            rows = c.execute(
                f"SELECT corpus, count(*) FROM {self.chunks_table} GROUP BY corpus "
                "ORDER BY corpus").fetchall()
        return {r[0]: int(r[1]) for r in rows}

    def last_build(self) -> Optional[Dict[str, Any]]:
        with self._conn() as c:
            row = c.execute(
                f"SELECT id, built_at, engine_ver, embed_provider, embed_model, embed_dim, "
                f"n_chunks, by_corpus, sources, graph, notes FROM {self.builds_table} "
                "ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            return None
        return {"id": row[0], "built_at": row[1].isoformat(), "engine_ver": row[2],
                "embed_provider": row[3], "embed_model": row[4], "embed_dim": row[5],
                "n_chunks": row[6], "by_corpus": row[7], "sources": row[8],
                "graph": row[9], "notes": row[10]}

    def status(self) -> Dict[str, Any]:
        """L'etat de l'index, sans jamais deguiser une panne en index vide."""
        ok, why = self.reachable()
        if not ok:
            return {"reachable": False, "reason": why, "status": "INDEX_UNAVAILABLE"}
        try:
            dim = self.existing_dim()
        except StoreError as exc:
            return {"reachable": True, "reason": str(exc), "status": "INDEX_UNAVAILABLE"}
        if dim is None:
            return {"reachable": True, "status": "INDEX_ABSENT",
                    "reason": f"la table {self.chunks_table} n'existe pas"}
        n = self.count()
        return {"reachable": True, "status": "INDEX_READY" if n else "INDEX_EMPTY",
                "table": self.chunks_table, "dim": dim, "n_chunks": n,
                "by_corpus": self.counts_by_corpus() if n else {},
                "last_build": self.last_build()}

    def search(self, embedding: Sequence[float], k: int = 8,
               corpus: Optional[str] = None, address: Optional[str] = None,
               max_distance: Optional[float] = None) -> List[Passage]:
        if len(embedding) != self.dim:
            raise DimMismatchError(
                f"vecteur de requete en dimension {len(embedding)}, index en {self.dim}")
        n = self.count()
        if n == 0:
            raise EmptyIndexError(
                f"{self.chunks_table} est vide : aucun morceau charge. Ce n'est PAS "
                "'aucun passage ne correspond' — relancer python3 -m tare.rag build --load")
        vec = _vec(embedding)
        where, params = [], [vec]
        if corpus:
            where.append("corpus = %s")
            params.append(corpus)
        if address:
            where.append("address = %s")
            params.append(address.lower())
        clause = (" WHERE " + " AND ".join(where)) if where else ""
        params.extend([vec, int(k)])
        sql = (f"SELECT id, corpus, doc_id, title, source_file, line_start, line_end, header, "
               f"content, chain_id, address, graph_node, (embedding <=> %s::vector) AS distance "
               f"FROM {self.chunks_table}{clause} ORDER BY embedding <=> %s::vector LIMIT %s")
        with self._conn() as c:
            rows = c.execute(sql, tuple(params)).fetchall()
        out = [Passage(id=r[0], corpus=r[1], doc_id=r[2], title=r[3], source_file=r[4],
                       line_start=int(r[5]), line_end=int(r[6]), header=r[7], content=r[8],
                       chain_id=r[9], address=r[10], graph_node=r[11], distance=float(r[12]))
               for r in rows]
        if max_distance is not None:
            out = [p for p in out if p.distance <= max_distance]
        return out


def _safe_dsn(dsn: str) -> str:
    """Le DSN sans le mot de passe : il finit dans des messages d'erreur."""
    if "@" not in dsn:
        return dsn
    head, tail = dsn.rsplit("@", 1)
    if ":" in head:
        scheme_user = head.rsplit(":", 1)[0]
        return f"{scheme_user}:***@{tail}"
    return f"{head}@{tail}"
