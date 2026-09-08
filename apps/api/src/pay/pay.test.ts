/**
 * Le client x402 et l'en-tete de paiement.
 *
 * Le premier reglement reel a montre que le serveur lisait le MAUVAIS en-tete : x402 v2
 * envoie `PAYMENT-SIGNATURE`, seul v1 utilisait `X-PAYMENT`. Le peage fonctionnait quand
 * meme — c'est la bibliotheque qui verifie — mais tout le reste du service voyait la
 * requete comme non payee : le journal l'attribuait a "(non paye)", et le lot partait sur
 * HCS sans payeur ni hash de reglement. Ces tests fixent le contrat.
 */
import { describe, it, expect } from "vitest";
import { paymentHeaderOf, payerFromHeader, priceFor } from "../x402.js";
import { toMirrorTxId, parseKey } from "./client.js";

describe("l'en-tete de paiement, sous ses deux noms", () => {
  it("lit PAYMENT-SIGNATURE (x402 v2)", () => {
    const h = new Map([["payment-signature", "abc"]]);
    expect(paymentHeaderOf((n) => h.get(n.toLowerCase()))).toBe("abc");
  });

  it("lit encore X-PAYMENT (x402 v1)", () => {
    const h = new Map([["x-payment", "def"]]);
    expect(paymentHeaderOf((n) => h.get(n.toLowerCase()))).toBe("def");
  });

  it("prefere v2 quand les deux sont la", () => {
    const h = new Map([
      ["payment-signature", "v2"],
      ["x-payment", "v1"],
    ]);
    expect(paymentHeaderOf((n) => h.get(n.toLowerCase()))).toBe("v2");
  });

  it("rend undefined quand il n'y a pas de paiement — jamais une chaine vide", () => {
    expect(paymentHeaderOf(() => undefined)).toBeUndefined();
  });
});

describe("ce que l'en-tete laisse voir", () => {
  it("un payload Hedera ne donne PAS le payeur : il est dans la transaction signee", () => {
    const payload = {
      x402Version: 2,
      scheme: "exact",
      network: "hedera:testnet",
      payload: { transaction: "CgoKBAiA..." },
    };
    const header = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    const who = payerFromHeader(header);
    expect(who.payer).toBeNull(); // null est la bonne reponse ; deviner serait la mauvaise
    expect(who.network).toBe("hedera:testnet");
    expect(who.scheme).toBe("exact");
  });

  it("un en-tete illisible ne jette pas et n'invente rien", () => {
    expect(payerFromHeader("pas du base64 json")).toEqual({
      payer: null,
      network: null,
      scheme: null,
    });
  });
});

describe("le prix suit le plan, pas la requete", () => {
  it("une mesure vaut le prix unitaire", () => {
    expect(priceFor(1, 0.001)).toBe("$0.001000");
  });
  it("cinq mesures valent cinq fois — observe on-chain : 5000 unites d'USDC", () => {
    expect(priceFor(5, 0.001)).toBe("$0.005000");
  });
  it("dix mesures, jamais une notation scientifique (parseMoney la refuse)", () => {
    expect(priceFor(10, 0.001)).toBe("$0.010000");
  });
});

describe("l'identifiant de transaction, des deux cotes", () => {
  it("traduit la forme du SettleResponse vers celle du mirror node", () => {
    // x402 rend 0.0.x@secondes.nanos ; le mirror indexe 0.0.x-secondes-nanos
    expect(toMirrorTxId("0.0.7162784@1788839470.544998334")).toBe(
      "0.0.7162784-1788839470-544998334",
    );
  });
});

describe("la cle privee, du bon type", () => {
  it("refuse un type inconnu au lieu de deviner", () => {
    // Une cle ECDSA lue en ED25519 produit une signature valide en forme et fausse en
    // fait : le facilitateur repondrait INVALID_SIGNATURE sans dire pourquoi.
    expect(() => parseKey("0x00", "SECP256R1")).toThrow(/HEDERA_PAYER_KEY_TYPE inconnu/);
  });
});
