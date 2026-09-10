/**
 * LES LECTURES ON-CHAIN.
 *
 * Trois lectures, et pour chacune la meme question : que rend-elle quand elle ECHOUE ?
 * C'est la seule question qui compte ici, parce que la reponse determine si l'utilisateur
 * signe une transaction qui revert. Un zero rendu a la place d'un echec de lecture produit
 * exactement ca.
 *
 * Un quatrieme controle, moins evident : l'URL du noeud porte une cle Alchemy sur ce projet.
 * Elle ne doit apparaitre dans AUCUNE raison rendue — une raison finit dans une reponse HTTP,
 * et une cle recopiee dans une reponse HTTP finit dans les journaux de quelqu'un d'autre.
 */
import { describe, it, expect } from "vitest";
import {
  ethCall,
  selecteur,
  lireAllowanceVersPermit2,
  lireAutorisationDuRouteur,
  coter,
  encoderCotation,
  SIG_ALLOWANCE_ERC20,
  SIG_ALLOWANCE_PERMIT2,
  SELECTEUR_QUOTE,
  V4_QUOTER_BASE,
  NOT_ENOUGH_LIQUIDITY,
} from "../src/lecture.js";
import { PERMIT2, UNIVERSAL_ROUTER_BASE } from "../src/permit2.js";

const RPC = "https://base-mainnet.g.alchemy.com/v2/SECRET_KEY_ABC123";
const TOKEN = "0x4200000000000000000000000000000000000006";
const MOI = "0x1111111111111111111111111111111111111111";

/** Un faux noeud : rend `result`, ou leve, et retient le corps envoye. */
function noeud(reponse: unknown | (() => never), statut = 200) {
  const vus: { body: unknown }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    vus.push({ body: JSON.parse(String(init.body)) });
    if (typeof reponse === "function") (reponse as () => never)();
    return new Response(JSON.stringify(reponse), {
      status: statut,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { n: { rpc: RPC, fetchImpl }, vus };
}

const mot = (v: bigint) => v.toString(16).padStart(64, "0");

/* -------------------------------------------------------- les selecteurs */

describe("les selecteurs sont CALCULES, pas recopies", () => {
  it("allowance(address,address) donne 0xdd62ed3e", () => {
    expect(selecteur(SIG_ALLOWANCE_ERC20)).toBe("0xdd62ed3e");
  });
  it("allowance(address,address,address) de Permit2 donne 0x927da105", () => {
    expect(selecteur(SIG_ALLOWANCE_PERMIT2)).toBe("0x927da105");
  });
});

/* ---------------------------------------------- 1. allowance ERC-20 -> Permit2 */

describe("allowance du jeton vers Permit2", () => {
  it("lit le montant et rend la commande de rejeu", async () => {
    const { n, vus } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(12345n) });
    const r = await lireAllowanceVersPermit2(n, { token: TOKEN, proprietaire: MOI, permit2: PERMIT2 });
    expect(r.montant).toBe(12345n);
    expect(r.raison).toBeNull();
    expect(r.rejeu).toContain(MOI);
    // l'appel porte le bon selecteur et les deux adresses, dans l'ordre
    const data = (vus[0]!.body as { params: [{ data: string }] }).params[0].data;
    expect(data.slice(0, 10)).toBe("0xdd62ed3e");
    expect(data.slice(10 + 24, 10 + 64)).toBe(MOI.slice(2));
    expect(data.slice(74 + 24)).toBe(PERMIT2.slice(2));
  });

  it("un zero LU est un zero, et il est rendu comme tel", async () => {
    const { n } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(0n) });
    const r = await lireAllowanceVersPermit2(n, { token: TOKEN, proprietaire: MOI, permit2: PERMIT2 });
    expect(r.montant).toBe(0n);
    expect(r.raison).toBeNull();
  });

  it("un noeud en panne rend null et une raison — jamais zero", async () => {
    const { n } = noeud({}, 503);
    const r = await lireAllowanceVersPermit2(n, { token: TOKEN, proprietaire: MOI, permit2: PERMIT2 });
    expect(r.montant).toBeNull();
    expect(r.raison).toMatch(/HTTP 503/);
  });

  it("un `0x` vide veut dire pas de contrat a cette adresse, et le dit", async () => {
    const { n } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" });
    const r = await lireAllowanceVersPermit2(n, { token: TOKEN, proprietaire: MOI, permit2: PERMIT2 });
    expect(r.montant).toBeNull();
    expect(r.raison).toMatch(/n'est pas deploye/);
  });
});

/* ------------------------------------- 2. allowance Permit2 -> Universal Router */

describe("autorisation du routeur chez Permit2", () => {
  it("lit les trois mots dans le bon ordre : montant, expiration, nonce", async () => {
    const { n } = noeud({
      jsonrpc: "2.0",
      id: 1,
      result: "0x" + mot(999n) + mot(1800000000n) + mot(7n),
    });
    const r = await lireAutorisationDuRouteur(n, {
      permit2: PERMIT2,
      proprietaire: MOI,
      token: TOKEN,
      spender: UNIVERSAL_ROUTER_BASE,
    });
    expect(r.autorisation).toEqual({ montant: 999n, expiration: 1800000000n, nonce: 7n });
    expect(r.raison).toBeNull();
  });

  it("un triplet a zero est une lecture VALIDE, pas une absence de lecture", async () => {
    const { n } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(0n) + mot(0n) + mot(0n) });
    const r = await lireAutorisationDuRouteur(n, {
      permit2: PERMIT2, proprietaire: MOI, token: TOKEN, spender: UNIVERSAL_ROUTER_BASE,
    });
    expect(r.autorisation).toEqual({ montant: 0n, expiration: 0n, nonce: 0n });
    expect(r.raison).toBeNull();
  });

  it("un retour tronque rend null, en disant combien de mots ont ete lus", async () => {
    const { n } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(1n) + mot(2n) });
    const r = await lireAutorisationDuRouteur(n, {
      permit2: PERMIT2, proprietaire: MOI, token: TOKEN, spender: UNIVERSAL_ROUTER_BASE,
    });
    expect(r.autorisation).toBeNull();
    expect(r.raison).toMatch(/2 mot\(s\) au lieu de 3/);
  });
});

/* -------------------------------------------------------- 3. la cotation vivante */

describe("la cotation vivante", () => {
  const key = {
    currency0: TOKEN,
    currency1: "0x2222222222222222222222222222222222222222",
    fee: 3000,
    tickSpacing: 60,
    hooks: "0x3333333333333333333333333333333333333333",
  };

  it("l'encodage porte le selecteur du quoteur et l'offset de hookData", () => {
    const d = encoderCotation(key, true, 1000n);
    expect(d.slice(0, 10)).toBe(SELECTEUR_QUOTE);
    // tete : offset 0x20 de la struct dynamique
    expect(d.slice(10, 74)).toBe(mot(0x20n));
    // le dernier mot est la longueur nulle de hookData, precede de son offset 0x100
    expect(d.endsWith(mot(0x100n) + mot(0n))).toBe(true);
  });

  it("rend la sortie cotee et le bloc interroge", async () => {
    const { n, vus } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(4242n) });
    const r = await coter(n, { poolKey: key, zeroForOne: true, amountIn: 1000n });
    expect(r.amountOut).toBe(4242n);
    expect(r.bloc).toBe("latest");
    expect(r.rejeu).toContain(V4_QUOTER_BASE);
    expect((vus[0]!.body as { params: [{ to: string }] }).params[0].to).toBe(V4_QUOTER_BASE);
  });

  it("un zero de cotation n'est pas une sortie nulle : c'est un pool qui ne cote pas", async () => {
    const { n } = noeud({ jsonrpc: "2.0", id: 1, result: "0x" + mot(0n) });
    const r = await coter(n, { poolKey: key, zeroForOne: true, amountIn: 1000n });
    expect(r.amountOut).toBeNull();
    expect(r.raison).toMatch(/ne cote pas cette taille/);
  });

  it("NOT_ENOUGH_LIQUIDITY est reconnu et nomme", async () => {
    const { n } = noeud({
      jsonrpc: "2.0",
      id: 1,
      error: { message: "execution reverted", data: "0x6190b2b0" + NOT_ENOUGH_LIQUIDITY },
    });
    const r = await coter(n, { poolKey: key, zeroForOne: true, amountIn: 1000n });
    expect(r.amountOut).toBeNull();
    expect(r.raison).toMatch(/NOT_ENOUGH_LIQUIDITY/);
  });
});

/* ------------------------------------------------------ la cle ne fuit pas */

describe("l'URL du noeud porte une cle : elle ne fuit dans aucune raison", () => {
  it("un fetch qui leve avec l'URL dans son message ne la recopie pas", async () => {
    const { n } = noeud(() => {
      throw Object.assign(new Error(`fetch failed for ${RPC}`), { name: "TypeError" });
    });
    const r = await ethCall(n, TOKEN, "0xdd62ed3e");
    expect(r.data).toBeNull();
    expect(r.raison).not.toContain("SECRET_KEY_ABC123");
    expect(r.raison).not.toContain("alchemy");
    expect(r.raison).toMatch(/lecture impossible/);
  });

  it("ni dans celle des trois lectures", async () => {
    const boom = () => {
      throw Object.assign(new Error(`connect ECONNREFUSED ${RPC}`), { name: "TypeError" });
    };
    for (const r of [
      (await lireAllowanceVersPermit2(noeud(boom).n, { token: TOKEN, proprietaire: MOI, permit2: PERMIT2 })).raison,
      (await lireAutorisationDuRouteur(noeud(boom).n, { permit2: PERMIT2, proprietaire: MOI, token: TOKEN, spender: UNIVERSAL_ROUTER_BASE })).raison,
      (await coter(noeud(boom).n, { poolKey: { currency0: TOKEN, currency1: TOKEN, fee: 0, tickSpacing: 1, hooks: TOKEN }, zeroForOne: true, amountIn: 1n })).raison,
    ]) {
      expect(r).not.toBeNull();
      expect(r!).not.toContain("SECRET_KEY_ABC123");
    }
  });
});
