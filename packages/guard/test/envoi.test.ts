/**
 * LA TRANSACTION ENVOYABLE.
 *
 * C'est le seul module du projet dont la sortie peut atteindre un portefeuille et depenser de
 * l'argent. Les tests sont donc ecrits a l'envers de l'habitude : ils verifient d'abord tout
 * ce que le module doit REFUSER, et seulement ensuite ce qu'il rend.
 *
 * Les quatre refus qui comptent, chacun correspondant a une facon de perdre de l'argent :
 *   - sans plancher de sortie -> la transaction est signable a n'importe quel prix ;
 *   - en ETH natif avec un permit -> revert, gaz perdu ;
 *   - en ERC-20 sans lecture -> soit une approbation de trop, soit un permit rejete ;
 *   - nonce Permit2 non lu -> permit rejete a l'envoi, gaz perdu.
 */
import { describe, it, expect } from "vitest";
import { assertTable, type GuardTable, type TablePool } from "../src/table.js";
import { chercherAlternative } from "../src/alternative.js";
import { transactionDeRemplacement, plancher, TOLERANCE_BPS, ECHEANCE_SECONDES } from "../src/envoi.js";
import { decodeUniversalRouterCalldata } from "../src/calldata.js";
import { MONTANT_MAX_PERMIT2, UNIVERSAL_ROUTER_BASE } from "../src/permit2.js";
import { ZERO_ADDRESS } from "../src/poolkey.js";

const WETH = "0x4200000000000000000000000000000000000006";
const JETON = "0x1111111111111111111111111111111111111111";
const MAINTENANT = 1789000000n; // fixe : un test qui lit l'horloge n'est pas reproductible

function pool(over: Partial<TablePool> & { dirs: TablePool["dirs"] }): TablePool {
  return {
    hook: "0xaaaa000000000000000000000000000000000001",
    currency0: WETH,
    currency1: JETON,
    fee: 3000,
    tick_spacing: 60,
    fee_is_dynamic: false,
    stored_lp_fee: 3000,
    ...over,
  };
}

const pt = (amount_in: string, bps: number | null, label = "MEASURED") => ({
  amount_in,
  bps,
  label: label as never,
  reason: null,
  block_number: 50614000,
  chain_id: 8453,
});

function table(pools: Record<string, TablePool>): GuardTable {
  return assertTable({
    schema: "tare-guard-table/1",
    generated_at: "2026-09-10T00:00:00Z",
    source: "test",
    engine_ver: "tare-engine/0.3.0",
    stub_hash: "0x8e39b2ad",
    chain_id: 8453,
    block_number: 50614000,
    blocks: [50614000],
    n_measurements: 0,
    n_hooks: 1,
    n_pools: Object.keys(pools).length,
    hooks: {},
    pools,
  });
}

/** Deux portes du meme jeton : la seconde est mesuree 300 bps moins chere a la meme taille. */
function deuxPortes(c0 = WETH, c1 = JETON) {
  return table({
    "0xp1": pool({ currency0: c0, currency1: c1, dirs: { "0->1": [pt("1000000000000000", 300)] } }),
    "0xp2": pool({
      hook: "0xbbbb000000000000000000000000000000000002",
      currency0: c0,
      currency1: c1,
      fee: 500,
      tick_spacing: 10,
      dirs: { "0->1": [pt("1000000000000000", 0.5)] },
    }),
  });
}

const alt = (t = deuxPortes()) => chercherAlternative(t, "0xp1", "0->1", "1000000000000000")!;

const PERMIT_OK = {
  permit: {
    details: {
      token: WETH,
      amount: MONTANT_MAX_PERMIT2,
      expiration: MAINTENANT + 2592000n,
      nonce: 7n,
    },
    spender: UNIVERSAL_ROUTER_BASE,
    sigDeadline: MAINTENANT + 1800n,
  },
  signature: "0x" + "ab".repeat(65),
};

/* ---------------------------------------------------------------- les refus */

describe("sans plancher de sortie, il n'y a pas de transaction", () => {
  it("une cotation nulle rend SANS_PLANCHER et nomme le bloc epingle", () => {
    const e = transactionDeRemplacement(alt(), { cotation: null, maintenant: MAINTENANT });
    expect(e.etat).toBe("SANS_PLANCHER");
    expect(e.transaction).toBeNull();
    expect(e.raison).toMatch(/epingle au bloc 50614000/);
    expect(e.raison).toMatch(/signable a n'importe quel prix/);
  });

  it("une cotation si petite que le plancher tombe a zero est refusee aussi", () => {
    const e = transactionDeRemplacement(alt(), {
      cotation: 1n,
      maintenant: MAINTENANT,
      toleranceBps: 5000,
    });
    expect(e.etat).toBe("SANS_PLANCHER");
    expect(e.raison).toMatch(/tombe a zero/);
  });
});

describe("la monnaie d'entree decide de la branche, et se tromper coute le gaz", () => {
  it("ETH natif : value porte le montant, aucune commande de permit", () => {
    // currency0 nul => l'entree du sens 0->1 est l'ETH natif.
    const e = transactionDeRemplacement(alt(deuxPortes(ZERO_ADDRESS, JETON)), {
      cotation: 2000000000000000000n,
      maintenant: MAINTENANT,
    });
    expect(e.etat).toBe("PRET");
    expect(e.native).toBe(true);
    expect(e.monnaieEntree).toBe(ZERO_ADDRESS);
    expect(e.transaction!.value).toBe("0x" + (1000000000000000n).toString(16));
    expect(e.commandes).toBe("0x10");
  });

  it("ETH natif AVEC un permit : refuse, au lieu de le retirer en silence", () => {
    const e = transactionDeRemplacement(alt(deuxPortes(ZERO_ADDRESS, JETON)), {
      cotation: 2000000000000000000n,
      maintenant: MAINTENANT,
      permit: PERMIT_OK,
    });
    expect(e.etat).toBe("PERMIT_SUR_MONNAIE_NATIVE");
    expect(e.transaction).toBeNull();
    expect(e.raison).toMatch(/ne gere que les ERC-20/);
  });

  it("ERC-20 sans permit ni lecture : ETAT_PERMIT2_INCONNU, jamais un defaut favorable", () => {
    const e = transactionDeRemplacement(alt(), { cotation: 10n ** 20n, maintenant: MAINTENANT });
    expect(e.etat).toBe("ETAT_PERMIT2_INCONNU");
    expect(e.transaction).toBeNull();
    expect(e.native).toBe(false);
    expect(e.raison).toMatch(/on ne les suppose pas/);
  });
});

describe("les deux lectures on-chain, et ce qu'un null y signifie", () => {
  const opts = { cotation: 10n ** 20n, maintenant: MAINTENANT };

  it("allowance non lue -> APPROBATION_REQUISE, avec la transaction d'approbation", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      etatPermit2: { allowanceVersPermit2: null, autorisationDuRouteur: null },
    });
    expect(e.etat).toBe("APPROBATION_REQUISE");
    expect(e.permit2!.approbation!.to).toBe(WETH);
    expect(e.permit2!.approbation!.data.slice(0, 10)).toBe("0x095ea7b3");
  });

  it("allowance insuffisante -> APPROBATION_REQUISE", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      etatPermit2: {
        allowanceVersPermit2: 1n,
        autorisationDuRouteur: { montant: 0n, expiration: 0n, nonce: 0n },
      },
    });
    expect(e.etat).toBe("APPROBATION_REQUISE");
  });

  it("autorisation du routeur NON LUE -> NONCE_NON_LU, pas un nonce a zero", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      etatPermit2: { allowanceVersPermit2: MONTANT_MAX_PERMIT2, autorisationDuRouteur: null },
    });
    expect(e.etat).toBe("NONCE_NON_LU");
    expect(e.transaction).toBeNull();
    expect(e.permit2!.aSigner).toBeNull();
    expect(e.raison).toMatch(/rejette un permit au mauvais nonce/);
  });

  it("triplet a zero LU -> SIGNATURE_REQUISE, et le nonce du message est celui lu", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      etatPermit2: {
        allowanceVersPermit2: MONTANT_MAX_PERMIT2,
        autorisationDuRouteur: { montant: 0n, expiration: 0n, nonce: 42n },
      },
    });
    expect(e.etat).toBe("SIGNATURE_REQUISE");
    expect(e.permit2!.aSigner!.message.details.nonce).toBe("42");
    expect(e.permit2!.aSigner!.message.spender.toLowerCase()).toBe(UNIVERSAL_ROUTER_BASE);
    // pas de champ `version` dans le domaine de Permit2
    expect(Object.keys(e.permit2!.aSigner!.domain)).toEqual(["name", "chainId", "verifyingContract"]);
  });

  it("routeur deja autorise -> PRET sans commande 0x0a", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      etatPermit2: {
        allowanceVersPermit2: MONTANT_MAX_PERMIT2,
        autorisationDuRouteur: {
          montant: MONTANT_MAX_PERMIT2,
          expiration: MAINTENANT + 86400n,
          nonce: 3n,
        },
      },
    });
    expect(e.etat).toBe("PRET");
    expect(e.commandes).toBe("0x10");
    expect(e.transaction!.value).toBe("0x0");
  });
});

describe("un permit fourni est verifie, pas encode les yeux fermes", () => {
  const opts = { cotation: 10n ** 20n, maintenant: MAINTENANT };

  it("un permit sur le mauvais jeton est refuse", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      permit: { ...PERMIT_OK, permit: { ...PERMIT_OK.permit, details: { ...PERMIT_OK.permit.details, token: JETON } } },
    });
    expect(e.etat).toBe("ETAT_PERMIT2_INCONNU");
    expect(e.raison).toMatch(/n'autoriserait rien du bon cote/);
  });

  it("un permit qui ne couvre pas le montant est refuse", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      permit: { ...PERMIT_OK, permit: { ...PERMIT_OK.permit, details: { ...PERMIT_OK.permit.details, amount: 1n } } },
    });
    expect(e.etat).toBe("ETAT_PERMIT2_INCONNU");
    expect(e.raison).toMatch(/ne couvre pas le montant/);
  });

  it("une signature expiree renvoie a la signature, pas a la chaine", () => {
    const e = transactionDeRemplacement(alt(), {
      ...opts,
      permit: { ...PERMIT_OK, permit: { ...PERMIT_OK.permit, sigDeadline: MAINTENANT - 1n } },
    });
    expect(e.etat).toBe("SIGNATURE_REQUISE");
    expect(e.raison).toMatch(/a expire/);
  });

  it("un permit valide donne la liste de commandes 0x0a10 : le permit AVANT le swap", () => {
    const e = transactionDeRemplacement(alt(), { ...opts, permit: PERMIT_OK });
    expect(e.etat).toBe("PRET");
    expect(e.commandes).toBe("0x0a10");
    const relu = decodeUniversalRouterCalldata(e.transaction!.data);
    expect(relu.commands).toBe("0x0a10");
    expect(relu.issues).toEqual([]);
    expect(relu.legs).toHaveLength(1);
  });
});

/* ------------------------------------------------------- ce qu'il rend, quand il rend */

describe("la transaction rendue est complete et relisible", () => {
  const pret = () =>
    transactionDeRemplacement(alt(), {
      cotation: 10n ** 20n,
      maintenant: MAINTENANT,
      permit: PERMIT_OK,
    });

  it("to est le routeur, et la porte relue est bien la porte proposee", () => {
    const e = pret();
    expect(e.transaction!.to).toBe(UNIVERSAL_ROUTER_BASE);
    const j = decodeUniversalRouterCalldata(e.transaction!.data).legs[0]!;
    // la porte 0xp2 : hook bbbb, fee 500, tickSpacing 10 — pas ceux de la porte d'origine
    expect(j.poolKey.hooks).toBe("0xbbbb000000000000000000000000000000000002");
    expect(j.poolKey.fee).toBe(500);
    expect(j.poolKey.tickSpacing).toBe(10);
    expect(j.amountIn).toBe("1000000000000000");
  });

  it("le plancher est la cotation moins la tolerance, arrondi vers le BAS", () => {
    const e = pret();
    expect(e.toleranceBps).toBe(TOLERANCE_BPS);
    expect(e.cotation).toBe((10n ** 20n).toString());
    expect(e.amountOutMinimum).toBe(plancher(10n ** 20n, TOLERANCE_BPS).toString());
    // 0,5 % de moins, pas un centieme de plus
    expect(BigInt(e.amountOutMinimum!)).toBe((10n ** 20n * 9950n) / 10000n);
  });

  it("le plancher arrondit vers le bas, jamais vers le haut", () => {
    // 10001 * 9950 / 10000 = 9950,995 -> 9950 et pas 9951
    expect(plancher(10001n, 50)).toBe(9950n);
    expect(() => plancher(1000n, 10000)).toThrow(/hors bornes/);
    expect(() => plancher(1000n, -1)).toThrow(/hors bornes/);
  });

  it("l'echeance est reelle : maintenant + 20 minutes, pas l'an 2106", () => {
    const e = pret();
    expect(e.deadline).toBe((MAINTENANT + ECHEANCE_SECONDES).toString());
    expect(BigInt(e.deadline!)).toBeLessThan(2000000000n); // l'an 2033, tres loin de 0xffffffff
  });
});

describe("le plancher voyage dans les DEUX endroits qui le verifient", () => {
  it("amountOutMinimum du swap et minAmount de TAKE_ALL portent la meme valeur", () => {
    const e = transactionDeRemplacement(alt(), {
      cotation: 10n ** 20n,
      maintenant: MAINTENANT,
      permit: PERMIT_OK,
    });
    const attendu = BigInt(e.amountOutMinimum!).toString(16).padStart(64, "0");
    const data = e.transaction!.data.toLowerCase();
    // il doit apparaitre deux fois : une dans ExactInputSingleParams, une dans TAKE_ALL
    const occurrences = data.split(attendu).length - 1;
    expect(occurrences).toBe(2);
  });
});

describe("sans proposition, il n'y a rien a construire", () => {
  it("PORTE_UNIQUE ne devient pas une transaction, et la raison est reprise", () => {
    const t = table({ "0xp1": pool({ dirs: { "0->1": [pt("1000", 100)] } }) });
    const a = chercherAlternative(t, "0xp1", "0->1", "1000")!;
    const e = transactionDeRemplacement(a, { cotation: 10n ** 20n, maintenant: MAINTENANT });
    expect(e.etat).toBe("PAS_DE_PROPOSITION");
    expect(e.transaction).toBeNull();
    expect(e.raison).toMatch(/PORTE_UNIQUE/);
    expect(e.raison).toMatch(/aucun autre pool du corpus n'echange/);
  });

  it("POOL_INCONNU non plus", () => {
    const t = table({ "0xp1": pool({ dirs: { "0->1": [pt("1000", 100)] } }) });
    const a = chercherAlternative(t, "0xabsent", "0->1", "1000")!;
    const e = transactionDeRemplacement(a, { cotation: 10n ** 20n, maintenant: MAINTENANT });
    expect(e.etat).toBe("PAS_DE_PROPOSITION");
    expect(e.raison).toMatch(/POOL_INCONNU/);
  });
});
