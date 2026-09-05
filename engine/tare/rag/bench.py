"""Le banc : l'en-tete de graphe change-t-il quelque chose, oui ou non ?

La these reprise de cobol-explorer est que prefixer un document d'un en-tete
DERIVE DU GRAPHE fait remonter des documents qu'une recherche sur le texte seul
n'aurait pas trouves. C'est une these mesurable, et une these mesurable qu'on
n'a pas mesuree est une affirmation.

PROTOCOLE. On construit deux index sur EXACTEMENT le meme corpus — les fiches du
registre — et avec le meme modele :

    AVEC    en-tete de graphe + contenu de la fiche   (l'index de production)
    SANS    le contenu de la fiche, seul              (le temoin)

On pose ensuite des questions dont la BONNE REPONSE est calculee par le graphe,
pas choisie a la main. Chaque question porte un predicat — "les hooks a plus de
vingt pools", "ceux dont aucune cotation n'a abouti", "ceux qui ont un jumeau au
meme bytecode" — et l'ensemble de reference est l'ensemble des hooks que le
graphe dit satisfaire ce predicat. Personne ne choisit les gagnants.

Trois precautions, sans lesquelles le chiffre ne vaudrait rien :

  * les questions sont en langue naturelle et ne recopient PAS les tournures de
    l'en-tete. "jumeaux (meme bytecode ...)" n'apparait dans aucune question ;
  * le meme modele, le meme k, les memes fiches des deux cotes. Seul l'en-tete
    change ;
  * le resultat est publie tel quel. Si l'en-tete n'apporte rien, le rapport le
    dira. Un banc dont on ne publie que les bonnes nouvelles est un argument
    commercial, pas une mesure.

    cd engine && python3 -m tare.rag.bench            # ecrit data/header-lift.json
"""
from __future__ import annotations

import json
import math
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Set

from . import chunk as K
from . import corpus as C
from . import graph_header as GH
from .build import DATA_DIR, EmbedCache
from .embed import Embedder, EmbedError, make_embedder

REPORT = DATA_DIR / "header-lift.json"
DEFAULT_K = 10


# --------------------------------------------------------------- les predicats

@dataclass(frozen=True)
class Question:
    """Une question, et le predicat de graphe qui definit sa bonne reponse."""

    key: str
    text: str
    predicate: Callable[[Dict[str, Any]], bool]
    why: str


def _prof(f: Dict[str, Any]) -> Dict[str, Any]:
    return f.get("measurements") or {}


QUESTIONS: List[Question] = [
    Question(
        "mesures", "quels hooks ont ete mesures sur Base, et combien prennent-ils ?",
        lambda f: (_prof(f).get("n_measured") or 0) > 0,
        "au moins une mesure MEASURED dans le graphe"),
    Question(
        "gros_prelevement", "quel hook retire la plus grosse part d'un echange ?",
        lambda f: (_prof(f).get("bps_max") or 0) >= 500,
        "bps_max >= 500 sur les mesures MEASURED"),
    Question(
        "beaucoup_de_pools", "un hook utilise par des dizaines de paires de jetons",
        lambda f: (f.get("n_pools") or 0) >= 20,
        "au moins 20 pools attaches"),
    Question(
        "un_pour_cent", "les hooks qui prennent environ un pour cent sur chaque echange",
        lambda f: 95.0 <= (_prof(f).get("bps_median") or -1) <= 105.0,
        "bps median entre 95 et 105"),
    Question(
        "jamais_cote", "les hooks pour lesquels aucune cotation n'a jamais abouti",
        lambda f: (_prof(f).get("n") or 0) > 0 and (_prof(f).get("n_measured") or 0) == 0,
        "des mesures existent, aucune n'est MEASURED"),
    Question(
        "clones", "des contrats identiques deployes plusieurs fois",
        lambda f: (f.get("bytecode") or {}).get("n_twins", 0) >= 1,
        "au moins un autre hook au meme code_hash"),
    Question(
        "meme_auteur", "plusieurs hooks ecrits et deployes par la meme equipe",
        lambda f: (f.get("deployer") or {}).get("n_siblings", 0) >= 1,
        "au moins un hook frere par le deployeur"),
    Question(
        "une_seule_paire", "un hook qui ne sert qu'a une seule paire de jetons",
        lambda f: (f.get("n_pools") or 0) == 1,
        "exactement un pool attache"),
    Question(
        "sans_prelevement", "des hooks qui ne prennent rien du tout sur l'echange",
        lambda f: _prof(f).get("flat") is True,
        "toutes les mesures MEASURED <= 1 bps"),
    Question(
        "gros_contrat", "un hook dont le code deploye est particulierement volumineux",
        lambda f: ((f.get("bytecode") or {}).get("code_size") or 0) >= 20000,
        "bytecode d'au moins 20 000 octets"),
]


# ------------------------------------------------------------------ les mesures

def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return num / (na * nb) if na and nb else 0.0


def _rank(query_vec: Sequence[float], vectors: List[Sequence[float]], k: int) -> List[int]:
    scored = [(_cosine(query_vec, v), i) for i, v in enumerate(vectors)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [i for _, i in scored[:k]]


def _scores(top: List[int], truth: Set[int], n_truth: int, k: int) -> Dict[str, float]:
    hits = [i for i in top if i in truth]
    first = next((r for r, i in enumerate(top, start=1) if i in truth), None)
    return {
        "n_truth": n_truth,
        "hits_at_k": len(hits),
        "precision_at_k": round(len(hits) / k, 4),
        # Rappel plafonne : on ne peut pas retrouver plus de k documents en k.
        "recall_at_k": round(len(hits) / min(n_truth, k), 4) if n_truth else None,
        "first_hit_rank": first,
        "reciprocal_rank": round(1.0 / first, 4) if first else 0.0,
    }


# ------------------------------------------------------------------ le banc

def run(k: int = DEFAULT_K, prefer: str = "ollama", limit: Optional[int] = None,
        quiet: bool = False) -> Dict[str, Any]:
    t0 = time.time()
    reg = next(s for s in C.default_corpus() if s.kind == C.REGISTRY)
    gi = GH.load_graph_index(hooklist=reg.path)
    chunks = K.chunk_registry(reg, gi)
    if limit:
        chunks = chunks[:limit]

    facts: List[Optional[Dict[str, Any]]] = [
        gi.hook_facts(c.graph_node) if c.graph_node else None for c in chunks]

    embedder, why = make_embedder(prefer=prefer)
    cache = EmbedCache()

    def embed_all(texts: List[str], tag: str) -> List[List[float]]:
        out: List[Optional[List[float]]] = [None] * len(texts)
        todo = []
        import hashlib

        shas = [hashlib.sha256(t.encode("utf-8")).hexdigest() for t in texts]
        for i, sha in enumerate(shas):
            v = cache.get(embedder.model, sha)
            if v is not None and len(v) == embedder.dim:
                out[i] = v
            else:
                todo.append(i)
        for start in range(0, len(todo), 16):
            idxs = todo[start:start + 16]
            vecs = embedder.embed([texts[i] for i in idxs])
            for i, v in zip(idxs, vecs):
                out[i] = v
                cache.put(embedder.model, shas[i], v)
            if not quiet:
                print(f"\r  {tag} {min(start + 16, len(todo))}/{len(todo)}",
                      end="", file=sys.stderr, flush=True)
        if not quiet and todo:
            print("", file=sys.stderr)
        missing = [i for i, v in enumerate(out) if v is None]
        if missing:
            raise EmbedError(f"{len(missing)} vecteurs manquants pour {tag}")
        return out  # type: ignore[return-value]

    with_header = embed_all([c.text for c in chunks], "AVEC en-tete")
    without_header = embed_all([c.content for c in chunks], "SANS en-tete")

    rows: List[Dict[str, Any]] = []
    for q in QUESTIONS:
        truth = {i for i, f in enumerate(facts) if f is not None and q.predicate(f)}
        if not truth:
            rows.append({"key": q.key, "question": q.text, "predicate": q.why,
                         "skipped": "aucun hook du graphe ne satisfait ce predicat"})
            continue
        qv = embedder.embed_one(q.text)
        a = _scores(_rank(qv, with_header, k), truth, len(truth), k)
        b = _scores(_rank(qv, without_header, k), truth, len(truth), k)
        rows.append({
            "key": q.key, "question": q.text, "predicate": q.why,
            "with_header": a, "without_header": b,
            "delta_hits": a["hits_at_k"] - b["hits_at_k"],
            "delta_reciprocal_rank": round(a["reciprocal_rank"] - b["reciprocal_rank"], 4),
        })

    scored = [r for r in rows if "with_header" in r]
    def _mean(rs, side, field):
        vals = [r[side][field] for r in rs if r[side].get(field) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    report = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "protocol": (
            "Deux index sur le MEME corpus (les fiches du registre) et le MEME modele. "
            "AVEC = en-tete derive du graphe + fiche. SANS = fiche seule. Les bonnes "
            "reponses sont calculees par un predicat sur le graphe, jamais choisies."),
        "corpus": {"source": reg.rel, "n_documents": len(chunks),
                   "n_with_graph_node": sum(1 for f in facts if f is not None)},
        "embedding": embedder.describe(),
        "embedding_selection": why,
        "k": k,
        "n_questions": len(QUESTIONS),
        "n_scored": len(scored),
        "summary": {
            "mean_hits_at_k_with": _mean(scored, "with_header", "hits_at_k"),
            "mean_hits_at_k_without": _mean(scored, "without_header", "hits_at_k"),
            "mean_recall_at_k_with": _mean(scored, "with_header", "recall_at_k"),
            "mean_recall_at_k_without": _mean(scored, "without_header", "recall_at_k"),
            "mrr_with": _mean(scored, "with_header", "reciprocal_rank"),
            "mrr_without": _mean(scored, "without_header", "reciprocal_rank"),
            "questions_improved": sum(1 for r in scored if r["delta_hits"] > 0),
            "questions_unchanged": sum(1 for r in scored if r["delta_hits"] == 0),
            "questions_degraded": sum(1 for r in scored if r["delta_hits"] < 0),
        },
        "questions": rows,
        "elapsed_s": round(time.time() - t0, 2),
        "replay": "cd engine && python3 -m tare.rag.bench",
    }
    return report


def main(argv: Optional[List[str]] = None) -> int:
    import argparse

    ap = argparse.ArgumentParser("tare.rag.bench")
    ap.add_argument("-k", type=int, default=DEFAULT_K)
    ap.add_argument("--limit", type=int, default=None, help="n'utiliser que les N premieres fiches")
    ap.add_argument("--prefer", default="ollama", choices=("ollama", "openai"))
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--out", default=str(REPORT))
    args = ap.parse_args(argv)
    report = run(k=args.k, prefer=args.prefer, limit=args.limit, quiet=args.quiet)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    json.dump(report["summary"], sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write(f"\nrapport: {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
