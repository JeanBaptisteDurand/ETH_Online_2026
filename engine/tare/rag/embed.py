"""Les embeddings. Ollama d'abord (gratuit, local), OpenAI en repli.

granite-embedding:278m est le modele de cobol-explorer : 768 dimensions,
fenetre de 512 tokens, servi par Ollama sur la machine. Il ne coute rien et il
n'envoie rien dehors. OpenAI (text-embedding-3-small, 1536 dims) n'est utilise
que si Ollama ne repond pas ou n'a pas le modele — et le rapport de build dit
lequel a servi, parce qu'un index moitie Granite moitie OpenAI ne serait pas
interrogeable : deux espaces vectoriels differents, des distances qui ne veulent
rien dire ensemble.

REGLE 3, ecrite en code ici :

  * un lot qui revient avec moins de vecteurs qu'il n'y avait de textes leve
    EmbedError. On ne complete pas avec des zeros — un vecteur nul a une
    distance cosinus definie, il remonterait dans les resultats, et personne ne
    verrait qu'il ne veut rien dire ;
  * un vecteur de mauvaise dimension leve. Le melange silencieux de 768 et 1536
    est exactement le genre de bug qui produit un classement plausible et faux ;
  * un timeout leve. Il n'est jamais traduit en "ce document n'a pas d'embedding".

Aucune dependance : urllib de la bibliotheque standard suffit pour les deux
fournisseurs, et cela evite d'ajouter `ollama` / `openai` au moteur.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

OLLAMA_MODEL = os.environ.get("TARE_EMBED_MODEL", "granite-embedding:278m")
OLLAMA_DIM = 768
OPENAI_MODEL_DEFAULT = "text-embedding-3-small"
OPENAI_DIMS = {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072,
               "text-embedding-ada-002": 1536}

DEFAULT_BATCH = 16
DEFAULT_TIMEOUT = 120.0


# Duree pendant laquelle Ollama garde le modele en memoire apres un appel.
OLLAMA_KEEP_ALIVE = "30m"

class EmbedError(RuntimeError):
    """L'embedding n'a pas eu lieu. Ce n'est PAS un vecteur nul."""


def _post(url: str, payload: Dict[str, Any], timeout: float,
          headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:  # reponse tronquee : pas un resultat
        raise EmbedError(f"{url}: reponse non-JSON ({len(raw)} octets) — {exc}") from exc


def _get(url: str, timeout: float, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# ------------------------------------------------------------------ providers

class Embedder:
    provider = "?"
    model = "?"
    dim = 0

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        raise NotImplementedError

    def embed_one(self, text: str) -> List[float]:
        return self.embed([text])[0]

    def describe(self) -> Dict[str, Any]:
        return {"provider": self.provider, "model": self.model, "dim": self.dim}

    # -- garde commune

    def _check(self, texts: Sequence[str], vectors: Any) -> List[List[float]]:
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            got = len(vectors) if isinstance(vectors, list) else type(vectors).__name__
            raise EmbedError(
                f"{self.provider}/{self.model}: {len(texts)} textes envoyes, {got} vecteurs recus. "
                "Un lot incomplet n'est pas complete par des zeros (regle 3).")
        for i, v in enumerate(vectors):
            if not isinstance(v, list) or len(v) != self.dim:
                raise EmbedError(
                    f"{self.provider}/{self.model}: vecteur {i} de dimension "
                    f"{len(v) if isinstance(v, list) else '?'}, attendu {self.dim}")
            if not any(v):
                raise EmbedError(f"{self.provider}/{self.model}: vecteur {i} entierement nul")
        return [[float(x) for x in v] for v in vectors]


class OllamaEmbedder(Embedder):
    provider = "ollama"

    def __init__(self, url: Optional[str] = None, model: str = OLLAMA_MODEL,
                 dim: int = OLLAMA_DIM, timeout: float = DEFAULT_TIMEOUT,
                 batch: int = DEFAULT_BATCH):
        self.url = (url or os.environ.get("OLLAMA_URL") or "http://127.0.0.1:11434").rstrip("/")
        self.model = model
        self.dim = dim
        self.timeout = timeout
        self.batch = batch

    def available(self) -> tuple:
        try:
            tags = _get(f"{self.url}/api/tags", timeout=5.0)
        except Exception as exc:
            return False, f"{self.url} injoignable: {exc}"
        names = {m.get("name") for m in (tags.get("models") or [])}
        if self.model not in names:
            return False, f"{self.url}: modele {self.model} absent (ollama pull {self.model})"
        return True, ""

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []
        out: List[List[float]] = []
        for i in range(0, len(texts), self.batch):
            part = list(texts[i:i + self.batch])
            try:
                r = _post(f"{self.url}/api/embed",
                          # keep_alive : sans lui, Ollama decharge le modele apres cinq
                          # minutes d'inactivite et la question suivante paie trente
                          # secondes de rechargement. Le serveur RAG tourne en continu ;
                          # le modele doit y rester.
                          {"model": self.model, "input": part,
                           "keep_alive": OLLAMA_KEEP_ALIVE}, self.timeout)
            except urllib.error.HTTPError as exc:
                raise EmbedError(f"ollama HTTP {exc.code}: {exc.read()[:200]!r}") from exc
            except Exception as exc:
                raise EmbedError(f"ollama {self.url}: {exc}") from exc
            if r.get("error"):
                raise EmbedError(f"ollama: {r['error']}")
            out.extend(self._check(part, r.get("embeddings")))
        return out


class OpenAIEmbedder(Embedder):
    provider = "openai"

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None,
                 timeout: float = DEFAULT_TIMEOUT, batch: int = 64,
                 base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY") or ""
        self.model = model or os.environ.get("OPENAI_EMBEDDING_MODEL") or OPENAI_MODEL_DEFAULT
        self.dim = OPENAI_DIMS.get(self.model, 1536)
        self.timeout = timeout
        self.batch = batch
        self.base_url = base_url.rstrip("/")

    def available(self) -> tuple:
        return (bool(self.api_key), "" if self.api_key else "OPENAI_API_KEY absente")

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []
        if not self.api_key:
            raise EmbedError("OPENAI_API_KEY absente")
        out: List[List[float]] = []
        for i in range(0, len(texts), self.batch):
            part = list(texts[i:i + self.batch])
            try:
                r = _post(f"{self.base_url}/embeddings",
                          {"model": self.model, "input": part}, self.timeout,
                          {"Authorization": f"Bearer {self.api_key}"})
            except urllib.error.HTTPError as exc:
                # 429 compris : un rate-limit n'est pas un embedding vide.
                raise EmbedError(f"openai HTTP {exc.code}: {exc.read()[:200]!r}") from exc
            except Exception as exc:
                raise EmbedError(f"openai: {exc}") from exc
            data = r.get("data")
            vecs = [d.get("embedding") for d in data] if isinstance(data, list) else None
            out.extend(self._check(part, vecs))
        return out


# ------------------------------------------------------------------ selection

def make_embedder(prefer: str = "ollama", ollama_url: Optional[str] = None,
                  model: Optional[str] = None) -> tuple:
    """Rend (embedder, journal). Le journal dit POURQUOI ce fournisseur : il
    finit dans le rapport de build, pour qu'on sache six mois plus tard avec
    quel espace vectoriel l'index a ete rempli."""
    log: List[str] = []
    order = ["ollama", "openai"] if prefer != "openai" else ["openai", "ollama"]
    for name in order:
        cand = (OllamaEmbedder(ollama_url, model or OLLAMA_MODEL) if name == "ollama"
                else OpenAIEmbedder(model=model if prefer == "openai" else None))
        ok, why = cand.available()
        if ok:
            log.append(f"{name}: retenu ({cand.model}, {cand.dim} dims)")
            return cand, log
        log.append(f"{name}: ecarte — {why}")
    raise EmbedError("aucun fournisseur d'embeddings disponible. " + " | ".join(log))
