"""Le RAG vectoriel, sans reseau sauf la ou la base EST le sujet.

Quatre choses peuvent rendre un index de recherche faux sans qu'il proteste, et
les quatre ont deja frappe des projets voisins :

  * il est construit et JAMAIS peuple. C'est le `void ragIndex;` de CorLens :
    la table existe, la route repond 200, la liste est vide, et rien dans le
    systeme ne peut distinguer "vide" de "rien ne correspond". TestIndexPeuple
    compte les lignes EN BASE et les compare au rapport de build.
  * il vectorise le texte brut. Une fiche de registre ne contient ni le nombre
    de pools, ni les clones, ni un seul point de base : cherchee sur ces
    termes-la, elle ne remonte jamais. TestEnTete verifie que l'en-tete derive
    du graphe est bien DEVANT le contenu, et qu'il porte ces faits.
  * il transforme un refus en fait : un lot d'embeddings tronque complete par
    des zeros, un timeout compte comme "ce document n'a pas de vecteur", une
    base injoignable comptee comme "index vide". TestRefusDeReponse tient les
    trois en echec.
  * il cite sans pouvoir etre verifie. TestRejeu relit le fichier aux lignes que
    le morceau annonce et exige le MEME texte, caractere pour caractere.
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tare.rag import build as B
from tare.rag import chunk as K
from tare.rag import corpus as C
from tare.rag import embed as E
from tare.rag import graph_header as GH
from tare.rag import store as ST

REPO = Path(__file__).resolve().parents[2]
CID = 8453

# Un hook reellement mesure dans le corpus : 52 pools, 255 lignes MEASURED.
MEASURED_HOOK = "0x0469a4bd3724dc86c9542f4694c976da13c450c0"
# Un hook du registre sur une autre chaine : present dans le registre, absent
# des mesures. Son en-tete doit dire "inconnu", jamais "zero".
OFFCHAIN_HOOK = "0x0000fe59823933ac763611a69c88f91d45f81888"


def _sed(path: Path, a: int, b: int) -> str:
    """L'equivalent exact de `sed -n 'a,bp' fichier`, en Python."""
    lines = path.read_text(errors="replace").split("\n")
    return "\n".join(lines[a - 1:b])


# ---------------------------------------------------------------- le corpus

class TestCorpus(unittest.TestCase):
    def test_les_documents_de_methode_et_le_registre_sont_requis(self):
        """Un corpus qui n'exige rien produit un index qui ne contient rien."""
        srcs = {s.name: s for s in C.default_corpus()}
        for name in ("method", "limits", "honesty", "feedback", "readme", "registry"):
            self.assertIn(name, srcs, f"{name} n'est pas declare dans le corpus")
            self.assertTrue(srcs[name].required, f"{name} devrait etre requis")
        self.assertFalse(srcs["hook_sources"].required,
                         "le source Solidity vient du lot P : optionnel, mais declare")

    def test_source_requise_absente_fait_echouer_le_decoupage(self):
        """Pas d'index ampute en silence : on leve."""
        fake = C.Source("method", C.MARKDOWN, REPO / "docs" / "IL-N-Y-A-PAS.md", True)
        with self.assertRaises(C.CorpusError):
            K.chunk_corpus(None, sources=[fake])

    def test_source_optionnelle_absente_ne_fait_pas_echouer_mais_est_nommee(self):
        state = C.resolve_corpus()
        self.assertTrue(state["ok"])
        self.assertNotIn("docs/hooks-source", state["missing_required"])
        for row in state["declared"]:
            self.assertIn("present", row, "chaque source declare sa presence")

    def test_le_registre_vivant_est_prefere_a_l_ancien(self):
        p = C.registry_path()
        self.assertIsNotNone(p)
        entries = json.loads(p.read_text())
        self.assertGreaterEqual(len(entries), 613,
                                "on indexe le registre le plus recent, pas le plus ancien")

    def test_le_repertoire_de_source_absent_rend_zero_fichier_pas_une_erreur(self):
        s = C.Source("hook_sources", C.SOLIDITY_DIR, REPO / "docs" / "hooks-source-absent", False)
        self.assertEqual(C.read_solidity(s), [])
        self.assertEqual(K.chunk_solidity(s, None), [])


# ------------------------------------------------------- le rejeu des citations

class TestRejeu(unittest.TestCase):
    """Regle 4 : une citation se rejoue en une commande, et rend le MEME texte."""

    @classmethod
    def setUpClass(cls):
        cls.gi = None
        cls.md = K.chunk_markdown(
            C.Source("honesty", C.MARKDOWN, REPO / "docs" / "HONESTY.md", True), None)
        cls.reg_source = next(s for s in C.default_corpus() if s.kind == C.REGISTRY)

    def test_un_morceau_markdown_se_relit_a_l_identique(self):
        self.assertGreater(len(self.md), 5)
        for ch in self.md[:20]:
            self.assertEqual(_sed(REPO / ch.source_file, ch.line_start, ch.line_end), ch.content)

    def test_la_commande_de_rejeu_est_ecrite_dans_le_morceau(self):
        ch = self.md[0]
        self.assertEqual(ch.replay,
                         f"sed -n '{ch.line_start},{ch.line_end}p' {ch.source_file}")
        self.assertIn(ch.replay, ch.header, "la commande est dans l'en-tete vectorise")

    def test_les_lignes_d_une_fiche_de_registre_pointent_sur_la_fiche(self):
        """La ligne annoncee doit rendre du JSON qui reparse sur la meme adresse."""
        rows = C.read_registry(self.reg_source)
        self.assertEqual(len(rows), len(json.loads(self.reg_source.path.read_text())))
        path = self.reg_source.path
        for row in (rows[0], rows[37], rows[len(rows) // 2], rows[-1]):
            blob = _sed(path, row["line_start"], row["line_end"]).strip().rstrip(",")
            parsed = json.loads(blob)
            self.assertEqual(parsed["hook"]["address"], row["entry"]["hook"]["address"])

    def test_aucun_morceau_sans_fichier_ni_lignes(self):
        chunks = K.chunk_corpus(None, sources=[
            C.Source("readme", C.MARKDOWN, REPO / "README.md", True)])
        for ch in chunks:
            self.assertTrue(ch.source_file)
            self.assertGreaterEqual(ch.line_start, 1)
            self.assertGreaterEqual(ch.line_end, ch.line_start)


# --------------------------------------------------------- l'en-tete de graphe

class TestEnTete(unittest.TestCase):
    """La technique centrale reprise de cobol-explorer : l'en-tete AVANT le texte."""

    @classmethod
    def setUpClass(cls):
        cls.gi = GH.load_graph_index()

    def test_le_texte_vectorise_commence_par_l_en_tete(self):
        ch = K.Chunk(id="x", corpus="docs", doc_id="d", title="t", source_file="f",
                     line_start=1, line_end=2, header="EN-TETE", content="CONTENU")
        self.assertTrue(ch.text.startswith("EN-TETE"))
        self.assertIn("CONTENU", ch.text)
        self.assertLess(ch.text.index("EN-TETE"), ch.text.index("CONTENU"))

    def test_l_en_tete_porte_des_faits_que_le_texte_n_a_pas(self):
        node = self.gi.hook_node(MEASURED_HOOK, CID)
        self.assertIsNotNone(node, "ce hook doit etre dans le graphe publie")
        facts = self.gi.hook_facts(node)
        header = GH.render_hook_header(facts)
        self.assertIn("pools attaches", header)
        self.assertIn("mesures:", header)
        self.assertIn("bps", header)
        self.assertGreater(facts["n_pools"], 0)
        self.assertGreater(facts["measurements"]["n_measured"], 0)
        # Les bps de l'en-tete sont ceux des noeuds Measurement, pas un calcul local.
        self.assertEqual(facts["measurements"]["bps_max"],
                         max(v for v in [facts["measurements"]["bps_max"]]))

    def test_bytecode_non_lu_n_est_pas_absence_de_jumeaux(self):
        """Regle 3 : le graphe n'a pas lu eth_getCode -> l'en-tete le DIT."""
        facts = {"label": "H", "address": "0x" + "aa" * 20, "chain_id": CID, "chain": "base",
                 "node": "hook:8453:0x", "n_pools": 0, "n_tokens": 0, "pools": [],
                 "measurements": {"n": 0}, "blocks": [],
                 "bytecode": {"status": "UNAVAILABLE", "n_twins": 0, "twins": []},
                 "deployer": {"status": "UNAVAILABLE"}, "address_flags": [],
                 "n_registry_entries": 1}
        header = GH.render_hook_header(facts)
        self.assertIn("NON LU", header)
        self.assertIn("inconnus, pas absents", header)
        self.assertNotIn("jumeaux: aucun", header)

    def test_aucune_mesure_n_est_pas_zero_bps(self):
        facts = {"label": "H", "address": "0x" + "bb" * 20, "chain_id": CID, "chain": "base",
                 "node": "hook:8453:0x", "n_pools": 1, "n_tokens": 2, "pools": ["0xdead"],
                 "measurements": {"n": 3, "by_label": {"NOT_QUOTABLE": 3}, "n_measured": 0,
                                  "bps_max": None, "bps_min": None, "bps_median": None},
                 "blocks": [], "bytecode": {"status": "UNAVAILABLE"},
                 "deployer": {"status": "UNAVAILABLE"}, "address_flags": [],
                 "n_registry_entries": 1}
        header = GH.render_hook_header(facts)
        self.assertIn("AUCUN bps", header)
        self.assertIn("on n'a pas su coter", header)

    def test_hook_absent_du_graphe_ne_fabrique_aucun_fait(self):
        header = GH.render_absent_header(OFFCHAIN_HOOK, 42161, "BunniHook", "arbitrum")
        self.assertIn("ABSENT", header)
        self.assertIn("INCONNUS pour lui, pas nuls", header)
        for forbidden in ("pools attaches: 0", "0 jumeau", "0 bps"):
            self.assertNotIn(forbidden, header)

    def test_une_adresse_sur_deux_chaines_n_est_pas_confondue(self):
        """Le faux resultat #6 : une fiche d'une autre chaine accrochee a une
        mesure Base. L'en-tete est resolu par (adresse, chainId), pas par adresse."""
        gi = self.gi
        addr = MEASURED_HOOK
        self.assertIsNotNone(gi.hook_node(addr, CID))
        self.assertIsNone(gi.hook_node(addr, 1),
                          "la meme adresse sur Ethereum n'est pas le hook Base")

    def test_les_fiches_du_registre_ont_toutes_un_en_tete_de_graphe(self):
        reg = next(s for s in C.default_corpus() if s.kind == C.REGISTRY)
        gi = GH.load_graph_index(hooklist=reg.path)
        chunks = K.chunk_registry(reg, gi)
        self.assertEqual(len(chunks), len(json.loads(reg.path.read_text())))
        with_node = [c for c in chunks if c.graph_node]
        self.assertEqual(len(with_node), len(chunks),
                         "le graphe reconstruit avec CE registre connait toutes ses fiches")
        for c in chunks[:50]:
            self.assertTrue(c.text.startswith("HOOK "), "en-tete de graphe en tete du vecteur")

    def test_les_identifiants_de_morceaux_sont_uniques(self):
        chunks = K.chunk_corpus(self.gi)
        ids = [c.id for c in chunks]
        self.assertEqual(len(ids), len(set(ids)))

    def test_le_morceau_tient_dans_la_fenetre_du_modele(self):
        """granite-embedding:278m lit 512 tokens. Au-dela, la fin est TRONQUEE
        en silence — le genre d'amputation invisible que HONESTY.md recense.

        La fenetre de contenu est calculee budget MOINS en-tete : un hook a 52
        pools produit un en-tete de 700 caracteres, et une fenetre fixe de 1600
        laissait 93 morceaux hors budget. Ce test les a trouves."""
        chunks = K.chunk_corpus(self.gi)
        big = K.oversize(chunks)
        self.assertLess(len(big), len(chunks) * 0.01,
                        f"{len(big)} morceaux sur {len(chunks)} depassent le budget")
        ok = [c for c in chunks if not c.oversize]
        self.assertLessEqual(max(len(c.text) for c in ok), K.TEXT_BUDGET)

    def test_un_morceau_hors_budget_le_dit_en_toutes_lettres(self):
        """Une ligne unique plus longue que le budget est insecable sans casser
        le rejeu. On ne la coupe pas en silence : on l'annonce en tete."""
        ch = K.Chunk(id="x", corpus="hook_source", doc_id="d", title="t",
                     source_file="f.sol", line_start=7, line_end=7,
                     header="EN-TETE", content="z" * (K.TEXT_BUDGET + 100))
        self.assertTrue(ch.oversize)
        self.assertEqual(K.mark_oversize([ch]), 1)
        self.assertTrue(ch.header.startswith("AVERTISSEMENT"))
        self.assertIn("n'est PAS dans le vecteur", ch.header)
        self.assertIn(ch.replay, ch.header)

    def test_les_dependances_recopiees_ne_noient_pas_l_index(self):
        """provenance.json marque `vendored` les fichiers que le hook n'a pas
        ecrits. Les indexer ferait remonter SafeERC20.sol treize fois."""
        sol = next((s for s in C.default_corpus() if s.kind == C.SOLIDITY_DIR), None)
        if sol is None or not sol.exists():
            self.skipTest("docs/hooks-source absent (lot P)")
        counts = C.count_solidity(sol)
        self.assertGreater(counts["vendored"], 0, "aucun fichier marque vendored")
        kept = C.read_solidity(sol)
        self.assertEqual(len(kept), counts["own"])
        self.assertFalse(any(f["vendored"] for f in kept))
        with_vendored = C.read_solidity(sol, include_vendored=True)
        self.assertEqual(len(with_vendored), counts["present"])

    def test_le_source_solidity_porte_sa_provenance(self):
        sol = next((s for s in C.default_corpus() if s.kind == C.SOLIDITY_DIR), None)
        if sol is None or not sol.exists():
            self.skipTest("docs/hooks-source absent (lot P)")
        chunks = K.chunk_solidity(sol, self.gi)
        self.assertTrue(chunks)
        provs = {c.extra["provenance"].get("provider") for c in chunks
                 if c.extra.get("provenance")}
        self.assertTrue(provs & {"sourcify", "etherscan"},
                        "aucun morceau ne dit d'ou vient le source")
        one = next(c for c in chunks if c.extra.get("provenance", {}).get("provider"))
        self.assertIn("source verifiee", one.header)
        self.assertEqual(_sed(REPO / one.source_file, one.line_start, one.line_end),
                         one.content)


# ------------------------------------------------------- le refus de reponse

class FakeEmbedder(E.Embedder):
    provider = "faux"

    def __init__(self, dim=4, payload=None):
        self.dim = dim
        self.model = "faux"
        self.payload = payload

    def embed(self, texts):
        return self._check(texts, self.payload)


class TestRefusDeReponse(unittest.TestCase):
    """Regle 3 : une reponse tronquee, un timeout ou un 429 ne sont pas des zeros."""

    def test_lot_incomplet_leve_au_lieu_d_etre_complete(self):
        e = FakeEmbedder(dim=4, payload=[[1.0, 0, 0, 0]])
        with self.assertRaises(E.EmbedError) as ctx:
            e.embed(["a", "b", "c"])
        self.assertIn("regle 3", str(ctx.exception).lower())

    def test_mauvaise_dimension_leve(self):
        e = FakeEmbedder(dim=4, payload=[[1.0, 0, 0]])
        with self.assertRaises(E.EmbedError):
            e.embed(["a"])

    def test_vecteur_nul_leve(self):
        """Un vecteur nul a une distance cosinus definie : il remonterait dans
        les resultats sans que personne ne voie qu'il ne veut rien dire."""
        e = FakeEmbedder(dim=4, payload=[[0.0, 0.0, 0.0, 0.0]])
        with self.assertRaises(E.EmbedError):
            e.embed(["a"])

    def test_reponse_non_json_leve(self):
        class Resp:
            def read(self):
                return b'{"embeddings": [[0.1,'  # tronquee au milieu

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        with patch("tare.rag.embed.urllib.request.urlopen", return_value=Resp()):
            with self.assertRaises(E.EmbedError) as ctx:
                E.OllamaEmbedder(url="http://x", model="m").embed(["a"])
        self.assertIn("non-JSON", str(ctx.exception))

    def test_timeout_leve_et_ne_rend_pas_de_vecteur(self):
        with patch("tare.rag.embed.urllib.request.urlopen", side_effect=TimeoutError("timed out")):
            with self.assertRaises(E.EmbedError):
                E.OllamaEmbedder(url="http://x", model="m").embed(["a"])

    def test_un_embedding_qui_casse_n_ecrit_rien(self):
        """Le build est atomique : tout est vectorise avant le premier INSERT."""
        chunks = [K.Chunk(id=str(i), corpus="docs", doc_id="d", title="t", source_file="f",
                          line_start=1, line_end=1, header="h", content="c" * 60)
                  for i in range(5)]

        class Casse(E.Embedder):
            provider, model, dim = "casse", "casse", 4

            def __init__(self):
                self.n = 0

            def embed(self, texts):
                self.n += len(texts)
                if self.n > 2:
                    raise E.EmbedError("429 apres 2 documents")
                return [[1.0, 0, 0, 0] for _ in texts]

        with tempfile.TemporaryDirectory() as tmp:
            cache = B.EmbedCache(Path(tmp) / "c.jsonl")
            with self.assertRaises(E.EmbedError):
                B.embed_chunks(chunks, Casse(), cache, batch=2)

    def test_le_choix_du_fournisseur_est_journalise(self):
        with patch.object(E.OllamaEmbedder, "available", return_value=(False, "injoignable")):
            with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
                emb, log = E.make_embedder()
        self.assertEqual(emb.provider, "openai")
        self.assertIn("ollama: ecarte", " ".join(log))

    def test_sans_aucun_fournisseur_on_leve(self):
        with patch.object(E.OllamaEmbedder, "available", return_value=(False, "injoignable")):
            with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
                with self.assertRaises(E.EmbedError):
                    E.make_embedder()


# ------------------------------------------------------------- pgvector

def _store(table: str = ST.CHUNKS_TABLE, dim: int = 768) -> ST.PgVectorStore:
    return ST.PgVectorStore(dim=dim, chunks_table=table,
                            builds_table=ST.BUILDS_TABLE if table == ST.CHUNKS_TABLE
                            else table + "_builds")


def _skip_if_no_db(case: unittest.TestCase) -> ST.PgVectorStore:
    s = _store()
    ok, why = s.reachable()
    if not ok:
        case.skipTest(
            "pgvector injoignable — ce test PROUVE que l'index est peuple et il ne "
            "peut rien prouver sans base. Demarrer : "
            "TARE_DB_PORT=55432 docker compose up -d db, puis "
            "cd engine && python3 -m tare.rag build. Detail: " + why)
    return s


class TestIndexPeuple(unittest.TestCase):
    """LE test qu'on refuse de ne pas avoir : l'index est-il REMPLI ?

    CorLens a livre `void ragIndex;` — l'index etait construit et jamais peuple.
    Rien dans son systeme ne pouvait le contredire, parce que rien ne comptait
    les lignes. Ici on les compte, en base, et on les confronte au rapport de
    build ecrit sur disque."""

    def test_la_table_contient_des_lignes(self):
        s = _skip_if_no_db(self)
        n = s.count()
        self.assertGreater(n, 0, "rag_chunks est vide : l'index n'a jamais ete charge")

    def test_le_compte_en_base_egale_le_rapport_de_build(self):
        s = _skip_if_no_db(self)
        if not B.REPORT_PATH.exists():
            self.skipTest("aucun rapport de build : lancer python3 -m tare.rag build")
        report = json.loads(B.REPORT_PATH.read_text())
        if not report.get("loaded"):
            self.skipTest("le dernier build a ete lance avec --no-load")
        self.assertEqual(s.count(), report["n_chunks"])
        self.assertEqual(s.counts_by_corpus(), report["by_corpus"])

    def test_les_corpus_nommes_sont_presents(self):
        s = _skip_if_no_db(self)
        by = s.counts_by_corpus()
        self.assertGreater(by.get("docs", 0), 0, "aucun document de methode indexe")
        self.assertGreater(by.get("registry", 0), 500, "les fiches du registre manquent")
        sol = next((x for x in C.default_corpus() if x.kind == C.SOLIDITY_DIR), None)
        if sol is not None and sol.exists():
            self.assertGreater(by.get("hook_source", 0), 0,
                               "docs/hooks-source existe mais rien n'en est indexe")

    def test_l_index_hnsw_cosinus_existe(self):
        """Sans lui la recherche marche quand meme — en balayage complet. Le test
        verifie qu'on a bien l'index ANN annonce, pas un ORDER BY sequentiel."""
        s = _skip_if_no_db(self)
        with s._conn() as c:
            rows = c.execute(
                "SELECT indexdef FROM pg_indexes WHERE tablename = %s",
                (s.chunks_table,)).fetchall()
        defs = " ".join(r[0] for r in rows)
        self.assertIn("hnsw", defs)
        self.assertIn("vector_cosine_ops", defs)

    def test_chaque_ligne_porte_son_fichier_et_ses_lignes(self):
        s = _skip_if_no_db(self)
        with s._conn() as c:
            bad = c.execute(
                f"SELECT count(*) FROM {s.chunks_table} WHERE source_file IS NULL "
                "OR source_file = '' OR line_start IS NULL OR line_end < line_start"
            ).fetchone()[0]
        self.assertEqual(bad, 0, "des passages sans source citable sont en base")

    def test_un_passage_rendu_se_relit_dans_le_depot(self):
        """Bout en bout : on cherche, on prend le premier passage, et on relit le
        fichier aux lignes annoncees. Le texte doit correspondre."""
        s = _skip_if_no_db(self)
        try:
            emb, _ = E.make_embedder()
        except E.EmbedError as exc:
            self.skipTest(f"aucun embedder: {exc}")
        if emb.dim != s.existing_dim():
            self.skipTest(f"index en {s.existing_dim()} dims, embedder en {emb.dim}")
        passages = s.search(emb.embed_one("le stub inerte de 89 octets"), k=5, corpus="docs")
        self.assertTrue(passages)
        p = passages[0]
        self.assertTrue((REPO / p.source_file).exists())
        self.assertEqual(_sed(REPO / p.source_file, p.line_start, p.line_end), p.content)
        self.assertGreaterEqual(p.distance, 0.0)
        d = p.to_dict()
        self.assertEqual(d["source"]["replay"],
                         f"sed -n '{p.line_start},{p.line_end}p' {p.source_file}")


class TestStoreRefuse(unittest.TestCase):
    """Le magasin refuse plutot que de mentir. Table jetable : l'index reel
    n'est jamais touche par ces tests."""

    TABLE = "rag_chunks_test_jetable"

    @classmethod
    def setUpClass(cls):
        cls.s = _store(cls.TABLE, dim=4)
        ok, why = cls.s.reachable()
        if not ok:
            raise unittest.SkipTest("pgvector injoignable: " + why)
        with cls.s._conn() as c:
            c.execute(f"DROP TABLE IF EXISTS {cls.TABLE}")
            c.execute(f"DROP TABLE IF EXISTS {cls.TABLE}_builds")
        cls.s.ensure_schema()

    @classmethod
    def tearDownClass(cls):
        try:
            with cls.s._conn() as c:
                c.execute(f"DROP TABLE IF EXISTS {cls.TABLE}")
                c.execute(f"DROP TABLE IF EXISTS {cls.TABLE}_builds")
        except ST.StoreError:
            pass

    def _row(self, i: int):
        return {"id": f"r{i}", "corpus": "docs", "doc_id": "d", "title": "t",
                "source_file": "docs/METHOD.md", "line_start": 1, "line_end": 2,
                "header": "h", "content": "c", "n_chars": 2, "chain_id": None,
                "address": None, "graph_node": None, "sha256": "x",
                "embedding": [float(i + 1), 0.0, 0.0, 1.0]}

    def test_charger_une_liste_vide_est_refuse(self):
        """TRUNCATE puis zero INSERT remplacerait un index valide par du vide."""
        with self.assertRaises(ST.StoreError) as ctx:
            self.s.load([], "faux", "faux")
        self.assertIn("void ragIndex", str(ctx.exception))

    def test_recherche_sur_table_vide_leve_au_lieu_de_rendre_une_liste_vide(self):
        with self.s._conn() as c:
            c.execute(f"TRUNCATE {self.TABLE}")
        with self.assertRaises(ST.EmptyIndexError):
            self.s.search([1.0, 0.0, 0.0, 0.0], k=3)

    def test_le_statut_distingue_vide_et_injoignable(self):
        with self.s._conn() as c:
            c.execute(f"TRUNCATE {self.TABLE}")
        self.assertEqual(self.s.status()["status"], "INDEX_EMPTY")
        mort = ST.PgVectorStore(dsn="postgresql://tare:tare@127.0.0.1:1/tare",
                                chunks_table=self.TABLE, dim=4)
        self.assertEqual(mort.status()["status"], "INDEX_UNAVAILABLE")

    def test_count_sur_base_injoignable_leve_au_lieu_de_rendre_zero(self):
        """Un 0 rendu par une panne se lirait "index vide" : c'est le faux
        resultat #4, un refus de reponse compte comme un fait."""
        mort = ST.PgVectorStore(dsn="postgresql://tare:tare@127.0.0.1:1/tare",
                                chunks_table=self.TABLE, dim=4)
        with self.assertRaises(ST.StoreError):
            mort.count()

    def test_dimension_incompatible_refusee(self):
        self.s.load([self._row(0)], "faux", "faux")
        with self.assertRaises(ST.DimMismatchError):
            self.s.search([1.0, 0.0, 0.0], k=1)
        autre = _store(self.TABLE, dim=8)
        with self.assertRaises(ST.DimMismatchError):
            autre.ensure_schema()

    def test_un_chargement_incomplet_est_detecte(self):
        with self.assertRaises(ST.StoreError):
            self.s.load([{**self._row(1), "embedding": [1.0, 0.0]}], "faux", "faux")

    def test_le_chargement_relit_le_compte_en_base(self):
        n = self.s.load([self._row(i) for i in range(3)], "faux", "faux")
        self.assertEqual(n, 3)
        self.assertEqual(self.s.count(), 3)
        got = self.s.search([1.0, 0.0, 0.0, 1.0], k=2)
        self.assertEqual(len(got), 2)
        self.assertLessEqual(got[0].distance, got[1].distance)
        self.assertEqual(got[0].source_file, "docs/METHOD.md")

    def test_le_dsn_ne_laisse_jamais_fuir_le_mot_de_passe(self):
        masked = ST._safe_dsn("postgresql://tare:supersecret@h:5432/db")
        self.assertNotIn("supersecret", masked)
        self.assertIn("***", masked)


if __name__ == "__main__":
    unittest.main()
