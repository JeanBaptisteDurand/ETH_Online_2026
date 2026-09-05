"""Le RAG vectoriel derriere HTTP, parce que le chat ne peut pas lancer un processus par question.

Pourquoi ce fichier existe. `explain.ts` appelait `http://127.0.0.1:8787/rag/search` depuis le
premier jour et RIEN n'ecoutait a cette adresse : chaque explication du produit repartait avec
« RAG indisponible : HTTP 404 » dans son journal, puis se rabattait sur les regles. Le RAG
vectoriel etait construit, indexe, mesure — et jamais interroge par la seule surface qui en
avait besoin. Un composant qu'on ne branche pas ne compte pas.

Il est persistant pour une raison mesurable : la ligne de commande met environ 4,7 s par
question, dont l'essentiel est le demarrage de Python et le chargement du modele d'embedding.
Ici les deux sont payes UNE fois.

Ce qu'il ne fait pas : il ne repond jamais 200 avec une liste vide quand l'index est absent ou
la base injoignable. Un RAG muet doit se declarer muet — sinon l'appelant lit « aucun passage
pertinent » la ou il faut lire « je n'ai pas cherche ».

    python3 -m tare.rag.serve --port 8789
    curl -s 'http://127.0.0.1:8789/search' -X POST -d '{"q":"pourquoi 89 octets"}'
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional

from .embed import EmbedError, make_embedder
from .store import DimMismatchError, EmptyIndexError, PgVectorStore, StoreError

_LOCK = threading.Lock()
_STATE: Dict[str, Any] = {"embedder": None, "store": None, "why": None, "erreur": None}


def _warm(dsn: Optional[str], prefer: str) -> Dict[str, Any]:
    """Charge le modele et ouvre la base une fois. Une panne est MEMORISEE, pas rejouee en
    boucle a chaque requete — mais elle est reessayee si l'appelant insiste, parce qu'un
    Postgres qui redemarre ne doit pas condamner le serveur."""
    with _LOCK:
        if _STATE["embedder"] is not None and _STATE["store"] is not None:
            return _STATE
        try:
            emb, why = make_embedder(prefer=prefer)
            _STATE.update(embedder=emb, store=PgVectorStore(dsn=dsn, dim=emb.dim),
                          why=why, erreur=None)
        except EmbedError as exc:
            _STATE.update(embedder=None, store=None, erreur=f"EMBED_UNAVAILABLE: {exc}")
        except StoreError as exc:
            _STATE.update(embedder=None, store=None, erreur=f"INDEX_UNAVAILABLE: {exc}")
        return _STATE


def _search(q: str, k: int, corpus: Optional[str], address: Optional[str],
            dsn: Optional[str], prefer: str) -> tuple:
    st = _warm(dsn, prefer)
    if st["erreur"]:
        return 503, {"status": st["erreur"].split(":")[0], "error": st["erreur"],
                     "note": "aucun passage n'est rendu : le RAG n'a pas cherche, il est absent"}
    try:
        qv = st["embedder"].embed_one(q)
        passages = st["store"].search(qv, k=k, corpus=corpus, address=address)
    except EmptyIndexError as exc:
        return 503, {"status": "INDEX_EMPTY", "error": str(exc)}
    except DimMismatchError as exc:
        return 503, {"status": "DIM_MISMATCH", "error": str(exc)}
    except (StoreError, EmbedError) as exc:
        # Une panne en cours de route invalide l'etat : la prochaine requete rechauffera.
        with _LOCK:
            _STATE.update(embedder=None, store=None)
        return 503, {"status": "SEARCH_FAILED", "error": str(exc)}
    return 200, {
        "status": "OK", "q": q, "k": k,
        "embedding": st["embedder"].describe(),
        "embedding_selection": st["why"],
        "n": len(passages),
        "passages": [p.to_dict() for p in passages],
    }


def make_handler(dsn: Optional[str], prefer: str):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _send(self, code: int, body: Dict[str, Any]) -> None:
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, fmt, *a):  # une ligne par requete, pas la verbosite par defaut
            sys.stderr.write(f"[rag] {fmt % a}\n")

        def do_GET(self):
            # Le client historique (`explain.ts`) interroge en GET avec des parametres
            # d'URL. Un serveur qui n'accepterait que POST lui rendrait 404, et le chat
            # ecrirait « RAG indisponible » sans que personne comprenne pourquoi : c'est
            # exactement ce qui s'est passe pendant des jours. On accepte les deux formes.
            chemin, _, qs = self.path.partition("?")
            if chemin in ("/search", "/rag/search"):
                from urllib.parse import parse_qs

                p = parse_qs(qs)
                q = (p.get("q") or p.get("query") or p.get("question") or [""])[0]
                if not q.strip():
                    self._send(400, {"status": "NO_QUERY",
                                     "error": "parametre q (ou query, ou question) requis"})
                    return
                t0 = time.time()
                code, out = _search(q.strip(), int((p.get("k") or ["8"])[0]),
                                    (p.get("corpus") or [None])[0],
                                    (p.get("address") or [None])[0], dsn, prefer)
                out["took_ms"] = round((time.time() - t0) * 1000, 1)
                self._send(code, out)
                return
            if self.path.split("?")[0] in ("/health", "/"):
                st = _warm(dsn, prefer)
                pret = st["erreur"] is None
                self._send(200 if pret else 503, {
                    "status": "READY" if pret else "UNAVAILABLE",
                    "error": st["erreur"],
                    "embedding": st["embedder"].describe() if pret else None,
                })
                return
            self._send(404, {"status": "NOT_FOUND", "error": self.path})

        def do_POST(self):
            chemin = self.path.split("?")[0]
            if chemin not in ("/search", "/rag/search"):
                self._send(404, {"status": "NOT_FOUND", "error": self.path})
                return
            n = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError as exc:
                self._send(400, {"status": "BAD_JSON", "error": str(exc)})
                return
            q = body.get("q") or body.get("query") or body.get("question")
            if not isinstance(q, str) or not q.strip():
                self._send(400, {"status": "NO_QUERY",
                                 "error": "champ q (ou query, ou question) requis"})
                return
            t0 = time.time()
            code, out = _search(q.strip(), int(body.get("k") or 8),
                                body.get("corpus"), body.get("address"), dsn, prefer)
            out["took_ms"] = round((time.time() - t0) * 1000, 1)
            self._send(code, out)

    return H


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="tare.rag.serve")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8789)
    ap.add_argument("--dsn", default=None)
    ap.add_argument("--prefer", default="ollama")
    a = ap.parse_args(argv)

    st = _warm(a.dsn, a.prefer)
    if st["erreur"]:
        # On demarre quand meme : le chat doit recevoir un 503 qui EXPLIQUE, pas une
        # connexion refusee qu'il traduira en « RAG indisponible » sans savoir pourquoi.
        print(f"[rag] demarrage degrade : {st['erreur']}", file=sys.stderr)
    else:
        # Prechauffage. Le premier appel a Ollama charge le modele en memoire : mesure a
        # 33 s contre 1,6 s ensuite. Le payer au demarrage plutot qu'a la premiere question
        # d'un lecteur, c'est la difference entre « lent » et « casse ».
        t0 = time.time()
        try:
            st["embedder"].embed_one("prechauffage")
            print(f"[rag] pret — {st['embedder'].describe()} "
                  f"(modele charge en {time.time() - t0:.1f}s)", file=sys.stderr)
        except EmbedError as exc:
            print(f"[rag] modele injoignable au prechauffage : {exc}", file=sys.stderr)
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(a.dsn, a.prefer))
    print(f"[rag] http://{a.host}:{a.port}/search", file=sys.stderr)
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
