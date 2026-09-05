"""Le classement des pools a sens unique — et surtout ce qu'il refuse de retenir.

Ce test existe parce que la conclusion « ce hook prend 99,99 % » est la plus lourde que ce
projet ait publiee. Elle ne doit sortir que d'un motif tres precis, et surtout PAS des trois
situations qui lui ressemblent : un pool cher dans les deux sens, un pool plat dans les deux
sens, et un pool qui ne cote que d'un cote.
"""
import unittest

from tare.oneway import classify, group_by_bytecode


def m(pool, zfo, amount, bps, hook="0xaaa", label="MEASURED"):
    return {
        "hook": hook, "pool_id": pool, "zero_for_one": zfo, "amount_in": str(amount),
        "bps": bps, "label": label, "currency0": "0x00", "currency1": "0x11",
        "stored_lp_fee": 3000, "block_number": 50614000,
    }


def serie(pool, zfo, bps, hook="0xaaa", n=8):
    return [m(pool, zfo, 10 ** (12 + i), bps, hook) for i in range(n)]


class TestCeQuiEstRetenu(unittest.TestCase):
    def test_un_sens_plat_et_l_autre_confiscatoire_est_retenu(self):
        rows = serie("0xp1", True, 0.0) + serie("0xp1", False, 9999.0)
        r = classify(rows)
        self.assertEqual(r["portee"]["pools_retenus"], 1)
        t = r["pools"][0]
        self.assertEqual(t["sens_lourd"], "1->0")
        self.assertEqual(t["bps_median_lourd"], 9999.0)
        self.assertEqual(t["bps_median_leger"], 0.0)
        # Les huit tailles sont publiees : un taux qui tient sur huit decades n'est pas un
        # accident sur une taille, et le lecteur doit pouvoir le constater.
        self.assertEqual(len(t["par_taille_lourd"]), 8)
        self.assertEqual([int(x["amount_in"]) for x in t["par_taille_lourd"]],
                         sorted(int(x["amount_in"]) for x in t["par_taille_lourd"]))


class TestCeQuiEstREFUSE(unittest.TestCase):
    def test_un_pool_cher_dans_LES_DEUX_sens_n_est_pas_a_sens_unique(self):
        # 500 bps des deux cotes : c'est un tarif, pas un piege a sens unique.
        rows = serie("0xp2", True, 500.0) + serie("0xp2", False, 500.0)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)

    def test_un_pool_cher_des_deux_cotes_meme_tres_cher_reste_refuse(self):
        rows = serie("0xp3", True, 9999.0) + serie("0xp3", False, 9999.0)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)

    def test_un_pool_plat_des_deux_cotes_est_refuse(self):
        rows = serie("0xp4", True, 0.0) + serie("0xp4", False, 0.0)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)

    def test_un_pool_qui_ne_cote_que_d_un_cote_n_est_pas_asymetrique(self):
        # Aucune mesure dans l'autre sens : c'est un fait de LIQUIDITE, deja porte par les
        # lignes NOT_QUOTABLE. Le compter ici inventerait une asymetrie de prix.
        rows = serie("0xp5", False, 9999.0)
        r = classify(rows)
        self.assertEqual(r["portee"]["pools_retenus"], 0)
        self.assertEqual(r["portee"]["pools_mesures_dans_les_deux_sens"], 0)

    def test_deux_tailles_d_un_cote_ne_suffisent_pas(self):
        rows = serie("0xp6", True, 0.0, n=2) + serie("0xp6", False, 9999.0)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)

    def test_les_lignes_non_MEASURED_ne_comptent_jamais(self):
        rows = serie("0xp7", True, 0.0)
        for r in serie("0xp7", False, 9999.0):
            r["label"] = "NOT_QUOTABLE"
            r["bps"] = None
            rows.append(r)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)

    def test_juste_sous_le_seuil_n_est_pas_retenu(self):
        rows = serie("0xp8", True, 0.0) + serie("0xp8", False, 999.9)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 0)
        # et juste au-dessus l'est : le seuil est bien celui qui decide, pas autre chose
        rows = serie("0xp9", True, 0.0) + serie("0xp9", False, 1000.0)
        self.assertEqual(classify(rows)["portee"]["pools_retenus"], 1)


class TestLeRapportSeDenonce(unittest.TestCase):
    def test_le_rapport_porte_ses_seuils_et_son_denominateur(self):
        rows = serie("0xpa", True, 0.0) + serie("0xpa", False, 9999.0)
        r = classify(rows)
        self.assertEqual(r["seuils"]["heavy_bps"], 1000.0)
        self.assertIn("PUBLICATION", r["seuils"]["note"])
        # Le denominateur compte autant que le numerateur : 5 sur 2040 ne se lit pas comme
        # 5 sur 5.
        self.assertEqual(r["portee"]["pools_mesures_dans_les_deux_sens"], 1)

    def test_un_bytecode_non_lu_est_dit_non_lu_et_jamais_suppose_distinct(self):
        rows = (serie("0xpb", True, 0.0, hook="0xh1") + serie("0xpb", False, 9999.0, hook="0xh1")
                + serie("0xpc", True, 0.0, hook="0xh2") + serie("0xpc", False, 9999.0, hook="0xh2"))
        g = group_by_bytecode(classify(rows), {})
        grp = g["groupes_de_bytecode"]
        self.assertEqual(len(grp), 1)
        self.assertEqual(grp[0]["code_hash"], "NON_LU")
        self.assertIn("on ne le sait pas", grp[0]["note"])

    def test_un_meme_contrat_deploye_deux_fois_compte_pour_un_groupe(self):
        rows = (serie("0xpd", True, 0.0, hook="0xh1") + serie("0xpd", False, 9999.0, hook="0xh1")
                + serie("0xpe", True, 0.0, hook="0xh2") + serie("0xpe", False, 9999.0, hook="0xh2"))
        g = group_by_bytecode(classify(rows), {"0xh1": "sha_identique", "0xh2": "sha_identique"})
        grp = g["groupes_de_bytecode"]
        self.assertEqual(len(grp), 1)
        self.assertEqual(grp[0]["n_hooks"], 2)


if __name__ == "__main__":
    unittest.main()
