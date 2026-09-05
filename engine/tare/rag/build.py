"""La construction de l'index : corpus -> morceaux -> vecteurs -> pgvector.

Le rapport de build est la piece a conviction. Il porte : quel registre, quel
graphe, quel modele, combien de morceaux par corpus, l'empreinte sha256 de
chaque fichier source. Il est ecrit sur disque (data/build-report.json, petit,
commitable) ET dans la table rag_builds. Sans lui, "l'index est a jour" est une
affirmation invérifiable.

Deux garanties d'honnetete :

  * la construction est ATOMIQUE du point de vue de la base. Les vecteurs sont
    tous calcules AVANT le premier INSERT. Si l'embedding casse au 800e sur
    1051, rien n'est charge, la base garde l'index precedent, et le processus
    sort en erreur avec le compte atteint. On ne charge jamais un index ampute
    qui repondrait comme s'il etait complet.
  * un cache disque (var/embed-cache.jsonl) evite de repayer les 1051
    embeddings a chaque essai. Il est indexe par (modele, sha256 du texte
    VECTORISE, en-tete compris) : changer un en-tete de graphe invalide l'entree
    toute seule, ce qui est le comportement voulu — le graphe nourrit l'index.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .. import __version__ as ENGINE_VER
from . import chunk as K
from . import corpus as C
from . import graph_header as GH
from .embed import EmbedError, Embedder, make_embedder
from .store import PgVectorStore, StoreError

DATA_DIR = Path(__file__).resolve().parent / "data"
VAR_DIR = Path(__file__).resolve().parent / "var"
REPORT_PATH = DATA_DIR / "build-report.json"
CACHE_PATH = VAR_DIR / "embed-cache.jsonl"
INDEX_PATH = VAR_DIR / "index.jsonl"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------ cache

class EmbedCache:
    """Cache disque des vecteurs, clef = (modele, sha256 du texte vectorise)."""

    def __init__(self, path: Path = CACHE_PATH):
        self.path = Path(path)
        self.mem: Dict[str, List[float]] = {}
        self.hits = 0
        self.misses = 0
        if self.path.exists():
            for line in self.path.read_text(errors="replace").split("\n"):
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue  # ligne tronquee par une interruption : ignoree, jamais devinee
                if rec.get("k") and rec.get("v"):
                    self.mem[rec["k"]] = rec["v"]

    @staticmethod
    def key(model: str, sha: str) -> str:
        return f"{model}|{sha}"

    def get(self, model: str, sha: str) -> Optional[List[float]]:
        v = self.mem.get(self.key(model, sha))
        if v is None:
            self.misses += 1
        else:
            self.hits += 1
        return v

    def put(self, model: str, sha: str, vec: List[float]) -> None:
        k = self.key(model, sha)
        self.mem[k] = vec
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a") as fh:
            fh.write(json.dumps({"k": k, "v": vec}) + "\n")


# ------------------------------------------------------------------ build

def build_chunks(hooklist: Optional[Path] = None, graph_json: Optional[Path] = None,
                 sources: Optional[List[C.Source]] = None,
                 max_chars: int = K.MAX_CONTENT_CHARS) -> tuple:
    """Les morceaux, et le graphe qui les a prefixes. Rien de reseau ici."""
    srcs = list(sources if sources is not None else C.default_corpus())
    reg = next((s for s in srcs if s.kind == C.REGISTRY and s.exists()), None)
    if hooklist is None and reg is not None:
        # Le graphe est reconstruit EN MEMOIRE avec le registre qu'on indexe,
        # pour que les 978 fiches aient toutes un en-tete de graphe. Le
        # graph.json publie n'est pas touche : il en compte 613.
        hooklist = reg.path
    gi = GH.load_graph_index(graph_json=graph_json, hooklist=hooklist)
    chunks = K.chunk_corpus(gi, sources=srcs, max_chars=max_chars)
    return chunks, gi


def embed_chunks(chunks: List[K.Chunk], embedder: Embedder,
                 cache: Optional[EmbedCache] = None,
                 progress: Optional[Callable[[int, int], None]] = None,
                 batch: int = 16) -> List[Dict[str, Any]]:
    """Tous les vecteurs, ou une exception. Jamais une liste partielle.

    Regle 3 : si l'embedding casse au milieu, on leve. L'appelant ne charge
    rien. Les vecteurs deja calcules restent dans le cache disque, donc la
    reprise ne les repaye pas — mais elle ne fait pas passer un index ampute
    pour complet.
    """
    cache = cache if cache is not None else EmbedCache()
    model = embedder.model
    rows: List[Dict[str, Any]] = []
    todo: List[int] = []
    for i, ch in enumerate(chunks):
        rec = ch.to_dict()
        v = cache.get(model, rec["sha256"])
        if v is not None and len(v) == embedder.dim:
            rec["embedding"] = v
        else:
            todo.append(i)
        rows.append(rec)

    done = len(chunks) - len(todo)
    for start in range(0, len(todo), batch):
        idxs = todo[start:start + batch]
        texts = [rows[i]["text"] for i in idxs]
        vecs = embedder.embed(texts)  # leve EmbedError si incomplet
        for i, v in zip(idxs, vecs):
            rows[i]["embedding"] = v
            cache.put(model, rows[i]["sha256"], v)
        done += len(idxs)
        if progress:
            progress(done, len(chunks))

    missing = [r["id"] for r in rows if not r.get("embedding")]
    if missing:
        raise EmbedError(f"{len(missing)} morceaux sans vecteur apres embedding "
                         f"(premier: {missing[0]}) — rien ne sera charge")
    return rows


def build(hooklist: Optional[Path] = None, graph_json: Optional[Path] = None,
          sources: Optional[List[C.Source]] = None, dsn: Optional[str] = None,
          load: bool = True, recreate: bool = False, prefer: str = "ollama",
          write_index: bool = True, quiet: bool = False) -> Dict[str, Any]:
    t0 = time.time()
    srcs = list(sources if sources is not None else C.default_corpus())
    state = C.resolve_corpus(srcs)
    if not state["ok"]:
        raise C.CorpusError("sources requises absentes: " + ", ".join(state["missing_required"]))

    chunks, gi = build_chunks(hooklist=hooklist, graph_json=graph_json, sources=srcs)
    embedder, why = make_embedder(prefer=prefer)

    def progress(done: int, total: int) -> None:
        if not quiet:
            print(f"\r  embeddings {done}/{total}", end="", file=sys.stderr, flush=True)

    cache = EmbedCache()
    rows = embed_chunks(chunks, embedder, cache, progress)
    if not quiet:
        print("", file=sys.stderr)

    by_corpus: Dict[str, int] = {}
    for c in chunks:
        by_corpus[c.corpus] = by_corpus.get(c.corpus, 0) + 1

    report: Dict[str, Any] = {
        "built_at": _now(),
        "engine_ver": ENGINE_VER,
        "rag_ver": __import__("tare.rag", fromlist=["__version__"]).__version__,
        "embedding": embedder.describe(),
        "embedding_selection": why,
        "n_chunks": len(chunks),
        "by_corpus": by_corpus,
        "chunk_chars": {
            "max": max((len(c.text) for c in chunks), default=0),
            "median": sorted(len(c.text) for c in chunks)[len(chunks) // 2] if chunks else 0,
        },
        "corpus": state,
        "fingerprints": [C.file_fingerprint(s.path) for s in srcs],
        "graph": {
            "source": gi.source,
            "meta": {k: v for k, v in (gi.meta or {}).items()
                     if k in ("engine_ver", "n_measurements", "n_registry_entries",
                              "n_chain_entries", "block_number", "backend")},
            "n_chunks_with_graph_node": sum(1 for c in chunks if c.graph_node),
            "n_registry_chunks_absent_from_graph": sum(
                1 for c in chunks if c.corpus == K.CORPUS_REGISTRY and not c.graph_node),
        },
        "cache": {"hits": cache.hits, "misses": cache.misses, "path": str(cache.path)},
        "elapsed_s": round(time.time() - t0, 2),
        "loaded": False,
    }

    if write_index:
        VAR_DIR.mkdir(parents=True, exist_ok=True)
        with INDEX_PATH.open("w") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")
        report["index_file"] = str(INDEX_PATH)

    if load:
        store = PgVectorStore(dsn=dsn, dim=embedder.dim)
        n = store.load(rows, embedder.provider, embedder.model, recreate=recreate)
        build_id = store.record_build(
            engine_ver=ENGINE_VER, embed_provider=embedder.provider,
            embed_model=embedder.model, embed_dim=embedder.dim, n_chunks=n,
            by_corpus=by_corpus, sources=report["fingerprints"], graph=report["graph"],
            notes=" | ".join(why))
        # On RELIT le compte : "charge" n'est pas une intention, c'est une lecture.
        report["loaded"] = True
        report["db"] = {"dsn": _mask(store.dsn), "rows_in_db": store.count(),
                        "by_corpus_in_db": store.counts_by_corpus(), "build_id": build_id}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    report["report_file"] = str(REPORT_PATH)
    return report


def _mask(dsn: str) -> str:
    from .store import _safe_dsn

    return _safe_dsn(dsn)
