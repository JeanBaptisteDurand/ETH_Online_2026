"""La CLI du RAG.

    python3 -m tare.rag corpus              ce qui SERA indexe, avant de payer
    python3 -m tare.rag build [--no-load]   construit et charge dans pgvector
    python3 -m tare.rag status              l'etat de l'index, lu en base
    python3 -m tare.rag search "..."        une recherche, avec fichier et lignes

Toutes les sorties sont du JSON sur stdout, sauf `search --text`. Une panne sort
en code 1 avec {"status": "..."} : jamais un resultat vide qui ressemblerait a
"rien ne correspond".
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import build as B
from . import corpus as C
from .embed import EmbedError, make_embedder
from .store import DimMismatchError, EmptyIndexError, PgVectorStore, StoreError


def _out(payload: Any, code: int = 0) -> int:
    json.dump(payload, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")
    return code


def cmd_corpus(args: argparse.Namespace) -> int:
    state = C.resolve_corpus()
    if args.count:
        chunks, gi = B.build_chunks()
        by: Dict[str, int] = {}
        for c in chunks:
            by[c.corpus] = by.get(c.corpus, 0) + 1
        state["n_chunks"] = len(chunks)
        state["by_corpus"] = by
        state["graph_source"] = gi.source
    return _out(state, 0 if state["ok"] else 1)


def cmd_build(args: argparse.Namespace) -> int:
    try:
        report = B.build(hooklist=Path(args.hooklist) if args.hooklist else None,
                         dsn=args.dsn, load=not args.no_load, recreate=args.recreate,
                         prefer=args.prefer, quiet=args.quiet)
    except (C.CorpusError, EmbedError, StoreError) as exc:
        return _out({"status": "BUILD_FAILED", "error": str(exc),
                     "note": "rien n'a ete charge : l'index precedent est intact"}, 1)
    return _out(report)


def cmd_status(args: argparse.Namespace) -> int:
    store = PgVectorStore(dsn=args.dsn, dim=args.dim)
    st = store.status()
    st["dsn"] = B._mask(store.dsn)
    report = B.REPORT_PATH
    st["build_report"] = json.loads(report.read_text()) if report.exists() else None
    return _out(st, 0 if st.get("status") == "INDEX_READY" else 1)


def cmd_search(args: argparse.Namespace) -> int:
    try:
        embedder, why = make_embedder(prefer=args.prefer)
    except EmbedError as exc:
        return _out({"status": "EMBED_UNAVAILABLE", "error": str(exc)}, 1)
    store = PgVectorStore(dsn=args.dsn, dim=embedder.dim)
    try:
        qv = embedder.embed_one(args.query)
        passages = store.search(qv, k=args.k, corpus=args.corpus, address=args.address)
    except EmptyIndexError as exc:
        return _out({"status": "INDEX_EMPTY", "error": str(exc)}, 1)
    except DimMismatchError as exc:
        return _out({"status": "DIM_MISMATCH", "error": str(exc)}, 1)
    except StoreError as exc:
        return _out({"status": "INDEX_UNAVAILABLE", "error": str(exc)}, 1)
    except EmbedError as exc:
        return _out({"status": "EMBED_FAILED", "error": str(exc)}, 1)
    if args.text:
        for p in passages:
            print(f"[{p.distance:.4f}] {p.source_file}:{p.line_start}-{p.line_end}  {p.title}")
            print(f"        {p.replay if hasattr(p, 'replay') else ''}"
                  f"sed -n '{p.line_start},{p.line_end}p' {p.source_file}")
        return 0
    return _out({"status": "OK", "q": args.query, "k": args.k,
                 "embedding": embedder.describe(), "n": len(passages),
                 "passages": [p.to_dict() for p in passages]})


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser("tare.rag", description="Le RAG vectoriel de TARE")
    ap.add_argument("--dsn", default=None, help="DSN Postgres (defaut: TARE_PG_DSN / DATABASE_URL)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("corpus", help="ce qui sera indexe")
    p.add_argument("--count", action="store_true", help="decouper aussi, pour compter les morceaux")
    p.set_defaults(fn=cmd_corpus)

    p = sub.add_parser("build", help="construire l'index et le charger dans pgvector")
    p.add_argument("--hooklist", default=None)
    p.add_argument("--no-load", action="store_true", help="construire sans toucher a la base")
    p.add_argument("--recreate", action="store_true", help="recreer la table si la dimension change")
    p.add_argument("--prefer", default="ollama", choices=("ollama", "openai"))
    p.add_argument("--quiet", action="store_true")
    p.set_defaults(fn=cmd_build)

    p = sub.add_parser("status", help="l'etat de l'index, lu en base")
    p.add_argument("--dim", type=int, default=768)
    p.set_defaults(fn=cmd_status)

    p = sub.add_parser("search", help="une recherche")
    p.add_argument("query")
    p.add_argument("-k", type=int, default=8)
    p.add_argument("--corpus", default=None, choices=("docs", "registry", "hook_source"))
    p.add_argument("--address", default=None)
    p.add_argument("--prefer", default="ollama", choices=("ollama", "openai"))
    p.add_argument("--text", action="store_true", help="sortie courte, une ligne par passage")
    p.set_defaults(fn=cmd_search)

    args = ap.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
