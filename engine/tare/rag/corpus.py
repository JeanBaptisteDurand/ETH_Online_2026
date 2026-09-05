"""Le corpus, DECLARE source par source.

Pourquoi une declaration explicite plutot qu'un `glob("docs/**")` : un index
vide ne proteste pas. CorLens a livre un `void ragIndex;` — l'index etait
construit, jamais peuple, et personne ne s'en est apercu avant la demo, parce
qu'aucun endroit du code ne disait ce que l'index DEVAIT contenir. Ici la liste
est ecrite, chaque entree porte `required`, et build() refuse de rendre un
rapport "ok" si une source requise manque. Une source absente est nommee dans le
rapport, jamais avalee.

Trois familles :
  markdown      les documents de methode et d'honnetete du depot
  registry      les fiches du registre officiel des hooks (une par fiche)
  solidity_dir  le source verifie des hooks mesures, recupere par le lot P
                dans docs/hooks-source/. Optionnel : s'il n'est pas la, le
                rapport dit "0 fichier, repertoire absent", pas "indexe".
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS = REPO_ROOT / "docs"

MARKDOWN = "markdown"
REGISTRY = "registry"
SOLIDITY_DIR = "solidity_dir"

# Le repertoire ou le lot P depose le source Solidity verifie (Sourcify /
# Etherscan). Le nom est fixe ici pour que les deux lots se croisent sans se
# parler : s'il existe, on l'indexe ; s'il n'existe pas, on le dit.
HOOK_SOURCE_DIR = DOCS / "hooks-source"


@dataclass(frozen=True)
class Source:
    """Une source du corpus. `path` peut ne pas exister : c'est le role du
    rapport de le signaler, pas celui de cette declaration de mentir."""

    name: str
    kind: str
    path: Path
    required: bool
    note: str = ""

    @property
    def rel(self) -> str:
        try:
            return str(self.path.relative_to(REPO_ROOT))
        except ValueError:
            return str(self.path)

    def exists(self) -> bool:
        return self.path.exists()


def registry_path(docs: Path = DOCS) -> Optional[Path]:
    """Le registre le plus recent : docs/hooklist-live-AAAAMMJJ.json s'il y en a,
    sinon docs/hooklist.json. Le graphe sur disque a ete construit avec le
    second (613 fiches) ; le registre vivant en compte 978. On indexe le vivant
    et on le dit dans le rapport, plutot que d'indexer silencieusement l'ancien."""
    live = sorted(docs.glob("hooklist-live-*.json"))
    if live:
        return live[-1]
    fallback = docs / "hooklist.json"
    return fallback if fallback.exists() else None


def default_corpus(repo_root: Path = REPO_ROOT) -> List[Source]:
    docs = repo_root / "docs"
    reg = registry_path(docs)
    out = [
        Source("method", MARKDOWN, docs / "METHOD.md", True,
               "la methode : du log Initialize au point de base"),
        Source("limits", MARKDOWN, docs / "LIMITS.md", True,
               "ce que la methode ne peut PAS dire"),
        Source("honesty", MARKDOWN, docs / "HONESTY.md", True,
               "les quatre etiquettes et les huit faux resultats produits"),
        Source("feedback", MARKDOWN, repo_root / "FEEDBACK.md", True,
               "retour d'experience sur la pile Uniswap v4"),
        Source("readme", MARKDOWN, repo_root / "README.md", True,
               "ce que le projet mesure et comment le rejouer"),
    ]
    out.append(Source("registry", REGISTRY,
                      reg if reg is not None else docs / "hooklist.json", True,
                      "le registre officiel : une fiche = un document"))
    out.append(Source("hook_sources", SOLIDITY_DIR, repo_root / "docs" / "hooks-source", False,
                      "source Solidity verifie des hooks mesures (lot P, Sourcify/Etherscan)"))
    return out


def resolve_corpus(sources: Optional[List[Source]] = None) -> Dict[str, Any]:
    """L'etat du corpus AVANT toute vectorisation. C'est ce que la CLI affiche
    et ce que le rapport de build recopie."""
    srcs = list(sources if sources is not None else default_corpus())
    present = [s for s in srcs if s.exists()]
    missing_required = [s for s in srcs if s.required and not s.exists()]
    missing_optional = [s for s in srcs if not s.required and not s.exists()]
    return {
        "declared": [{"name": s.name, "kind": s.kind, "path": s.rel,
                      "required": s.required, "note": s.note, "present": s.exists()}
                     for s in srcs],
        "n_declared": len(srcs),
        "n_present": len(present),
        "missing_required": [s.rel for s in missing_required],
        "missing_optional": [s.rel for s in missing_optional],
        "ok": not missing_required,
    }


class CorpusError(RuntimeError):
    """Une source requise manque. On ne construit pas un index amputé en silence."""


# ------------------------------------------------------------------ lecture

def read_markdown(source: Source) -> Tuple[str, List[str]]:
    text = source.path.read_text(errors="replace")
    return text, text.split("\n")


_ADDR = re.compile(r"0x[0-9a-fA-F]{40}")


def cited_addresses(text: str, limit: int = 6) -> List[str]:
    """Les adresses citees dans un passage. Sert a accrocher un morceau de prose
    au graphe : METHOD.md parle de 0x1aea38f0 ; l'en-tete de ce morceau peut
    alors porter ce que le graphe sait de ce hook."""
    seen: List[str] = []
    for m in _ADDR.findall(text or ""):
        a = m.lower()
        if a not in seen:
            seen.append(a)
        if len(seen) >= limit:
            break
    return seen


def read_registry(source: Source) -> List[Dict[str, Any]]:
    """Les fiches, chacune avec sa ligne EXACTE dans le fichier JSON.

    La ligne n'est pas cosmetique : la regle 4 veut qu'une valeur se rejoue en
    une commande, et `sed -n '427,468p' docs/hooklist-live-20260905.json` est
    cette commande. On la calcule en suivant la profondeur des accolades hors
    chaine, pas avec une regex qui casserait sur une description contenant '{'.
    """
    raw = source.path.read_text(errors="replace")
    entries = json.loads(raw)
    if not isinstance(entries, list):
        raise CorpusError(f"{source.rel}: le registre n'est pas un tableau JSON")
    spans = _top_level_spans(raw)
    if len(spans) != len(entries):
        # On ne devine pas : sans correspondance 1-1, on rend des lignes nulles
        # plutot que des lignes fausses.
        spans = [(None, None)] * len(entries)
    out = []
    for i, (e, (l0, l1)) in enumerate(zip(entries, spans)):
        out.append({"index": i, "entry": e, "line_start": l0, "line_end": l1})
    return out


def _top_level_spans(raw: str) -> List[Tuple[int, int]]:
    """Les (ligne_debut, ligne_fin) 1-indexees de chaque element du tableau
    racine. Suit les accolades hors chaines et hors echappements."""
    spans: List[Tuple[int, int]] = []
    depth = 0
    line = 1
    in_str = False
    esc = False
    start_line: Optional[int] = None
    for ch in raw:
        if ch == "\n":
            line += 1
            continue
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch in "{[":
            depth += 1
            if ch == "{" and depth == 2:
                start_line = line
        elif ch in "}]":
            if ch == "}" and depth == 2 and start_line is not None:
                spans.append((start_line, line))
                start_line = None
            depth -= 1
    return spans


def read_solidity(source: Source) -> List[Dict[str, Any]]:
    """Les .sol deposes par le lot P. Le repertoire peut ne pas exister : on rend
    une liste vide, et le rapport porte `present: false` — jamais l'inverse."""
    root = source.path
    if not root.is_dir():
        return []
    files = sorted(p for p in root.rglob("*.sol") if p.is_file())
    out = []
    for p in files:
        rel = str(p.relative_to(REPO_ROOT))
        out.append({"path": p, "rel": rel,
                    "address": _address_from_path(p),
                    "chain_id": _chain_from_path(p),
                    "text": p.read_text(errors="replace")})
    return out


def _address_from_path(p: Path) -> Optional[str]:
    """L'adresse du hook, deduite du chemin depose par le lot P. On accepte
    aussi bien docs/hooks-source/0xabc.../Foo.sol que .../8453/0xabc.../Foo.sol."""
    for part in reversed(p.parts):
        m = _ADDR.fullmatch(part)
        if m:
            return part.lower()
        m2 = _ADDR.search(part)
        if m2:
            return m2.group(0).lower()
    return None


def _chain_from_path(p: Path) -> Optional[int]:
    for part in p.parts:
        if part.isdigit() and 1 <= len(part) <= 8:
            try:
                return int(part)
            except ValueError:
                return None
    return None


def file_fingerprint(path: Path) -> Dict[str, Any]:
    """De quoi prouver QUEL fichier a ete indexe : taille, mtime, sha256 court."""
    import hashlib

    if not path.exists():
        return {"path": str(path), "present": False}
    data = path.read_bytes() if path.is_file() else b""
    st = path.stat()
    return {
        "path": str(path.relative_to(REPO_ROOT)) if str(path).startswith(str(REPO_ROOT)) else str(path),
        "present": True,
        "is_dir": path.is_dir(),
        "size": st.st_size if path.is_file() else None,
        "mtime": int(st.st_mtime),
        "sha256_12": hashlib.sha256(data).hexdigest()[:12] if path.is_file() else None,
    }
