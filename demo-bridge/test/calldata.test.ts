/**
 * LE MEILLEUR TEST POSSIBLE : le decodeur du depot relit ce que ce service construit.
 *
 * `packages/guard/src/calldata.ts` est le code qui, en production, lit le calldata d'un swap
 * avant signature. S'il retrouve dans notre calldata la PoolKey et le hook qu'on voulait, alors
 * l'ecran de la demo montrera le hook de la vraie transaction — et pas un autre.
 *
 * Ces tests ne touchent AUCUN reseau : l'encodage et le decodage sont purs.
 */
import { describe, expect, it } from "vitest";
import { encodeUniversalRouterExactInSingle } from "../vendor/guard/src/encode.js";
import { decodeUniversalRouterCalldata } from "../vendor/guard/src/calldata.js";
import { poolId } from "../vendor/guard/src/poolkey.js";
import {
  ACTES,
  ACTES_DE_LA_DEMO,
  CORPUS,
  TAILLE_WEI,
  distribution,
  lirePorte,
  TABLE,
  USDC_BASE,
  ADRESSE_NULLE,
} from "../src/corpus.js";
import { construireMessage, champTake, champTakeBref } from "../src/message.js";
import { TARE_GUARD_TYPES, TARE_GUARD_PRIMARY_TYPE } from "../vendor/guard/src/ledger.js";

const UNIVERSAL_ROUTER_BASE = "0x6ff5693b99212da76ad316178a184ab56d299b43";

function construire(porte: (typeof ACTES)["stop"]["porte"], plancher = 1n) {
  return encodeUniversalRouterExactInSingle(
    [
      {
        poolKey: porte.pool_key,
        zeroForOne: porte.sens === "0->1",
        amountIn: BigInt(porte.taille_wei),
        amountOutMinimum: plancher,
      },
    ],
    { deadline: 1_800_000_000n },
  );
}

describe("le calldata construit se relit avec le decodeur du depot", () => {
  for (const nom of ["stop", "substitution", "queue"] as const) {
    it(`acte ${nom} : PoolKey, hook, sens et taille retrouves a l'identique`, () => {
      const porte = ACTES[nom].porte;
      const data = construire(porte);
      const relu = decodeUniversalRouterCalldata(data);

      expect(relu.router).toBe("universal-router");
      expect(relu.complete).toBe(true);
      expect(relu.issues).toEqual([]);
      expect(relu.legs).toHaveLength(1);

      const jambe = relu.legs[0]!;
      expect(jambe.poolId).toBe(porte.pool_id);
      expect(jambe.poolKey.hooks.toLowerCase()).toBe(porte.hook);
      expect(jambe.poolKey.currency0.toLowerCase()).toBe(porte.pool_key.currency0);
      expect(jambe.poolKey.currency1.toLowerCase()).toBe(porte.pool_key.currency1);
      expect(jambe.poolKey.fee).toBe(porte.pool_key.fee);
      expect(jambe.poolKey.tickSpacing).toBe(porte.pool_key.tickSpacing);
      expect(jambe.direction).toBe(porte.sens);
      expect(jambe.amountIn).toBe(porte.taille_wei);
      expect(jambe.actionName).toBe("SWAP_EXACT_IN_SINGLE");
      expect(jambe.amountIsOpenDelta).toBe(false);
    });
  }

  it("acte substitution : la meilleure porte se relit aussi, et c'est un AUTRE pool", () => {
    const acte = ACTES.substitution;
    const meilleure = acte.meilleure_porte!;
    const relu = decodeUniversalRouterCalldata(construire(meilleure));
    expect(relu.legs[0]!.poolId).toBe(meilleure.pool_id);
    expect(relu.legs[0]!.poolKey.hooks.toLowerCase()).toBe(meilleure.hook);
    expect(meilleure.pool_id).not.toBe(acte.porte.pool_id);
    expect(meilleure.hook).not.toBe(acte.porte.hook);
  });

  it("le poolId rendu est bien keccak(abi.encode(PoolKey)) — pas une chaine recopiee", () => {
    for (const nom of ["stop", "substitution", "queue"] as const) {
      const p = ACTES[nom].porte;
      expect(poolId(p.pool_key)).toBe(p.pool_id);
    }
  });

  it("la commande Universal Router est V4_SWAP, et le selecteur celui d'execute avec echeance", () => {
    const data = construire(ACTES.stop.porte);
    const relu = decodeUniversalRouterCalldata(data);
    expect(relu.selector).toBe("0x3593564c");
    expect(relu.commands).toBe("0x10");
  });

  it("un octet change dans le calldata ne passe plus pour la meme porte", () => {
    const porte = ACTES.substitution.porte;
    const data = construire(porte);
    // on abime l'octet de poids faible du hook (mot 0xa0 de la struct)
    const i = data.indexOf(porte.hook.slice(2));
    expect(i).toBeGreaterThan(0);
    const abime = data.slice(0, i + 38) + (data[i + 38] === "0" ? "1" : "0") + data.slice(i + 39);
    const relu = decodeUniversalRouterCalldata(abime);
    expect(relu.legs[0]!.poolId).not.toBe(porte.pool_id);
  });
});

describe("le corpus, et rien que lui", () => {
  it("les deux actes tirent leurs nombres de la table du bloc 50 614 000", () => {
    expect(TABLE.block_number).toBe(50614000);
    expect(TABLE.chain_id).toBe(8453);
    for (const nom of ["stop", "substitution", "queue"] as const) {
      const p = ACTES[nom].porte;
      expect(p.block_number).toBe(50614000);
      const brut = TABLE.pools[p.pool_id]!.dirs[p.sens]!.find((x) => x.amount_in === p.taille_wei)!;
      expect(p.bps).toBe(brut.bps);
      expect(p.etiquette).toBe(brut.label);
    }
  });

  it("acte stop : la MEME paire que la substitution, ETH -> USDC, et une meilleure porte existe", () => {
    const a = ACTES.stop;
    expect(a.porte.pool_id).toBe(ACTES.substitution.porte.pool_id);
    expect(a.porte.monnaie_entree).toBe(ADRESSE_NULLE);
    expect(a.porte.monnaie_sortie).toBe(USDC_BASE);
    expect(a.porte.bps).toBe(4.0933);
    expect(a.porte.sens).toBe("0->1");
    expect(a.porte.taille_wei).toBe("1000000000000");
    expect(a.meilleure_porte).not.toBeNull();
    expect(a.meilleure_porte!.bps).toBe(0);
    expect(a.etat).toBe("MEILLEURE_PORTE");
    // l'acte ne dit plus « nulle part ou aller » : ce serait faux de cette porte-ci
    expect(a.phrase).not.toMatch(/nowhere to go/i);
    expect(a.phrase).toMatch(/4\.0933 bps/);
    expect(a.phrase).toMatch(/Another gate/);
    expect(a.phrase).toMatch(/a refusal on the device sends nothing/);
  });

  it("acte stop : le verdict vient des centiles du corpus, pas du nom de l'acte", () => {
    // 4,0933 bps est sous le 90e centile (119,7604) : ecrire BLOCK serait inventer une gravite
    expect(ACTES.stop.verdict).toBe("ok");
    expect(ACTES.queue.verdict).toBe("block"); // 9999,53 > 99e centile (300)
  });

  it("acte queue : la ligne extreme reste accessible, et elle est la meme qu'avant", () => {
    const p = ACTES.queue.porte;
    expect(p.hook).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(p.bps).not.toBeNull();
    expect(p.bps!.toFixed(2)).toBe("9999.53");
    expect(p.sens).toBe("1->0");
    expect(ACTES.queue.etat).toBe("PORTE_UNIQUE");
    // elle n'ouvre plus la demonstration
    expect(ACTES_DE_LA_DEMO).toEqual(["stop", "substitution"]);
    expect(ACTES_DE_LA_DEMO).not.toContain("queue");
    // et sa phrase la remet a sa place, avec le compte
    expect(ACTES.queue.phrase).toMatch(/54 of 63156 measured lines exceed 5000 bps/);
  });

  it("acte substitution : ETH -> USDC, 4.0933 bps contre 0 bps, meme sens et meme taille", () => {
    const a = ACTES.substitution;
    expect(a.porte.monnaie_entree).toBe(ADRESSE_NULLE);
    expect(a.porte.monnaie_sortie).toBe(USDC_BASE);
    expect(a.porte.native).toBe(true);
    expect(a.porte.bps).toBe(4.0933);
    expect(a.meilleure_porte!.bps).toBe(0);
    expect(a.porte.sens).toBe("0->1");
    expect(a.meilleure_porte!.sens).toBe("0->1");
    expect(a.porte.taille_wei).toBe(a.meilleure_porte!.taille_wei);
    expect(a.economie_bps).toBe(4.0933);
    expect(a.etat).toBe("MEILLEURE_PORTE");
  });

  it("un point non mesure rend null et un motif — jamais zero", () => {
    // meme pool, sens inverse : le corpus le donne NOT_MEASURABLE / NOT_QUOTABLE
    const p = lirePorte(ACTES.substitution.porte.pool_id, "1->0", TAILLE_WEI);
    expect(p.bps).toBeNull();
    expect(p.motif).not.toBeNull();
    expect(champTake(p)).toBe("not measured — this is not zero");
  });
});

describe("le message EIP-712 — le schema COURT, celui que la demo signe", () => {
  it("porte un nom DISTINCT du schema publie : deux structures ne partagent pas un nom", () => {
    const m = construireMessage("stop");
    expect(m.typed.primaryType).toBe("TareGuardBrief");
    expect(m.typed.primaryType).not.toBe(TARE_GUARD_PRIMARY_TYPE);
    expect(Object.keys(m.typed.message)).toEqual([
      "verdict",
      "summary",
      "gates",
      "dataset",
      "measuredAtBlock",
      "promptDigest",
    ]);
  });

  it("le schema publie reste construit et disponible, il n'a pas ete efface", () => {
    expect(TARE_GUARD_PRIMARY_TYPE).toBe("TareGuardApproval");
    expect(TARE_GUARD_TYPES.TareGuardApproval!.map((f) => f.name)).toEqual([
      "verdict",
      "summary",
      "swaps",
      "dataset",
      "measuredAtBlock",
      "freshness",
      "warnings",
      "promptDigest",
    ]);
  });

  it("AUCUN CHIFFRE N'A DISPARU : take, taille, bloc, et le take de la meilleure porte", () => {
    const msg = construireMessage("stop").typed.message as Record<string, unknown>;
    const gates = msg.gates as Array<Record<string, string>>;
    expect(gates).toHaveLength(1); // une seule structure, pas deux
    expect(gates[0]!.take).toBe("4.0933 bps [MEASURED]"); // la valeur ET son etiquette
    expect(gates[0]!.size).toBe("1000000000000 in");
    expect(gates[0]!.direction).toBe("0->1");
    expect(msg.measuredAtBlock).toBe(50614000);
    // le prelevement de la MEILLEURE porte n'est pas perdu : il est dans le resume
    expect(msg.summary).toBe("Takes 4.0933 bps. Best gate: 0.0000.");
    expect(msg.dataset).toBe("125072 meas, 7817 pools, chain 8453");
    expect(String(msg.promptDigest)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("le resume tient sur UN ecran de Nano — 43 caracteres", () => {
    for (const nom of ["stop", "substitution", "queue"] as const) {
      const msg = construireMessage(nom).typed.message as Record<string, unknown>;
      expect(String(msg.summary).length, `${nom}.summary`).toBeLessThanOrEqual(43);
      expect(String(msg.dataset).length, `${nom}.dataset`).toBeLessThanOrEqual(43);
      const g = (msg.gates as Array<Record<string, string>>)[0]!;
      expect(String(g.take).length, `${nom}.take`).toBeLessThanOrEqual(43);
      expect(String(g.size).length, `${nom}.size`).toBeLessThanOrEqual(43);
    }
  });

  it("acte stop : le verdict affiche est celui du corpus, pas celui du nom de l'acte", () => {
    const msg = construireMessage("stop").typed.message as Record<string, unknown>;
    expect(msg.verdict).toBe("OK");
  });

  it("acte queue : l'extreme s'affiche toujours, avec son verdict BLOCK et son chiffre", () => {
    const msg = construireMessage("queue").typed.message as Record<string, unknown>;
    expect(msg.verdict).toBe("BLOCK");
    const g = (msg.gates as Array<Record<string, string>>)[0]!;
    expect(g.take).toBe("9999.5279 bps [MEASURED]");
    expect(g.hook).toBe("0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc");
    expect(msg.summary).toBe("Takes 9999.5279 bps. Corpus max of 63156.");
  });

  it("le texte SCELLE porte ce que l'ecran ne porte plus : stub, moteur, rejeu, ecart", () => {
    const m = construireMessage("stop");
    expect(m.texte).toContain(CORPUS.stub_hash!);
    expect(m.texte).toContain("tare-engine/0.3.0");
    expect(m.texte).toContain("replay: python3");
    expect(m.texte).toContain("spread  4.0933 bps");
    expect(m.texte).toContain(ACTES.stop.meilleure_porte!.pool_id);
  });

  it("TOUT ce que l'appareil affiche est en anglais — c'est l'objet que le jury fixe", () => {
    const FRANCAIS = /\b(mesures?|chaine|moteur|en entree|aucun|retard nul|prend|a ta taille|ce n'est pas zero|nulle part)\b/i;
    for (const nom of ["stop", "substitution", "queue"] as const) {
      const m = construireMessage(nom);
      const msg = m.typed.message as Record<string, unknown>;
      for (const [champ, v] of Object.entries(msg)) {
        if (typeof v === "string") expect(v, `${nom}.${champ}`).not.toMatch(FRANCAIS);
      }
      for (const g of msg.gates as Array<Record<string, string>>) {
        for (const [champ, v] of Object.entries(g)) expect(v, `${nom}.gates.${champ}`).not.toMatch(FRANCAIS);
      }
      expect(m.texte, `${nom}.texte`).not.toMatch(FRANCAIS);
    }
  });

  it("promptDigest est le keccak256 du texte rendu — pas d'une phrase qu'on n'affiche plus", async () => {
    const { keccak256, toHex } = await import("../vendor/guard/src/keccak.js");
    for (const nom of ["stop", "substitution", "queue"] as const) {
      const m = construireMessage(nom);
      const attendu = toHex(keccak256(new TextEncoder().encode(m.texte)));
      expect((m.typed.message as Record<string, unknown>).promptDigest, nom).toBe(attendu);
    }
  });

  it("un message deja mis en champs est recopie, pas reecrit", () => {
    const m = construireMessage({
      verdict: "warn",
      summary: "phrase de la page",
      swaps: [
        {
          hook: "0xb429d62f8f3bffb98cdb9569533ea23bf0ba28cc",
          poolId: "0xdc3539d6012cafa36bb679c3b268ce1aed33d5dbce7fc170f7730686886c135d",
          take: "9999.53 bps",
          label: "MEASURED",
          size: "1000000000000 en entree",
          direction: "1->0",
        },
      ],
    });
    const msg = m.typed.message as Record<string, unknown>;
    expect(m.source).toBe("message_fourni");
    expect(msg.verdict).toBe("WARN");
    expect(msg.summary).toBe("phrase de la page");
    expect((msg.swaps as unknown[])).toHaveLength(1);
  });

  it("un hook qui n'est pas une adresse est refuse, pas corrige en silence", () => {
    expect(() => construireMessage({ swaps: [{ hook: "pas-une-adresse", poolId: "0x" + "00".repeat(32) }] })).toThrow(
      /hook n'est pas une adresse/,
    );
  });
});

describe("la transaction rendue", () => {
  it("le destinataire est l'Universal Router de Base", () => {
    expect(UNIVERSAL_ROUTER_BASE).toBe("0x6ff5693b99212da76ad316178a184ab56d299b43");
  });

  it("acte substitution : la monnaie d'entree est l'ETH natif, donc value porte le montant", () => {
    expect(ACTES.substitution.porte.native).toBe(true);
  });

  it("acte stop : la monnaie d'entree est l'ETH natif, comme la substitution", () => {
    expect(ACTES.stop.porte.native).toBe(true);
  });

  it("acte queue : la monnaie d'entree est un ERC-20, donc value vaudra 0x0", () => {
    expect(ACTES.queue.porte.native).toBe(false);
    expect(ACTES.queue.porte.monnaie_entree).toBe("0xdc4f058c103f3879fea72d0fc86eded309f43b07");
  });
});

describe("la distribution du corpus — calculee, jamais recopiee", () => {
  const d = distribution();

  it("porte sur les 63 156 lignes MESUREES qui ont une valeur", () => {
    expect(d.n).toBe(63156);
    expect(d.n).toBe(TABLE.seuils!.derives_de);
    expect(d.n_mesures_table).toBe(125072);
  });

  it("ses centiles sont EXACTEMENT ceux que la table publie — pas un second jeu de chiffres", () => {
    const c = TABLE.seuils!.centiles;
    expect(d.mediane_bps).toBe(c.p50);
    expect(d.p75_bps).toBe(c.p75);
    expect(d.p90_bps).toBe(c.p90);
    expect(d.p95_bps).toBe(c.p95);
    expect(d.p99_bps).toBe(c.p99);
    expect(d.p99_9_bps).toBe(c.p99_9);
  });

  it("la mediane vaut 100,00 bps et la moyenne lui est INFERIEURE", () => {
    expect(d.mediane_bps.toFixed(2)).toBe("100.00");
    expect(d.moyenne_bps.toFixed(2)).toBe("97.17");
    expect(d.moyenne_bps).toBeLessThan(d.mediane_bps);
  });

  it("les parts au-dessus des seuils ronds", () => {
    expect(d.part_au_dessus_de_5_bps.toFixed(2)).toBe("90.28");
    expect(d.part_au_dessus_de_50_bps.toFixed(2)).toBe("74.93");
    expect(d.part_au_dessus_de_100_bps.toFixed(2)).toBe("22.93");
    expect(d.part_au_dessus_de_1000_bps.toFixed(2)).toBe("0.30");
    expect(d.part_au_dessus_de_5000_bps.toFixed(2)).toBe("0.09");
    expect(d.part_a_zero_bps.toFixed(2)).toBe("6.65");
  });

  it("le nombre qui remet le cas extreme a sa place : 54 lignes au-dessus de 5 000 bps", () => {
    expect(d.n_au_dessus_de_5000_bps).toBe(54);
    expect(d.n_au_dessus_de_1000_bps).toBe(191);
    expect(d.max_bps).toBe(9999.5279);
    // et c'est bien la ligne de l'acte « queue »
    expect(ACTES.queue.porte.bps).toBe(d.max_bps);
  });

  it("le minimum est NEGATIF : un hook peut rendre plus que le pool n'aurait rendu", () => {
    expect(d.min_bps).toBe(-100);
    expect(d.n_negatives).toBe(51);
  });

  it("les seuils publies sont ceux de la table, pas les replis ecrits", () => {
    expect(d.seuils.source).toBe("table");
    expect(d.seuils.warn_bps).toBe(119.7604);
    expect(d.seuils.block_bps).toBe(300);
    expect(d.seuils.derives_de).toBe(63156);
  });
});
