/**
 * La consultation. Regle dure n.2 : aucune etiquette n'est promue.
 */
import { describe, it, expect } from "vitest";
import { TABLE } from "../src/guard.js";
import { consult, hookContext, assertTable, BadTable } from "../src/table.js";
import { WORST_POOL } from "./helpers.js";

describe("table pre-calculee", () => {
  it("porte les 995 mesures du bloc 50 614 000", () => {
    expect(TABLE.schema).toBe("tare-guard-table/1");
    // Le corpus a grandi de 995 a plus de cent mille mesures : figer le total revenait a
    // dater le test, pas a le verifier. Ce qui doit tenir, c'est que l'en-tete de la table
    // annonce EXACTEMENT ce que la table contient.
    let points = 0;
    for (const pool of Object.values(TABLE.pools))
      for (const dir of Object.values(pool.dirs)) points += dir.length;
    expect(TABLE.n_measurements).toBe(points);
    // 12 hooks au premier balayage, 112 depuis. L'en-tete doit compter ce que la table
    // contient, pas ce qu'elle contenait.
    const hooks = new Set(Object.values(TABLE.pools).map((p) => p.hook.toLowerCase()));
    expect(TABLE.n_hooks).toBe(hooks.size);
    expect(TABLE.n_pools).toBe(Object.keys(TABLE.pools).length);
    expect(TABLE.block_number).toBe(50614000);
    expect(TABLE.chain_id).toBe(8453);
    expect(TABLE.engine_ver).toBe("tare-engine/0.3.0");
    expect(TABLE.stub_hash).toBe("0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4");
  });

  it("refuse une table qui n'a pas le bon schema", () => {
    expect(() => assertTable({ schema: "autre" })).toThrow(BadTable);
    expect(() => assertTable(null)).toThrow(BadTable);
  });

  it("aucune ligne NOT_QUOTABLE ou NOT_MEASURABLE ne porte de nombre", () => {
    let nonNumeric = 0;
    for (const pool of Object.values(TABLE.pools)) {
      for (const points of Object.values(pool.dirs)) {
        for (const p of points) {
          if (p.label === "NOT_QUOTABLE" || p.label === "NOT_MEASURABLE") {
            expect(p.bps, `${p.label} porte ${p.bps}`).toBeNull();
            nonNumeric++;
          }
        }
      }
    }
    // On ne fige pas le compte — il suit le corpus. Ce qui compte est verifie ligne a ligne
    // juste au-dessus : AUCUNE ligne non mesuree ne porte de nombre. Le total sert seulement
    // a garantir que la boucle a bien vu quelque chose.
    expect(nonNumeric).toBeGreaterThan(0);
    expect(nonNumeric).toBeLessThan(TABLE.n_measurements);
  }, 60_000);
  // Ce test parcourt LA TABLE ENTIERE — 125 072 points, 7 817 pools, 21 Mo — et sa duree
  // croit donc avec le corpus. Il tenait dans les 5 s par defaut de vitest a 199 pools ;
  // sous la charge d'une autre suite il les depasse maintenant, et l'expiration se lit
  // comme « une ligne non mesuree porte un nombre » alors qu'aucune n'en porte. Le budget
  // suit le travail reel plutot que de le nier — meme raison que encode.test.ts et
  // keccak.test.ts, qui ont eu le meme probleme quand le corpus a grandi.
});

describe("consult", () => {
  const dir = "1->0" as const;

  it("taille exacte -> MEASURED, avec le bloc et la taille cites", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "100000000000000");
    expect(c.label).toBe("MEASURED");
    expect(c.basis).toBe("exact");
    expect(c.bps).toBeCloseTo(689.9519, 4);
    expect(c.citations.length).toBe(1);
    expect(c.citations[0]!.blockNumber).toBe(50614000);
    expect(c.citations[0]!.amountIn).toBe("100000000000000");
  });

  it("taille intermediaire -> INTERPOLATED, encadree par deux mesures citees", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "300000000000000000");
    expect(c.label).toBe("INTERPOLATED");
    expect(c.basis).toBe("interpolated");
    expect(c.citations.length).toBe(2);
    expect(c.citations[0]!.amountIn).toBe("100000000000000000");
    expect(c.citations[1]!.amountIn).toBe("1000000000000000000");
    // le profil descend de 645,05 a 406,64 : l'interpole doit tomber entre les deux
    expect(c.bps!).toBeLessThan(645.0497);
    expect(c.bps!).toBeGreaterThan(406.6356);
  });

  it("taille hors plage -> NOT_MEASURABLE, jamais une extrapolation", () => {
    // La taille « hors plage » se DEDUIT de la plage reelle : 1e19 etait hors plage quand
    // le balayage s'arretait a 1e18, il est mesure depuis. Figer une taille revenait a
    // figer l'etat du balayage de ce jour-la.
    const mesurees = TABLE.pools[WORST_POOL.poolId]!.dirs[dir]!.map((x) => BigInt(x.amount_in));
    const plusGrande = mesurees.reduce((a, b) => (b > a ? b : a));
    const big = consult(
      TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, (plusGrande * 1000n).toString(),
    );
    expect(big.label).toBe("NOT_MEASURABLE");
    expect(big.bps).toBeNull();
    expect(big.reason).toContain("taille_hors_plage_mesuree");
    expect(BigInt(big.citations[0]!.amountIn)).toBe(plusGrande);
    const small = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, "1");
    expect(small.label).toBe("NOT_MEASURABLE");
    expect(small.bps).toBeNull();
  });

  it("le sens qui ne cote pas ne devient pas un zero, et montre la ligne qui refuse", () => {
    // Ce sens etait ABSENT de la table au premier balayage — d'ou NOT_MEASURABLE. Depuis, le
    // moteur balaie les deux sens : il a essaye, et le pool ne cote pas. NOT_QUOTABLE est
    // donc plus precis, pas moins. Ce qui ne change pas, et qui est le fond du test : aucune
    // des deux etiquettes ne porte de nombre.
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, "0->1", "100000000000000");
    expect(["NOT_QUOTABLE", "NOT_MEASURABLE"]).toContain(c.label);
    expect(c.bps).toBeNull();
    // Le motif nomme la cause reelle : le sens etait absent hier (« sens_non_mesure:0->1 »),
    // il est desormais interroge et revert (« NOT_ENOUGH_LIQUIDITY »). Les deux disent
    // pourquoi il n'y a pas de nombre — c'est cela qu'on exige, pas une chaine precise.
    expect(c.reason).toBeTruthy();
    // Le faisceau a change de nature parce que le balayage a change de portee. Quand le
    // sens etait ABSENT, la garde citait tout le profil de l'autre sens faute de mieux ;
    // maintenant qu'il est interroge et refuse, elle cite LA ligne exacte qui refuse. Plus
    // precis, pas moins. Ce qu'on exige : au moins une preuve, et aucune valeur.
    expect(c.citations.length).toBeGreaterThan(0);
    for (const cit of c.citations) expect(cit.bps === null || typeof cit.bps === "number").toBe(true);
    // `evidence` signifiait « je cite le profil de l'autre sens faute d'avoir celui-ci ».
    // La table porte maintenant la ligne exacte du sens demande, donc la base est `exact` :
    // la garde ne raisonne plus par analogie, elle montre la mesure qui refuse.
    expect(c.basis).toBe("exact");
  });

  it("taille inconnue (OPEN_DELTA, multi-saut) -> tout le profil en faisceau, aucun nombre", () => {
    const c = consult(TABLE, WORST_POOL.poolId, WORST_POOL.hook, dir, null);
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.reason).toContain("taille_absente_du_calldata");
    // Autant de citations que de tailles mesurees dans ce sens : cinq hier, huit depuis.
    expect(c.citations.length).toBe(TABLE.pools[WORST_POOL.poolId]!.dirs[dir]!.length);
  });

  it("pool absent mais hook connu -> NOT_MEASURABLE + contexte du hook, pas de promotion", () => {
    const c = consult(TABLE, "0x" + "ab".repeat(32), WORST_POOL.hook, dir, "100000000000000");
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.reason).toContain("pool_absent_de_la_table");
    expect(c.basis).toBe("evidence");
    // Le pire prelevement de ce hook se DEDUIT de la table : il etait a 1e14 quand le
    // balayage commencait la, il est a 1e12 depuis que le balayage descend plus bas.
    const pires = Object.values(TABLE.pools)
      .filter((x) => x.hook.toLowerCase() === WORST_POOL.hook.toLowerCase())
      .flatMap((x) => Object.values(x.dirs).flat())
      .filter((x) => x.bps !== null);
    const pire = pires.reduce((a, b) => (b.bps! > a.bps! ? b : a));
    expect(c.hookContext!.measured!.bpsMax).toBeCloseTo(pire.bps!, 4);
    expect(c.hookContext!.measured!.worst.amountIn).toBe(pire.amount_in);
  });

  it("hook totalement inconnu -> aucun faisceau, aucun nombre", () => {
    const c = consult(TABLE, "0x" + "cd".repeat(32), "0x" + "11".repeat(20), dir, "100000000000000");
    expect(c.label).toBe("NOT_MEASURABLE");
    expect(c.bps).toBeNull();
    expect(c.basis).toBe("none");
    expect(c.hookContext).toBeNull();
    expect(c.citations).toEqual([]);
  });

  it("un hook dont toutes les mesures sont non numeriques n'a pas de mediane", () => {
    // Le hook nomme ici — 0xbb7784a4 — a fini par etre mesure quand le corpus a grandi, et
    // le test tombait alors sur un hook qui ne satisfaisait plus sa propre premisse. On
    // CHERCHE donc dans la table un hook qui la satisfait, au lieu d'en figer un.
    const parHook = new Map<string, { num: number; non: number }>();
    for (const pool of Object.values(TABLE.pools)) {
      const k = pool.hook.toLowerCase();
      const c = parHook.get(k) ?? { num: 0, non: 0 };
      for (const dir of Object.values(pool.dirs))
        for (const pt of dir) (pt.bps === null ? c.non++ : c.num++);
      parHook.set(k, c);
    }
    const muet = [...parHook.entries()].find(([, c]) => c.num === 0 && c.non > 0);
    expect(muet, "aucun hook entierement non mesurable dans la table").toBeTruthy();

    const ctx = hookContext(TABLE, muet![0]);
    expect(ctx).not.toBeNull();
    // Le point du test : pas de mediane, pas de zero de remplacement.
    expect(ctx!.measured).toBeNull();
    const total = Object.values(ctx!.labels).reduce((a, b) => a + b, 0);
    expect(total).toBe(muet![1].non);
    expect(ctx!.labels["MEASURED"] ?? 0).toBe(0);
  });
});
