"""Le graphe TARE, sans reseau.

Quatre choses peuvent rendre un graphe faux sans qu'il proteste :

  * il fusionne deux relations distinctes, ou en duplique une seule (build) ;
  * il accroche la mesure au mauvais bout — au hook plutot qu'au couple — et
    produit une moyenne qui n'existe dans aucun pool (schema) ;
  * il ecrase la deuxieme fiche de registre par la premiere, et la question
    "ce hook est-il decrit deux fois de deux facons ?" devient inposable (schema) ;
  * il transforme un refus de reponse — un 429, un timeout — en fait etabli :
    "pas de bytecode", "pas de createur", "0 bps" (chain, queries).

Le quatrieme a deja frappe cinq fois dans ce projet, et une fois de plus pendant
l'ecriture de ce module : le mirror Blockscout repond HTTP 200 avec
{"message": "Too many requests"}, ce qui avait fait passer 142 adresses sur 160
pour "sans createur connu". TestRefusDeReponse le tient en echec.
"""
from __future__ import annotations

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from tare.graph import build as B
from tare.graph import chain as C
from tare.graph import loader as L
from tare.graph import queries as Q
from tare.graph import sources as S
from tare.graph import store as ST
from tare.graph.nx_compat import HAS_NETWORKX, StdlibMultiDiGraph
from tare.graph.schema import (Edge, EdgeKind, LABELS, Node, NodeKind, address_of, bytecode_id,
                               chain_of, deployer_id, hook_id, measurement_id, pool_node_id,
                               registry_id, split_id, token_id)
from tare.rpc import RpcError

CID = 8453
BLOCK = 50614000
GRAPH_JSON = L.DEFAULT_GRAPH
CHAIN_CACHE = C.DEFAULT_CACHE


# --------------------------------------------------------------- fabrique de jouets

def m_row(hook, pool, size="100000000000000", bps=42.0, label="MEASURED", zfo=True,
          c0="0x1111111111111111111111111111111111111111",
          c1="0x2222222222222222222222222222222222222222", lp_fee=0, reason=None):
    return {"hook": hook, "pool_id": pool, "chain_id": CID, "block_number": BLOCK,
            "currency0": c0, "currency1": c1, "key_fee": 8388608, "tick_spacing": 200,
            "fee_is_dynamic": True, "stored_lp_fee": lp_fee, "stored_protocol_fee": 0,
            "zero_for_one": zfo, "amount_in": size,
            "out_with": "990" if bps is not None else None,
            "out_without": "1000" if bps is not None else None,
            "bps": bps, "label": label, "reason": reason, "stub_hash": "0xstub",
            "engine_ver": "tare-engine/test", "observed_at": "2026-09-05T00:00:00+00:00"}


def r_entry(addr, name, chain_id=CID, vanilla=False, deployer="", **props):
    p = {"dynamicFee": True, "upgradeable": False, "requiresCustomSwapData": False,
         "vanillaSwap": vanilla, "swapAccess": "none"}
    p.update(props)
    return {"hook": {"address": addr, "chain": "base", "chainId": chain_id, "name": name,
                     "description": "", "deployer": deployer, "verifiedSource": True,
                     "auditUrl": ""},
            "flags": {}, "properties": p}


def chain_entry(addr, code_hash=None, size=100, creator=None, factory=None,
                status=None, reason=None):
    code = ({"status": "CODE", "code_hash": code_hash, "code_size": size, "code_block": BLOCK}
            if code_hash else {"status": status or "UNAVAILABLE", "reason": reason or "rate limit"})
    creation = ({"status": "CODE", "creator": creator, "factory": factory,
                 "creation_block": 1, "source": "test"}
                if creator else {"status": status or "ABSENT", "reason": reason or "inconnu"})
    return {"address": addr, "code": code, "creation": creation}


HOOK_A = "0xaaaa000000000000000000000000000000000acc"
HOOK_B = "0xbbbb000000000000000000000000000000000acc"
HOOK_C = "0xcccc000000000000000000000000000000000acc"
POOL_1 = "0x" + "11" * 32
POOL_2 = "0x" + "22" * 32
POOL_3 = "0x" + "33" * 32
CODE_X = "0x" + "ab" * 32
CODE_Y = "0x" + "cd" * 32
DEP_1 = "0xd000000000000000000000000000000000000001"


def toy(cls=None):
    """Un graphe minuscule dont on connait toutes les reponses par coeur.

    A et B partagent le bytecode X et le deployeur DEP_1. A preleve 500 bps sur
    POOL_1 et 0 bps sur POOL_2 — c'est la these du couple, en deux lignes.
    C est au registre, a un bytecode a lui, et n'a aucun pool.
    """
    rows = [m_row(HOOK_A, POOL_1, bps=500.0),
            m_row(HOOK_A, POOL_2, bps=0.0),
            m_row(HOOK_A, POOL_2, bps=None, label="NOT_QUOTABLE", size="10" + "0" * 15,
                  reason="NOT_ENOUGH_LIQUIDITY"),
            m_row(HOOK_B, POOL_3, bps=7.5)]
    entries = [r_entry(HOOK_A, "Alpha", vanilla=False, deployer=DEP_1),
               r_entry(HOOK_A, "AlphaHook", vanilla=True, swapAccess="governance"),
               r_entry(HOOK_B, "Beta", vanilla=False),
               r_entry(HOOK_C, "Gamma", vanilla=False)]
    cache = {"chain_id": CID, "entries": {
        HOOK_A: chain_entry(HOOK_A, CODE_X, creator=DEP_1),
        HOOK_B: chain_entry(HOOK_B, CODE_X, creator=DEP_1),
        HOOK_C: chain_entry(HOOK_C, CODE_Y),
    }}
    nodes, edges = [], []
    for producer in (S.from_measurements(rows), S.from_registry(entries), S.from_chain(cache)):
        nodes.extend(producer[0])
        edges.extend(producer[1])
    return B.build_graph(nodes, edges, cls=cls)


# ------------------------------------------------------------------------ schema

class TestSchema(unittest.TestCase):
    def test_split_id_rend_le_type(self):
        self.assertEqual(split_id(hook_id(CID, HOOK_A)), ("hook", f"{CID}:{HOOK_A}"))
        self.assertEqual(split_id(bytecode_id(CODE_X)), ("code", CODE_X))
        # Un prefixe inconnu n'est pas deguise en type.
        self.assertEqual(split_id("wat:1:2"), ("", "wat:1:2"))
        self.assertEqual(split_id("sansprefixe"), ("", "sansprefixe"))

    def test_chain_et_adresse_se_relisent_dans_l_id(self):
        self.assertEqual(chain_of(pool_node_id(CID, POOL_1)), CID)
        self.assertIsNone(chain_of(bytecode_id(CODE_X)))
        self.assertEqual(address_of(registry_id(CID, HOOK_A, 1)), HOOK_A)
        self.assertEqual(address_of(deployer_id(1, DEP_1)), DEP_1)

    def test_id_de_mesure_porte_ce_qui_la_rejoue(self):
        a = measurement_id(POOL_1, True, "1000", BLOCK)
        self.assertEqual(a, measurement_id(POOL_1, True, "1000", BLOCK))
        # Le sens, la taille et le bloc distinguent : sinon deux mesures fusionnent.
        self.assertNotEqual(a, measurement_id(POOL_1, False, "1000", BLOCK))
        self.assertNotEqual(a, measurement_id(POOL_1, True, "2000", BLOCK))
        self.assertNotEqual(a, measurement_id(POOL_1, True, "1000", BLOCK + 1))

    def test_deux_fiches_deux_identifiants(self):
        self.assertNotEqual(registry_id(CID, HOOK_A, 0), registry_id(CID, HOOK_A, 1))

    def test_la_casse_ne_cree_pas_deux_noeuds(self):
        self.assertEqual(hook_id(CID, HOOK_A.upper().replace("0X", "0x")), hook_id(CID, HOOK_A))
        self.assertEqual(token_id(CID, "AAAA000000000000000000000000000000000ACC"),
                         token_id(CID, "0xaaaa000000000000000000000000000000000acc"))


# ------------------------------------------------------------- fusion d'evidence

class TestFusionEvidence(unittest.TestCase):
    """Une arete par (src, dst, kind) — mais aucune citation perdue."""

    def test_une_seule_arete_par_triplet(self):
        g = B.build_graph([Node("hook:8453:0x1", NodeKind.HOOK, "h"),
                           Node("pool:8453:0x2", NodeKind.POOL, "p")],
                          [Edge("hook:8453:0x1", "pool:8453:0x2", EdgeKind.ATTACHED_TO, {"refs": ["a"]}),
                           Edge("hook:8453:0x1", "pool:8453:0x2", EdgeKind.ATTACHED_TO, {"refs": ["b"]})])
        self.assertEqual(g.number_of_edges(), 1)
        ev = g["hook:8453:0x1"]["pool:8453:0x2"][EdgeKind.ATTACHED_TO]["evidence"]
        self.assertEqual(ev["refs"], ["a", "b"])
        self.assertEqual(ev["n"], 2)

    def test_deux_types_deux_aretes(self):
        g = B.build_graph([], [Edge("hook:8453:0x1", "dep:8453:0x2", EdgeKind.DEPLOYED_BY),
                               Edge("hook:8453:0x1", "dep:8453:0x2", EdgeKind.HAS_BYTECODE)])
        self.assertEqual(g.number_of_edges(), 2)

    def test_le_premier_qualifiant_survit(self):
        ev = B._merge_evidence({"source": "registry", "refs": [1]}, {"source": "rpc", "refs": [2]})
        self.assertEqual(ev["source"], "registry")   # premier vu
        self.assertEqual(ev["refs"], [1, 2])         # rien de perdu

    def test_aucun_noeud_sans_type(self):
        g = B.build_graph([], [Edge("hook:8453:0x1", "pool:8453:0x2", EdgeKind.ATTACHED_TO)])
        for n, d in g.nodes(data=True):
            self.assertIn(d["kind"], (NodeKind.HOOK, NodeKind.POOL))
            self.assertTrue((d.get("attrs") or {}).get("external"))

    def test_un_noeud_riche_n_est_pas_ecrase_par_un_pauvre(self):
        g = B.build_graph([Node("hook:8453:0x1", NodeKind.HOOK, "0x1", {"address": "0x1", "code_size": 999}),
                           Node("hook:8453:0x1", NodeKind.HOOK, "Alpha", {"address": "0x1"})], [])
        self.assertEqual(g.nodes["hook:8453:0x1"]["attrs"]["code_size"], 999)
        self.assertEqual(g.nodes["hook:8453:0x1"]["label"], "Alpha")  # le nom bat l'adresse


# --------------------------------------------------------- les deux choix de these

class TestMesureAuCouple(unittest.TestCase):
    """MEASURED_AS part du Pool. Pas du Hook."""

    def setUp(self):
        self.g = toy()

    def test_aucune_arete_hook_vers_mesure(self):
        for u, v, k, d in self.g.edges(keys=True, data=True):
            if d.get("kind") == EdgeKind.MEASURED_AS:
                self.assertEqual(self.g.nodes[u]["kind"], NodeKind.POOL, f"{u} n'est pas un Pool")
                self.assertEqual(self.g.nodes[v]["kind"], NodeKind.MEASUREMENT)

    def test_le_meme_hook_a_deux_profils_selon_le_pool(self):
        h = hook_id(CID, HOOK_A)
        par_pool = {p: Q.bps_profile(self.g, Q.measurements_of_pool(self.g, p))
                    for p in Q.pools_of(self.g, h)}
        self.assertEqual(par_pool[pool_node_id(CID, POOL_1)]["bps_max"], 500.0)
        self.assertEqual(par_pool[pool_node_id(CID, POOL_2)]["bps_max"], 0.0)
        # Une moyenne sur le hook vaudrait 250 bps, un nombre qu'aucun pool ne pratique.


class TestFicheEstUnNoeud(unittest.TestCase):
    """RegistryEntry est un noeud : sinon la deuxieme fiche ecrase la premiere."""

    def setUp(self):
        self.g = toy()

    def test_les_deux_fiches_coexistent(self):
        h = hook_id(CID, HOOK_A)
        entries = Q._out_of(self.g, h, EdgeKind.LISTED_IN)
        self.assertEqual(len(entries), 2)
        noms = sorted(Q._attrs(self.g, e)["name"] for e in entries)
        self.assertEqual(noms, ["Alpha", "AlphaHook"])

    def test_la_divergence_est_visible(self):
        r = Q.contradictions(self.g)
        self.assertEqual(r["n_hooks_with_multiple_entries"], 1)
        self.assertEqual(r["n_contradictory"], 1)
        champs = r["contradictions"][0]["fields"]
        self.assertIn("properties.vanillaSwap", champs)
        self.assertIn("properties.swapAccess", champs)
        self.assertIn("identity.name", champs)


class TestEtoilePasClique(unittest.TestCase):
    def setUp(self):
        self.g = toy()

    def test_le_bytecode_est_un_noeud_partage(self):
        c = bytecode_id(CODE_X)
        self.assertEqual(self.g.nodes[c]["kind"], NodeKind.BYTECODE)
        self.assertEqual(sorted(Q._in_of(self.g, c, EdgeKind.HAS_BYTECODE)),
                         sorted([hook_id(CID, HOOK_A), hook_id(CID, HOOK_B)]))

    def test_n_aretes_et_pas_n_carre(self):
        n_hooks = sum(1 for _n, d in self.g.nodes(data=True) if d["kind"] == NodeKind.HOOK)
        n_star = sum(1 for _u, _v, _k, d in self.g.edges(keys=True, data=True)
                     if d.get("kind") == EdgeKind.HAS_BYTECODE)
        self.assertEqual(n_star, 3)          # A, B, C : une arete chacun
        # La clique equivalente, pour un groupe de k clones, coute k(k-1) aretes
        # et se recalcule entierement a chaque ajout. Ici k=2, donc 2 ; a k=100,
        # 9900 contre 100.
        self.assertLessEqual(n_star, n_hooks)

    def test_twins_passe_par_l_etoile(self):
        r = Q.twins(self.g, HOOK_A)
        self.assertEqual(r["status"], "CODE")
        self.assertEqual(r["n_twins"], 1)
        self.assertEqual(r["twins"][0]["address"], HOOK_B)
        self.assertEqual(Q.twins(self.g, HOOK_C)["n_twins"], 0)


# ------------------------------------------------------------------- les requetes

class TestRequetes(unittest.TestCase):
    def setUp(self):
        self.g = toy()

    def test_impact_ajoute_les_pools_des_clones(self):
        r = Q.impact(self.g, HOOK_A)
        self.assertEqual(r["n_pools"], 2)                    # POOL_1, POOL_2
        self.assertEqual(r["n_twin_pools"], 1)               # POOL_3, via B
        self.assertEqual(r["n_pools_at_risk"], 3)            # sans doublon
        self.assertEqual(r["measurements"]["by_label"]["MEASURED"], 2)
        self.assertEqual(r["measurements"]["by_label"]["NOT_QUOTABLE"], 1)
        self.assertEqual(r["n_tokens"], 2)

    def test_impact_d_un_hook_inconnu_ne_renvoie_pas_un_graphe_vide(self):
        r = Q.impact(self.g, "0x" + "99" * 20)
        self.assertFalse(r["found"])
        self.assertEqual(r["status"], "UNKNOWN_HOOK")
        self.assertNotIn("n_pools", r)   # surtout pas 0 : on ne sait pas

    def test_deployer_cluster(self):
        r = Q.deployer_cluster(self.g, HOOK_A)
        self.assertEqual([d["deployer"] for d in r["deployers"]], [DEP_1])
        self.assertEqual([s["address"] for s in r["siblings"]], [HOOK_B])
        # Deux sources ont dit DEP_1 : la fiche de registre et la tx de creation.
        self.assertEqual(r["deployers"][0]["sources"], ["registry"])

    def test_orphans_ne_compte_que_les_hooks_du_registre(self):
        r = Q.orphans(self.g, CID)
        self.assertEqual(r["n_listed"], 3)
        self.assertEqual([o["address"] for o in r["orphans"]], [HOOK_C])
        self.assertIn("chain_id=8453", r["scope"])

    def test_disagreement_dans_les_deux_sens(self):
        r = Q.disagreement(self.g, CID, flat_bps=1.0)
        # A : une fiche dit vanillaSwap=true, la mesure trouve 500 bps.
        self.assertEqual([x["address"] for x in r["registry_says_vanilla_measure_says_active"]],
                         [HOOK_A])
        # B : fiche vanillaSwap=false, mesure a 7,5 bps -> pas de desaccord.
        self.assertEqual(r["n_registry_says_active_measure_says_flat"], 0)
        # C : au registre, aucune mesure. Il n'est ni d'un cote ni de l'autre.
        self.assertEqual([x["address"] for x in r["not_comparable"]], [HOOK_C])

    def test_hook_summary_designe_la_pire_mesure(self):
        r = Q.hook_summary(self.g, HOOK_A)
        self.assertEqual(r["worst_measurement"]["bps"], 500.0)
        self.assertEqual(r["worst_measurement"]["pool_id"], POOL_1)
        self.assertIn("make measure", r["worst_measurement"]["replay"])


# -------------------------------------------------------------------- honnetete

class TestHonnetete(unittest.TestCase):
    """Regles 2 et 3 : les etiquettes ne s'inventent pas, une absence de reponse
    n'est pas un zero."""

    def test_une_etiquette_inconnue_fait_echouer_la_construction(self):
        with self.assertRaises(ValueError):
            S.from_measurements([m_row(HOOK_A, POOL_1, label="PROBABLEMENT_OK")])
        for lab in LABELS:
            S.from_measurements([m_row(HOOK_A, POOL_1, label=lab, bps=None)])

    def test_aucune_mesure_cotable_ne_donne_pas_zero_bps(self):
        g = B.build_graph(*S.from_measurements([
            m_row(HOOK_A, POOL_1, bps=None, label="NOT_QUOTABLE", reason="NOT_ENOUGH_LIQUIDITY")]))
        prof = Q.bps_profile(g, Q.measurements_of_pool(g, pool_node_id(CID, POOL_1)))
        self.assertIsNone(prof["bps_max"])
        self.assertIsNone(prof["bps_min"])
        self.assertIsNone(prof["flat"])
        self.assertEqual(prof["by_label"]["NOT_QUOTABLE"], 1)

    def test_bytecode_non_lu_n_est_pas_bytecode_sans_clone(self):
        cache = {"chain_id": CID, "entries": {
            HOOK_A: chain_entry(HOOK_A, status="UNAVAILABLE", reason="429 du RPC")}}
        g = B.build_graph(*S.from_chain(cache))
        r = Q.twins(g, HOOK_A)
        self.assertTrue(r["found"])
        self.assertEqual(r["status"], "UNAVAILABLE")
        self.assertEqual(r["twins"], [])
        self.assertIn("429", r["reason"])
        self.assertNotEqual(r["status"], "CODE")   # surtout pas "0 clone, c'est sur"

    def test_deployeur_non_lu_n_est_pas_deployeur_absent(self):
        cache = {"chain_id": CID, "entries": {
            HOOK_A: chain_entry(HOOK_A, CODE_X, status="UNAVAILABLE", reason="mirror muet")}}
        g = B.build_graph(*S.from_chain(cache))
        r = Q.deployer_cluster(g, HOOK_A)
        self.assertEqual(r["status"], "UNAVAILABLE")
        self.assertIn("mirror muet", r["reason"])


class TestRefusDeReponse(unittest.TestCase):
    """Le bug qui a coute cinq faux resultats a ce projet, reproduit et cerne.

    Blockscout renvoie HTTP 200 avec un corps qui n'est pas une reponse. Lu
    naivement, il fabrique 142 "sans createur" sur 160 adresses."""

    RATE_LIMIT = {"message": "Too many requests. Increase limits now at https://dev.blockscout.com"}

    def test_un_429_deguise_en_200_ressort_UNAVAILABLE(self):
        with patch.object(C, "_http_get_json", return_value=self.RATE_LIMIT):
            r = C.fetch_creation([HOOK_A], retries=1)
        self.assertEqual(r[HOOK_A]["status"], "UNAVAILABLE")
        self.assertIn("Too many requests", r[HOOK_A]["reason"])
        self.assertIsNone(r[HOOK_A].get("creator"))

    def test_une_vraie_absence_reste_ABSENT(self):
        reponse = {"hash": HOOK_A, "creation_transaction_hash": None,
                   "creator_address_hash": None, "is_contract": True}
        with patch.object(C, "_http_get_json", return_value=reponse):
            r = C.fetch_creation([HOOK_A], retries=1)
        self.assertEqual(r[HOOK_A]["status"], "ABSENT")   # le mirror a repondu : il ne sait pas

    def test_le_createur_vient_de_la_tx_signee_pas_du_mirror(self):
        reponse = {"hash": HOOK_A, "creation_transaction_hash": "0xdead",
                   "creator_address_hash": "0x4E59B44847b379578588920cA78FbF26c0B4956C"}
        tx = {"from": "0xA1AB6EB729c08B774798418b95d9C00d6ec73527",
              "to": "0x4e59b44847b379578588920ca78fbf26c0b4956c", "blockNumber": "0x2d07edf"}
        with patch.object(C, "_http_get_json", return_value=reponse), \
             patch.object(C, "rpc_call", return_value=tx):
            r = C.fetch_creation([HOOK_A], rpc_url="http://x", retries=1)
        self.assertEqual(r[HOOK_A]["creator"], "0xa1ab6eb729c08b774798418b95d9c00d6ec73527")
        self.assertEqual(r[HOOK_A]["factory"], "0x4e59b44847b379578588920ca78fbf26c0b4956c")
        self.assertEqual(r[HOOK_A]["creation_block"], 47218399)
        self.assertEqual(r[HOOK_A]["source"], "blockscout+eth_getTransactionByHash")
        # Le createur immediat du mirror est la FABRIQUE, pas le signataire.
        self.assertNotEqual(r[HOOK_A]["creator"], r[HOOK_A]["immediate_creator"])

    def test_un_getCode_qui_echoue_n_est_pas_une_adresse_vide(self):
        with patch.object(C, "get_code", side_effect=RpcError("429 rate limited")), \
             patch.object(C.time, "sleep", lambda *_: None):
            r = C.fetch_code_one("http://x", HOOK_A, BLOCK)
        self.assertEqual(r["status"], "UNAVAILABLE")
        self.assertNotIn("code_hash", r)

    def test_une_adresse_vraiment_vide_est_ABSENT(self):
        with patch.object(C, "get_code", return_value="0x"), \
             patch.object(C, "rpc_call", return_value=hex(BLOCK + 10)):
            r = C.fetch_code_one("http://x", HOOK_A, BLOCK)
        self.assertEqual(r["status"], "ABSENT")

    def test_le_keccak_du_code_est_verifiable_a_la_main(self):
        # cast keccak 0x  ->  0xc5d24601...  (keccak-256 de la chaine vide)
        self.assertEqual(C.code_hash("0x"),
                         "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")


# ------------------------------------------------------------ (de)serialisation

class TestRoundTrip(unittest.TestCase):
    def test_le_json_rend_le_meme_graphe_et_les_memes_reponses(self):
        g = toy()
        g2 = B.from_json(B.to_json(g))
        self.assertEqual(B.to_json(g), B.to_json(g2))
        for fn in (lambda x: Q.impact(x, HOOK_A), lambda x: Q.twins(x, HOOK_A),
                   lambda x: Q.orphans(x, CID), Q.contradictions,
                   lambda x: Q.disagreement(x, CID)):
            self.assertEqual(fn(g), fn(g2))


class TestBothBackends(unittest.TestCase):
    """networkx et la repli stdlib doivent etre indiscernables."""

    def test_meme_json_memes_reponses(self):
        a = toy(cls=StdlibMultiDiGraph)
        b = toy()   # networkx s'il est installe
        self.assertEqual(B.to_json(a)["nodes"], B.to_json(b)["nodes"])
        self.assertEqual(B.to_json(a)["edges"], B.to_json(b)["edges"])
        self.assertEqual(Q.impact(a, HOOK_A), Q.impact(b, HOOK_A))
        self.assertEqual(Q.contradictions(a), Q.contradictions(b))
        self.assertEqual(Q.disagreement(a, CID), Q.disagreement(b, CID))

    def test_la_repli_stdlib_expose_ce_dont_build_a_besoin(self):
        g = StdlibMultiDiGraph()
        g.add_node("a", kind="Hook", label="a", attrs={})
        g.add_edge("a", "b", key="K", kind="K", evidence={})
        self.assertTrue(g.has_edge("a", "b", "K"))
        self.assertEqual(g["a"]["b"]["K"]["kind"], "K")
        self.assertEqual(list(g.in_edges("b", keys=True, data=True))[0][0], "a")
        self.assertEqual(g.number_of_nodes(), 2)
        self.assertEqual(g.number_of_edges(), 1)


# ------------------------------------------------------------------------ cache

class TestCache(unittest.TestCase):
    """Le bug de cobol-explorer (server/api/app.py:157) : le graphe reconstruit
    a chaque requete. Ici il est charge une fois, et on le prouve."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.p = Path(self.tmp.name) / "g.json"
        self.p.write_text(json.dumps(B.to_json(toy())))
        ST.invalidate()
        ST.STATS.update(hits=0, misses=0)

    def tearDown(self):
        ST.invalidate()
        self.tmp.cleanup()

    def test_deux_chargements_un_seul_parcours_de_fichier(self):
        a = ST.load_store(self.p)
        b = ST.load_store(self.p)
        self.assertIs(a, b)
        self.assertEqual(ST.STATS["misses"], 1)
        self.assertEqual(ST.STATS["hits"], 1)

    def test_un_fichier_reecrit_invalide_l_entree(self):
        a = ST.load_store(self.p)
        time.sleep(0.01)
        self.p.write_text(json.dumps(B.to_json(toy())) + " ")
        b = ST.load_store(self.p)
        self.assertIsNot(a, b)
        self.assertEqual(ST.STATS["misses"], 2)

    def test_les_agregats_ne_sont_calcules_qu_une_fois(self):
        s = ST.load_store(self.p)
        with patch.object(Q, "contradictions", wraps=Q.contradictions) as spy:
            s.contradictions()
            s.contradictions()
            s.contradictions()
        self.assertEqual(spy.call_count, 1)

    def test_un_graphe_absent_leve_au_lieu_de_rendre_un_graphe_vide(self):
        with self.assertRaises(FileNotFoundError):
            ST.load_store(Path(self.tmp.name) / "nexistepas.json")


# -------------------------------------------------------------- donnees reelles

@unittest.skipUnless(GRAPH_JSON.exists(), f"{GRAPH_JSON} absent : lancer tare.graph.cli build")
class TestGrapheReel(unittest.TestCase):
    """Le graphe publie, verifie contre SES SOURCES et non contre des constantes.

    Une premiere version de cette classe figeait les nombres du jour : 995 mesures, 199 pools,
    613 fiches, 157 hooks listes. Ils etaient exacts une journee. Le corpus a ete multiplie par
    onze pendant la semaine et les cinq tests se sont mis a echouer sur un graphe parfaitement
    correct — en signalant un changement de donnees comme s'il s'agissait d'une regression.

    Un test qui fige un total ne verifie pas le graphe, il verifie la date. Ce qui doit tenir
    quelle que soit la taille du corpus, c'est l'ACCORD entre le graphe et ce dont il est fait :
    autant de noeuds Measurement que de lignes lues, la meme repartition d'etiquettes, autant de
    fiches que le registre en publie. C'est ce que ces tests verifient maintenant, et cela
    attrape strictement plus de choses qu'un nombre grave dans le marbre.
    """

    @classmethod
    def setUpClass(cls):
        cls.s = ST.load_store(GRAPH_JSON)
        cls.g = cls.s.g
        cls.meta = cls.s.meta
        cls.registry = S.read_registry(S.DEFAULT_HOOKLIST)
        # Les mesures TELLES QUE LE GRAPHE LES PORTE. On ne relit pas le jeu vivant pour
        # compter : un balayage y ajoute des lignes pendant que le test tourne, et le graphe
        # serait declare faux pour avoir ete construit une minute plus tot.
        cls.mes = [d["attrs"] for _, d in cls.g.nodes(data=True)
                   if d.get("kind") == NodeKind.MEASUREMENT]

    def test_le_compte_des_noeuds_et_des_aretes(self):
        """Le graphe contient exactement ce que ses sources contiennent."""
        st = self.s.stats()
        n_pools = len({m["pool_id"] for m in self.mes})
        # Le graphe est-il ce qu'il DIT etre ? Sa meta annonce un nombre de mesures et de
        # fiches ; ses noeuds doivent les porter exactement.
        self.assertEqual(st["by_node_kind"][NodeKind.MEASUREMENT], self.meta["n_measurements"])
        self.assertEqual(st["by_node_kind"][NodeKind.REGISTRY_ENTRY],
                         self.meta["n_registry_entries"])
        self.assertEqual(st["by_node_kind"][NodeKind.POOL], n_pools)
        self.assertEqual(st["by_edge_kind"][EdgeKind.MEASURED_AS], self.meta["n_measurements"])
        self.assertEqual(st["by_edge_kind"][EdgeKind.ATTACHED_TO], n_pools)
        self.assertEqual(st["by_edge_kind"][EdgeKind.LISTED_IN], len(self.registry))
        # Des fiches en double existent : autant de couples (adresse, chainId) distincts que
        # de fiches signifierait qu'aucun hook n'est decrit deux fois, ce qui est faux.
        couples = {(e["hook"]["address"].lower(), e["hook"]["chainId"]) for e in self.registry}
        n_multi = self.s.contradictions()["n_hooks_with_multiple_entries"]
        self.assertEqual(len(self.registry) - len(couples), n_multi,
                         "les doublons du registre doivent expliquer exactement l'ecart")

    def test_tout_noeud_a_un_type_connu(self):
        connus = {v for k, v in vars(NodeKind).items() if not k.startswith("_")}
        for n, d in self.g.nodes(data=True):
            self.assertIn(d.get("kind"), connus, n)

    def test_les_mesures_pendent_toutes_a_un_pool(self):
        n = 0
        for u, v, k, d in self.g.edges(keys=True, data=True):
            if d.get("kind") == EdgeKind.MEASURED_AS:
                n += 1
                self.assertEqual(self.g.nodes[u]["kind"], NodeKind.POOL)
        # Toutes les mesures, sans exception : une seule orpheline serait un bps sans pool.
        self.assertEqual(n, self.meta["n_measurements"])

    def test_chaque_mesure_se_rejoue_en_une_commande(self):
        for n, d in self.g.nodes(data=True):
            if d.get("kind") != NodeKind.MEASUREMENT:
                continue
            a = d["attrs"]
            self.assertIn("make measure", a["replay"])
            self.assertIn(str(a["block_number"]), a["replay"])
            self.assertIn(a["amount_in"], a["replay"])
            self.assertIn(a["hook"], a["replay"])

    def test_les_etiquettes_sont_celles_du_moteur(self):
        compte = {lab: 0 for lab in LABELS}
        for n, d in self.g.nodes(data=True):
            if d.get("kind") == NodeKind.MEASUREMENT:
                compte[d["attrs"]["label"]] += 1
        # 1. Rien ne se perd et rien ne s'invente : la somme fait le compte annonce.
        self.assertEqual(sum(compte.values()), self.meta["n_measurements"])

        # 2. Aucune etiquette n'a ete PROMUE. C'est la faute que ce projet redoute le plus :
        #    un NOT_QUOTABLE devenu MEASURED, un timeout devenu zero. On relit le jeu vivant
        #    et on exige que chaque mesure du graphe y porte LA MEME etiquette. Le jeu peut
        #    avoir grandi depuis — c'est une inclusion, pas une egalite — mais une seule
        #    etiquette differente est une regression, et un noeud introuvable aussi.
        vivant = {}
        for r in S.read_measurements():
            vivant[(r["pool_id"], r["block_number"], r["amount_in"],
                    r["zero_for_one"])] = r["label"]
        manquants, promus = 0, []
        for m in self.mes:
            cle = (m["pool_id"], m["block_number"], m["amount_in"], m["zero_for_one"])
            if cle not in vivant:
                manquants += 1
            elif vivant[cle] != m["label"]:
                promus.append((cle, m["label"], vivant[cle]))
        self.assertEqual(promus, [], f"etiquette changee entre le jeu et le graphe : {promus[:3]}")
        self.assertEqual(manquants, 0,
                         f"{manquants} mesures du graphe ne sont plus dans le jeu publie")

    def test_le_hook_le_plus_preleveur(self):
        r = self.s.hook_summary("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc")
        self.assertEqual(r["profile"]["bps_max"], 1176.4601)
        self.assertEqual(r["n_pools"], 31)
        # Et il partage son deployeur avec un autre hook Clanker.
        self.assertEqual(len(self.s.deployer_cluster(r["hook"])["siblings"]), 1)

    def test_orphelins_sur_base(self):
        r = self.s.orphans(8453)
        listes = {e["hook"]["address"].lower() for e in self.registry
                  if e["hook"].get("chainId") == 8453}
        mesures = {m["hook"].lower() for m in self.mes if m["chain_id"] == 8453}
        self.assertEqual(r["n_listed"], len(listes))
        # Un orphelin est une fiche Base sans aucun pool mesure. Le compte se deduit.
        self.assertEqual(r["n_orphans"], len(listes - mesures))
        self.assertLessEqual(r["n_orphans"], r["n_listed"])
        self.assertIn("chain_id=8453", r["scope"])

    def test_contradictions_du_registre(self):
        r = self.s.contradictions()
        self.assertEqual(r["n_contradictory"], 33)
        props = [x for x in r["contradictions"]
                 if any(f.startswith("properties.") for f in x["fields"])]
        self.assertEqual(len(props), 10)
        # Les flags, eux, ne divergent jamais : ils sont deductibles de l'adresse.
        flags = [x for x in r["contradictions"]
                 if any(f.startswith("flags.") for f in x["fields"])]
        self.assertEqual(flags, [])

    def test_desaccord_registre_mesure(self):
        r = self.s.disagreement(8453, 1.0)
        plats = [x["address"] for x in r["registry_says_active_measure_says_flat"]]
        self.assertEqual(plats, ["0x3b2b979df21036cee51b8debb13100e2cb8deacc"])
        self.assertEqual(r["registry_says_active_measure_says_flat"][0]["profile"]["bps_max"],
                         0.0019)
        # Les hooks que l'on ne peut PAS comparer : une revendication vanillaSwap, et aucune
        # mesure MEASURED. Ils ne comptent ni comme accord ni comme desaccord — c'est la
        # troisieme colonne que le projet refuse de laisser tomber dans l'une des deux autres.
        mesures_ok = {m["hook"].lower() for m in self.mes
                      if m["chain_id"] == 8453 and m["label"] == "MEASURED"}
        revendiquent = {e["hook"]["address"].lower() for e in self.registry
                        if e["hook"].get("chainId") == 8453
                        and (e.get("properties") or {}).get("vanillaSwap") is not None}
        self.assertEqual(r["n_not_comparable"], len(revendiquent - mesures_ok))
        self.assertGreater(r["n_not_comparable"], 0,
                           "si plus rien n'est incomparable, la troisieme colonne a disparu")

    def test_les_clones_reels(self):
        cs = self.s.clusters(min_size=2)
        self.assertEqual(len(cs), 2)
        self.assertTrue(all(c["n_hooks"] == 2 for c in cs))
        adresses = sorted(a for c in cs for a in c["hooks"])
        self.assertIn("0x04e08a08bab77b389e970a65d91fba8bf4ef6080", adresses)
        self.assertIn("0x7fa49d29481b6d168505ccde26635e204c09e5cf", adresses)

    def test_deux_hooks_nommes_LaunchHook_ne_font_pas_la_meme_chose(self):
        """Le graphe repond a une question que le registre seul ne peut pas :
        deux hooks portent le nom LaunchHook sur Base, et l'un preleve 100 bps
        la ou l'autre ne preleve rien."""
        cher = self.s.hook_summary("0x985c14baa2a18316ffda0aefb3a632fadfca2acc")
        gratuit = self.s.hook_summary("0x3b2b979df21036cee51b8debb13100e2cb8deacc")
        self.assertEqual(cher["registry_names"], ["LaunchHook"])
        self.assertEqual(gratuit["registry_names"], ["LaunchHook"])
        self.assertGreater(cher["profile"]["bps_max"], 99.0)
        self.assertLess(gratuit["profile"]["bps_max"], 1.0)
        self.assertNotEqual(self.s.twins(cher["hook"])["code_hash"],
                            self.s.twins(gratuit["hook"])["code_hash"])


@unittest.skipUnless(CHAIN_CACHE.exists(), f"{CHAIN_CACHE} absent : lancer tare.graph.cli fetch-chain")
class TestCacheChaine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cache = C.load_cache(CHAIN_CACHE)

    def test_aucune_lecture_de_bytecode_n_est_restee_sans_reponse(self):
        statuts = [e["code"]["status"] for e in self.cache["entries"].values()]
        self.assertEqual(statuts.count("UNAVAILABLE"), 0,
                         "un UNAVAILABLE est une adresse NON LUE : relancer fetch-chain")
        self.assertEqual(len(statuts), 160)
        self.assertEqual(statuts.count("CODE"), 160)

    def test_les_createurs_viennent_de_la_tx_signee(self):
        avec = [e for e in self.cache["entries"].values() if e["creation"].get("creator")]
        self.assertEqual(len(avec), 94)
        for e in avec:
            self.assertEqual(e["creation"]["source"], "blockscout+eth_getTransactionByHash")
            self.assertIsNotNone(e["creation"]["creation_block"])
        # Les 66 autres : le mirror a repondu qu'il ne connait pas la creation.
        absents = [e for e in self.cache["entries"].values()
                   if e["creation"]["status"] == "ABSENT"]
        self.assertEqual(len(absents), 66)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestCacheBench(unittest.TestCase):
    """Le README publie des durees de cache. Elles doivent venir d'une commande.

    On n'affirme AUCUNE duree ici : une assertion sur des millisecondes est verte
    ou rouge selon la charge de la machine, et un test qui clignote finit ignore.
    Ce qu'on verifie est ce que le cache PROMET, et qui ne depend pas de la vitesse
    du processeur : la remise a chaud est plus rapide que la lecture froide, elle
    est plus rapide que la reconstruction, et le banc rend bien les cinq mesures
    que le README cite — sinon le README citerait un chiffre que plus rien ne produit.
    """

    @classmethod
    def setUpClass(cls):
        from tare.graph import cachebench
        if not cachebench.DEFAULT_GRAPH.exists():
            raise unittest.SkipTest("graph.json absent : python3 -m tare.graph.cli build")
        cls.r = cachebench.measure(repeats=3)

    def test_le_banc_rend_les_cinq_mesures_que_le_README_cite(self):
        for k in ("cold_load_ms", "warm_handback_ms", "impact_ms",
                  "memoised_aggregate_ms", "rebuild_from_sources_ms"):
            self.assertIn(k, self.r)
            self.assertGreater(self.r[k], 0.0, f"{k} a 0 : rien n'a ete mesure")

    def test_la_remise_a_chaud_bat_la_lecture_froide(self):
        self.assertLess(self.r["warm_handback_ms"], self.r["cold_load_ms"])

    def test_la_remise_a_chaud_bat_la_reconstruction(self):
        """C'est l'erreur que ce cache existe pour eviter — elle doit se voir."""
        self.assertLess(self.r["warm_handback_ms"], self.r["rebuild_from_sources_ms"])

    def test_impact_est_mesure_sur_le_pire_cas_pas_sur_un_cas_moyen(self):
        """Le hook choisi doit etre le plus large du jeu, sinon le chiffre flatte."""
        from tare.graph.store import load_store
        s = load_store()
        largest = max(len(s.impact(d.get("address") or n).get("pools") or [])
                      for n, d in s.g.nodes(data=True)
                      if d.get("kind") == NodeKind.HOOK)
        self.assertEqual(self.r["impact_pools"], largest)
