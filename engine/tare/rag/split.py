"""
Pourquoi DEUX recuperateurs, et non un seul — mesure, pas affirmation.

Le banc `bench.py` comparait deux index vectoriels (avec / sans en-tete de graphe) sur dix
questions structurelles. Les deux ont marque 0.0. Ce n'etait pas un match nul : c'etait le
mauvais match. Ces dix questions sont des predicats numeriques ou topologiques — « lequel
preleve le plus », « combien de pools » — et AUCUN modele d'embedding ne compare des nombres.
Pire, les fiches du registre decrivent leurs frais en prose ; la similarite remonte donc les
hooks qui PARLENT de frais, pas ceux qu'on a MESURES comme prelevant.

Ce module pose le match correctement : trois recuperateurs, deux classes de questions.

  - vecteur+en-tete : l'index reel du produit (en-tete derive du graphe, puis contenu) ;
  - vecteur seul    : le meme index prive de son en-tete, pour isoler l'apport de celui-ci ;
  - graphe          : le predicat evalue exactement sur le graphe type.

  - questions STRUCTURELLES : la verite est un predicat de graphe, jamais choisie a la main.
  - questions SEMANTIQUES   : « pourquoi le stub fait-il 89 octets » — le graphe n'a aucune
    prose, donc aucun predicat ; il rend NON_REPONDABLE, ce qui est un resultat, pas un zero.

Les deux echecs sont symetriques et c'est tout l'argument : chaque recuperateur est muet sur
la classe de l'autre. Un produit qui n'en embarque qu'un ment sur la moitie des questions.

BIAIS DECLARE : les questions semantiques ont ete ECRITES A PARTIR des sections qui leur
servent de verite. Ce bras mesure donc la RECUPERATION d'un passage connu, pas la decouverte.
Le bras structurel n'a pas ce biais : sa verite est calculee.

Rejeu : cd engine && python3 -m tare.rag.split
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence, Set

from . import chunk as K
from . import corpus as C
from . import graph_header as GH
from .bench import QUESTIONS as STRUCTURAL, _rank, _scores, _prof
from .build import DATA_DIR, EmbedCache
from .embed import EmbedError, make_embedder

REPORT = DATA_DIR / "retriever-split.json"
DEFAULT_K = 10


@dataclass(frozen=True)
class SemanticQuestion:
    """Une question de prose. La verite est une section nommee, pas un predicat."""

    key: str
    text: str
    doc: str          # sous-chaine du chemin, ex. "LIMITS.md"
    heading: str      # sous-chaine du titre de section, insensible a la casse
    why: str


SEMANTIC: List[SemanticQuestion] = [
    SemanticQuestion(
        "stub_pas_stop", "pourquoi le talon rend-il des donnees au lieu de s'arreter net ?",
        "METHOD.md", "the stub", "Hooks.sol valide la taille des donnees rendues"),
    SemanticQuestion(
        "deux_mesureurs", "que se passe-t-il si deux mesures tournent sur le meme noeud anvil ?",
        "LIMITS.md", "measurer per anvil", "le talon est un etat global mutable du noeud"),
    SemanticQuestion(
        "contrefactuel", "comment comparer un pool a lui-meme sans son hook ?",
        "METHOD.md", "the wall", "la PoolKey contient l'adresse du hook"),
    SemanticQuestion(
        "faux_resultats", "quelles erreurs ce projet a-t-il produites avant de se corriger ?",
        "HONESTY.md", "", "le registre des faux resultats"),
    SemanticQuestion(
        "non_mesurable", "pourquoi un depassement de delai ne vaut-il jamais zero ?",
        "LIMITS.md", "", "un timeout donne NOT_MEASURABLE, jamais une valeur"),
    SemanticQuestion(
        "frais_lp_zero", "pourquoi mettre lpFeeOverride a zero ne supprime-t-il pas les frais ?",
        "LIMITS.md", "", "Pool.sol exige le drapeau 0x400000"),
]


def _cache_embed(embedder, cache: EmbedCache, texts: List[str], tag: str,
                 quiet: bool) -> List[List[float]]:
    out: List[Optional[List[float]]] = [None] * len(texts)
    shas = [hashlib.sha256(t.encode("utf-8")).hexdigest() for t in texts]
    todo = []
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



def _entity_scores(top: List[int], chunks: List[K.Chunk], truth_nodes: Set[str],
                   k: int) -> Dict[str, Any]:
    """Note des HOOKS, pas des morceaux : k morceaux rendus peuvent ne designer
    qu'un seul hook, et c'est ce hook-la qui compte."""
    found: List[str] = []
    first: Optional[int] = None
    for rank, i in enumerate(top, start=1):
        node = chunks[i].graph_node
        if node and node in truth_nodes:
            if node not in found:
                found.append(node)
            if first is None:
                first = rank
    n_truth = len(truth_nodes)
    return {
        "n_truth": n_truth,
        "unite": "hook",
        "hits_at_k": len(found),
        "recall_at_k": round(len(found) / min(n_truth, k), 4) if n_truth else None,
        "first_hit_rank": first,
        "reciprocal_rank": round(1.0 / first, 4) if first else 0.0,
    }

def _all_chunks(gi: GH.GraphIndex) -> List[K.Chunk]:
    """La MEME botte de foin pour les trois bras : tout ce que le produit indexe."""
    out: List[K.Chunk] = []
    for s in C.default_corpus():
        if s.kind == C.REGISTRY:
            out.extend(K.chunk_registry(s, gi))
        elif s.kind == C.SOLIDITY_DIR:
            out.extend(K.chunk_solidity(s, gi))
        else:
            out.extend(K.chunk_markdown(s, gi))
    return out


def run(k: int = DEFAULT_K, prefer: str = "ollama", quiet: bool = False) -> Dict[str, Any]:
    t0 = time.time()
    reg = next(s for s in C.default_corpus() if s.kind == C.REGISTRY)
    gi = GH.load_graph_index(hooklist=reg.path)
    chunks = _all_chunks(gi)

    facts: List[Optional[Dict[str, Any]]] = [
        gi.hook_facts(c.graph_node) if c.graph_node else None for c in chunks]

    embedder, why = make_embedder(prefer=prefer)
    cache = EmbedCache()
    with_h = _cache_embed(embedder, cache, [c.text for c in chunks], "AVEC en-tete", quiet)
    without_h = _cache_embed(embedder, cache, [c.content for c in chunks], "SANS en-tete", quiet)

    rows: List[Dict[str, Any]] = []

    # ---- classe 1 : structurelle. Verite calculee par predicat de graphe.
    #
    # SCORE AU NIVEAU ENTITE, et c'est une correction, pas un detail. Un hook mesure
    # apporte une cinquantaine de morceaux de code source ; le compter cinquante fois
    # gonfle l'ensemble de verite jusqu'a un tiers de la botte et transforme le hasard
    # en performance. Une premiere version de ce banc rapportait 0.07 pour cette raison.
    # Ces questions portent sur des HOOKS : on note donc des hooks.
    for q in STRUCTURAL:
        truth_nodes = {c.graph_node for c, f in zip(chunks, facts)
                       if c.graph_node and f is not None and q.predicate(f)}
        if not truth_nodes:
            rows.append({"classe": "structurelle", "key": q.key, "question": q.text,
                         "skipped": "aucun hook du graphe ne satisfait ce predicat"})
            continue
        qv = embedder.embed_one(q.text)
        rows.append({
            "classe": "structurelle", "key": q.key, "question": q.text, "verite": q.why,
            "vecteur_avec_entete": _entity_scores(_rank(qv, with_h, k), chunks, truth_nodes, k),
            "vecteur_sans_entete": _entity_scores(_rank(qv, without_h, k), chunks, truth_nodes, k),
            # Le graphe evalue le predicat : il rend exactement l'ensemble de verite.
            # Ce n'est pas un match gagne, c'est une question decidable. On le dit.
            "graphe": {"n_truth": len(truth_nodes), "recall_at_k": 1.0, "exact": True,
                       "note": "predicat evalue sur le graphe : reponse exacte par construction"},
        })

    # ---- classe 2 : semantique. Verite = une section nommee.
    for sq in SEMANTIC:
        truth = {
            i for i, c in enumerate(chunks)
            if sq.doc in c.source_file and sq.heading.lower() in c.title.lower()
        }
        if not truth:
            rows.append({"classe": "semantique", "key": sq.key, "question": sq.text,
                         "skipped": f"aucune section {sq.doc} / « {sq.heading} »"})
            continue
        qv = embedder.embed_one(sq.text)
        rows.append({
            "classe": "semantique", "key": sq.key, "question": sq.text, "verite": sq.why,
            "vecteur_avec_entete": _scores(_rank(qv, with_h, k), truth, len(truth), k),
            "vecteur_sans_entete": _scores(_rank(qv, without_h, k), truth, len(truth), k),
            # Aucun predicat de graphe ne porte sur de la prose : le graphe ne repond pas.
            "graphe": {"n_truth": len(truth), "recall_at_k": 0.0, "exact": False,
                       "note": "NON_REPONDABLE : le graphe n'indexe aucune prose"},
        })

    def _agg(classe: str, arm: str, field: str) -> Optional[float]:
        vals = [r[arm][field] for r in rows
                if r.get("classe") == classe and arm in r and r[arm].get(field) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    summary = {}
    for classe in ("structurelle", "semantique"):
        n = sum(1 for r in rows if r.get("classe") == classe and "vecteur_avec_entete" in r)
        summary[classe] = {
            "n_questions": n,
            "rappel_vecteur_avec_entete": _agg(classe, "vecteur_avec_entete", "recall_at_k"),
            "rappel_vecteur_sans_entete": _agg(classe, "vecteur_sans_entete", "recall_at_k"),
            "rappel_graphe": _agg(classe, "graphe", "recall_at_k"),
            "mrr_vecteur_avec_entete": _agg(classe, "vecteur_avec_entete", "reciprocal_rank"),
            "mrr_vecteur_sans_entete": _agg(classe, "vecteur_sans_entete", "reciprocal_rank"),
        }

    return {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "protocole": (
            "Une seule botte de foin — TOUT ce que le produit indexe — et trois recuperateurs. "
            "Deux classes de questions. Structurelle : la verite est un predicat de graphe, "
            "calculee, jamais choisie. Semantique : la verite est une section nommee, et les "
            "questions ont ete ECRITES A PARTIR de ces sections — ce bras mesure la "
            "recuperation d'un passage connu, pas la decouverte. Ce biais est declare."),
        "botte_de_foin": {
            "n_chunks": len(chunks),
            "par_corpus": {c: sum(1 for x in chunks if x.corpus == c)
                           for c in sorted({x.corpus for x in chunks})},
            "n_avec_noeud_graphe": sum(1 for f in facts if f is not None),
        },
        "embedding": embedder.describe(),
        "embedding_selection": why,
        "k": k,
        "summary": summary,
        "questions": rows,
        "elapsed_s": round(time.time() - t0, 2),
        "replay": "cd engine && python3 -m tare.rag.split",
    }


def main(argv: Optional[List[str]] = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(prog="tare.rag.split")
    ap.add_argument("--k", type=int, default=DEFAULT_K)
    ap.add_argument("--prefer", default="ollama")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    rep = run(k=a.k, prefer=a.prefer, quiet=a.quiet)
    if a.write:
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(rep, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"ecrit {REPORT}", file=sys.stderr)
    print(json.dumps(rep["summary"], indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
