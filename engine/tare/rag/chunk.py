"""chunk_corpus() — le corpus decoupe, et JAMAIS vectorise brut.

Reprise directe de cobol-explorer/ingestion/index/chunk.py : chaque morceau est
`en-tete + "\\n\\n" + contenu`, et c'est cette concatenation qui part a
l'embedding. L'en-tete vient du graphe (graph_header.py).

Trois differences avec l'original, toutes forcees par le corpus de TARE :

1. Les LIGNES sont portees par le morceau. cobol-explorer citait un fichier ;
   la regle 4 de TARE exige qu'une citation se rejoue en une commande, donc un
   morceau porte `line_start`/`line_end` et son `sed -n 'a,bp' fichier`.
2. La prose est decoupee par SECTION (les titres markdown), pas par fichier :
   HONESTY.md fait 416 lignes et huit incidents distincts ; un seul vecteur pour
   les huit ne retrouve aucun des huit.
3. La fenetre est courte (≈1600 caracteres). granite-embedding:278m lit 512
   tokens ; au-dela, la fin du morceau n'est pas "moins pesee", elle est
   TRONQUEE — et un morceau tronque en silence est exactement le genre de faux
   negatif que docs/HONESTY.md recense.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import corpus as C
from . import graph_header as GH

# ≈ 1600 caracteres ~ 400 tokens : l'en-tete (≈500 c.) plus le contenu tiennent
# dans la fenetre de 512 tokens de granite-embedding:278m sans troncature.
MAX_CONTENT_CHARS = 1600
MIN_CONTENT_CHARS = 40

CORPUS_DOCS = "docs"
CORPUS_REGISTRY = "registry"
CORPUS_HOOK_SOURCE = "hook_source"


@dataclass
class Chunk:
    id: str
    corpus: str
    doc_id: str
    title: str
    source_file: str
    line_start: int
    line_end: int
    header: str
    content: str
    chain_id: Optional[int] = None
    address: Optional[str] = None
    graph_node: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def text(self) -> str:
        """CE QUI EST VECTORISE : l'en-tete d'abord, le contenu ensuite."""
        return self.header.rstrip() + "\n\n" + self.content.strip()

    @property
    def cite(self) -> str:
        return f"{self.source_file}:{self.line_start}-{self.line_end}"

    @property
    def replay(self) -> str:
        return f"sed -n '{self.line_start},{self.line_end}p' {self.source_file}"

    def sha(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id, "corpus": self.corpus, "doc_id": self.doc_id, "title": self.title,
            "source_file": self.source_file, "line_start": self.line_start,
            "line_end": self.line_end, "header": self.header, "content": self.content,
            "text": self.text, "n_chars": len(self.text), "chain_id": self.chain_id,
            "address": self.address, "graph_node": self.graph_node,
            "cite": self.cite, "replay": self.replay, "sha256": self.sha(),
            "extra": self.extra,
        }


# ----------------------------------------------------------------- markdown

_HEADING = re.compile(r"^(#{1,3})\s+(.*\S)\s*$")


def _sections(lines: List[str]) -> List[Dict[str, Any]]:
    """(titre, ligne_debut, ligne_fin) 1-indexees. Le preambule avant le premier
    titre est une section a part entiere, pas un orphelin jete."""
    marks: List[tuple] = []
    for i, ln in enumerate(lines, start=1):
        m = _HEADING.match(ln)
        if m:
            marks.append((i, m.group(2)))
    out: List[Dict[str, Any]] = []
    if not marks:
        return [{"title": "(document)", "start": 1, "end": len(lines)}]
    if marks[0][0] > 1:
        out.append({"title": "(preambule)", "start": 1, "end": marks[0][0] - 1})
    for k, (ln, title) in enumerate(marks):
        end = marks[k + 1][0] - 1 if k + 1 < len(marks) else len(lines)
        out.append({"title": title, "start": ln, "end": end})
    return out


def _windows(lines: List[str], start: int, end: int,
             max_chars: int = MAX_CONTENT_CHARS) -> List[tuple]:
    """Decoupe [start, end] en fenetres alignees sur les LIGNES. Jamais au milieu
    d'une ligne : une citation `sed -n 'a,bp'` doit rendre exactement ce qui a
    ete indexe."""
    out: List[tuple] = []
    cur_start = start
    cur_len = 0
    for ln in range(start, end + 1):
        line_len = len(lines[ln - 1]) + 1
        if cur_len and cur_len + line_len > max_chars:
            out.append((cur_start, ln - 1))
            cur_start, cur_len = ln, line_len
        else:
            cur_len += line_len
    if cur_len or not out:
        out.append((cur_start, end))
    return out


def chunk_markdown(source: C.Source, gi: Optional[GH.GraphIndex] = None,
                   max_chars: int = MAX_CONTENT_CHARS) -> List[Chunk]:
    text, lines = C.read_markdown(source)
    rel = source.rel
    chunks: List[Chunk] = []
    for sec in _sections(lines):
        wins = _windows(lines, sec["start"], sec["end"], max_chars)
        for k, (a, b) in enumerate(wins):
            body = "\n".join(lines[a - 1:b])
            if len(body.strip()) < MIN_CONTENT_CHARS:
                continue
            title = sec["title"] if len(wins) == 1 else f"{sec['title']} (partie {k + 1}/{len(wins)})"
            cited = _cited_facts(body, gi)
            header = GH.render_doc_header(title, rel, a, b, cited)
            chunks.append(Chunk(
                id=f"{rel}#{a}-{b}", corpus=CORPUS_DOCS, doc_id=rel, title=title,
                source_file=rel, line_start=a, line_end=b, header=header, content=body,
                extra={"source_name": source.name,
                       "cited_hooks": [c["address"] for c in cited]},
            ))
    return chunks


def _cited_facts(body: str, gi: Optional[GH.GraphIndex], limit: int = 3) -> List[Dict[str, Any]]:
    """Les adresses citees par un passage, resolues dans le graphe. Une adresse
    que le graphe ne connait pas n'est PAS inventee : elle est simplement
    absente de l'en-tete."""
    if gi is None:
        return []
    out: List[Dict[str, Any]] = []
    for addr in C.cited_addresses(body, limit=limit * 3):
        node = gi.hook_node(addr)
        if node is None:
            continue
        facts = gi.hook_facts(node)
        out.append({"address": addr, "node": node, "one_line": GH.one_line_hook(facts)})
        if len(out) >= limit:
            break
    return out


# ----------------------------------------------------------------- registre

_FLAG_ORDER = ["beforeInitialize", "afterInitialize", "beforeAddLiquidity", "afterAddLiquidity",
               "beforeRemoveLiquidity", "afterRemoveLiquidity", "beforeSwap", "afterSwap",
               "beforeDonate", "afterDonate", "beforeSwapReturnsDelta", "afterSwapReturnsDelta",
               "afterAddLiquidityReturnsDelta", "afterRemoveLiquidityReturnsDelta"]


def _registry_body(entry: Dict[str, Any]) -> str:
    h = entry.get("hook") or {}
    flags = entry.get("flags") or {}
    props = entry.get("properties") or {}
    L = [f"nom: {h.get('name') or '(sans nom)'}",
         f"adresse: {h.get('address')}",
         f"chaine: {h.get('chain')} ({h.get('chainId')})"]
    d = (h.get("description") or "").strip()
    if d:
        L.append("description: " + d)
    on = [k for k in _FLAG_ORDER if flags.get(k)]
    L.append("hooks declares actifs: " + (", ".join(on) if on else "aucun"))
    if props:
        L.append("proprietes declarees: " + ", ".join(
            f"{k}={v}" for k, v in props.items() if v not in (None, "", [], {})))
    dep = (h.get("deployer") or "").strip()
    L.append(f"deployeur declare: {dep or 'non declare dans la fiche'}")
    L.append(f"source verifiee: {bool(h.get('verifiedSource'))}")
    audit = (h.get("auditUrl") or "").strip()
    L.append(f"audit: {audit or 'aucun lien d audit dans la fiche'}")
    return "\n".join(L)


def chunk_registry(source: C.Source, gi: Optional[GH.GraphIndex] = None) -> List[Chunk]:
    """Une fiche = un document. Pas de regroupement par hook : le registre
    contient des couples (adresse, chainId) decrits DEUX fois, et fusionner les
    deux fiches ferait disparaitre la contradiction — c'est deja la raison pour
    laquelle RegistryEntry est un noeud et pas un attribut (graph/schema.py)."""
    rows = C.read_registry(source)
    rel = source.rel
    chunks: List[Chunk] = []
    for row in rows:
        e = row["entry"]
        h = e.get("hook") or {}
        addr = (h.get("address") or "").strip().lower() or None
        chain_id = h.get("chainId")
        try:
            chain_id = int(chain_id) if chain_id is not None else None
        except (TypeError, ValueError):
            chain_id = None
        node = gi.hook_node(addr, chain_id) if (gi and addr) else None
        if node is not None:
            header = GH.render_hook_header(gi.hook_facts(node))
        else:
            header = GH.render_absent_header(addr, chain_id, h.get("name"), h.get("chain"))
        l0 = row["line_start"] or 1
        l1 = row["line_end"] or l0
        chunks.append(Chunk(
            id=f"{rel}#{row['index']}", corpus=CORPUS_REGISTRY,
            doc_id=f"registry:{chain_id}:{addr}#{row['index']}",
            title=h.get("name") or (addr or "fiche"),
            source_file=rel, line_start=l0, line_end=l1,
            header=header, content=_registry_body(e),
            chain_id=chain_id, address=addr, graph_node=node,
            extra={"registry_index": row["index"],
                   "verified_source": bool(h.get("verifiedSource")),
                   "in_graph": node is not None},
        ))
    return chunks


# ----------------------------------------------------------------- solidity

_SOL_SYMBOL = re.compile(
    r"^\s*(?:abstract\s+)?(contract|library|interface)\s+(\w+)|^\s*function\s+(\w+)")


def chunk_solidity(source: C.Source, gi: Optional[GH.GraphIndex] = None,
                   max_chars: int = MAX_CONTENT_CHARS) -> List[Chunk]:
    """Le source verifie des hooks (docs/hooks-source/, lot P).

    Le repertoire peut ne pas exister : `read_solidity` rend alors une liste
    vide et cette fonction rend zero morceau. Le rapport de build porte
    `present: false` — on ne pretend jamais avoir indexe du code qu'on n'a pas.
    """
    files = C.read_solidity(source)
    chunks: List[Chunk] = []
    for f in files:
        lines = f["text"].split("\n")
        addr, chain_id = f["address"], f["chain_id"]
        node = gi.hook_node(addr, chain_id) if (gi and addr) else None
        if node is not None:
            base = GH.render_hook_header(gi.hook_facts(node))
        elif addr:
            base = GH.render_absent_header(addr, chain_id, None, None)
        else:
            base = f"SOURCE SOLIDITY {f['rel']} — aucune adresse deduite du chemin"
        symbol = "(sommet du fichier)"
        for (a, b) in _windows(lines, 1, len(lines), max_chars):
            for ln in lines[a - 1:b]:
                m = _SOL_SYMBOL.match(ln)
                if m:
                    symbol = m.group(2) or m.group(3) or symbol
                    break
            body = "\n".join(lines[a - 1:b])
            if len(body.strip()) < MIN_CONTENT_CHARS:
                continue
            header = (base + f"\nSOURCE {f['rel']} — {symbol}\n"
                      f"lignes {a}-{b}, rejeu: sed -n '{a},{b}p' {f['rel']}")
            chunks.append(Chunk(
                id=f"{f['rel']}#{a}-{b}", corpus=CORPUS_HOOK_SOURCE, doc_id=f["rel"],
                title=symbol, source_file=f["rel"], line_start=a, line_end=b,
                header=header, content=body, chain_id=chain_id, address=addr,
                graph_node=node, extra={"symbol": symbol},
            ))
    return chunks


# ----------------------------------------------------------------- orchestration

def chunk_corpus(gi: Optional[GH.GraphIndex] = None,
                 sources: Optional[List[C.Source]] = None,
                 max_chars: int = MAX_CONTENT_CHARS,
                 strict: bool = True) -> List[Chunk]:
    """Le corpus entier, en morceaux prefixes de leur en-tete de graphe.

    `strict=True` (defaut) : une source REQUISE absente leve CorpusError. C'est
    le contraire d'un glob tolerant, et c'est voulu — un index construit sur un
    corpus ampute rend des reponses qui ont l'air completes.
    """
    srcs = list(sources if sources is not None else C.default_corpus())
    missing = [s.rel for s in srcs if s.required and not s.exists()]
    if missing and strict:
        raise C.CorpusError("sources requises absentes: " + ", ".join(missing))
    out: List[Chunk] = []
    for s in srcs:
        if not s.exists():
            continue
        if s.kind == C.MARKDOWN:
            out.extend(chunk_markdown(s, gi, max_chars))
        elif s.kind == C.REGISTRY:
            out.extend(chunk_registry(s, gi))
        elif s.kind == C.SOLIDITY_DIR:
            out.extend(chunk_solidity(s, gi, max_chars))
    seen: Dict[str, int] = {}
    for c in out:
        if c.id in seen:
            seen[c.id] += 1
            c.id = f"{c.id}~{seen[c.id]}"
        else:
            seen[c.id] = 0
    return out
