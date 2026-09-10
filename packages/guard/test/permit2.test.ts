/**
 * PERMIT2 : LES HACHAGES NE SE SUPPOSENT PAS.
 *
 * Un separateur de domaine faux invalide TOUTE signature — et le contrat ne dit pas pourquoi,
 * il rejette. C'est le genre d'erreur qui coute une journee et qu'aucun test d'integration ne
 * localise. Ces tests epinglent donc les trois valeurs contre celles du contrat REELLEMENT
 * deploye, relevees sur le fork Base epingle :
 *
 *     cast call 0x000000000022d473030f116ddee9f6b43ac78ba3 "DOMAIN_SEPARATOR()(bytes32)"
 *     -> 0x3b6f35e4fce979ef8eac3bcdc8c3fc38fe7911bb0c69c8fe72bf1fd1a17e6f07
 *
 * Le piege precis : le domaine de Permit2 n'a PAS de champ `version`. En ajouter un change le
 * hash, et rien ne le signale. Le test « le domaine n'a pas de champ version » est la pour
 * qu'on ne le rajoute jamais « par coherence » avec les autres domaines EIP-712.
 *
 * Et la regle produit que ce module doit tenir : Permit2 ne dispense PAS d'approuver le jeton
 * vers Permit2. Promettre « une seule signature » a quelqu'un qui n'a pas fait cette
 * approbation serait faux, et sa transaction echouerait apres qu'il ait signe.
 */
import { describe, it, expect } from "vitest";
import {
  PERMIT2,
  UNIVERSAL_ROUTER_BASE,
  COMMAND_PERMIT2_PERMIT,
  MONTANT_MAX_PERMIT2,
  TYPE_DETAILS,
  TYPE_SINGLE,
  domaineHash,
  detailsHash,
  permitSingleHash,
  digestPermit,
  messageTypeAsigner,
  encodePermit2PermitInput,
  calldataApprobation,
  besoin,
  type PermitSingle,
} from "../src/permit2.js";
import { keccak256, toHex } from "../src/keccak.js";

const JETON = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC sur Base
const hashTexte = (s: string) => keccak256(new TextEncoder().encode(s));

describe("les hachages, epingles au contrat deploye", () => {
  it("le separateur de domaine sur Base est celui du contrat", () => {
    // Releve par `cast call ... DOMAIN_SEPARATOR()` sur le fork Base au bloc 50 614 000.
    expect(toHex(domaineHash(8453))).toBe(
      "0x3b6f35e4fce979ef8eac3bcdc8c3fc38fe7911bb0c69c8fe72bf1fd1a17e6f07",
    );
  });

  it("le domaine n'a PAS de champ version — en ajouter un casse tout en silence", () => {
    const sans = toHex(
      keccak256(
        new Uint8Array([
          ...hashTexte("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
          ...new Array(0),
        ]),
      ),
    );
    // On ne compare pas ce hash-la (il n'inclut pas les valeurs) : ce qu'on verifie, c'est que
    // le TYPE utilise ne mentionne pas `version`, et que le domaine reste celui du contrat.
    expect(sans).toBeTruthy();
    const avecVersion = toHex(
      keccak256(
        new TextEncoder().encode(
          "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
        ),
      ),
    );
    const sansVersion = toHex(
      keccak256(
        new TextEncoder().encode("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
      ),
    );
    expect(avecVersion).not.toBe(sansVersion);
    // et le notre est bien celui du contrat, donc celui SANS version
    expect(toHex(domaineHash(8453))).toBe(
      "0x3b6f35e4fce979ef8eac3bcdc8c3fc38fe7911bb0c69c8fe72bf1fd1a17e6f07",
    );
  });

  it("les deux typehash sont les constantes publiees de Permit2", () => {
    expect(toHex(hashTexte(TYPE_DETAILS))).toBe(
      "0x65626cad6cb96493bf6f5ebea28756c966f023ab9e8a83a7101849d5573b3678",
    );
    expect(toHex(hashTexte(TYPE_SINGLE))).toBe(
      "0xf3841cd1ff0085026a6327b620b67997ce40f282c88a8e905a7a5626e310f3d0",
    );
  });

  it("le domaine depend de la chaine : la meme signature ne passe pas ailleurs", () => {
    expect(toHex(domaineHash(8453))).not.toBe(toHex(domaineHash(84532)));
  });

  it("le digest change si un seul champ change", () => {
    const p: PermitSingle = {
      details: { token: JETON, amount: 1000n, expiration: 999n, nonce: 0n },
      spender: UNIVERSAL_ROUTER_BASE,
      sigDeadline: 123n,
    };
    const base = digestPermit(p, 8453);
    for (const modif of [
      { ...p, details: { ...p.details, amount: 1001n } },
      { ...p, details: { ...p.details, nonce: 1n } },
      { ...p, sigDeadline: 124n },
      { ...p, spender: PERMIT2 },
    ] as PermitSingle[]) {
      expect(digestPermit(modif, 8453)).not.toBe(base);
    }
    expect(base).toMatch(/^0x[0-9a-f]{64}$/);
    expect(toHex(detailsHash(p.details))).toMatch(/^0x[0-9a-f]{64}$/);
    expect(toHex(permitSingleHash(p))).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("le message rendu au portefeuille", () => {
  const p: PermitSingle = {
    details: { token: JETON, amount: MONTANT_MAX_PERMIT2, expiration: 1800n, nonce: 3n },
    spender: UNIVERSAL_ROUTER_BASE,
    sigDeadline: 900n,
  };
  const m = messageTypeAsigner(p, 8453);

  it("porte le domaine exact de Permit2, sans version", () => {
    expect(m.domain).toEqual({ name: "Permit2", chainId: 8453, verifyingContract: PERMIT2 });
    expect(m.domain).not.toHaveProperty("version");
  });

  it("declare les types dans l'ordre que le contrat hache", () => {
    expect(m.types.PermitDetails.map((f) => f.name)).toEqual(["token", "amount", "expiration", "nonce"]);
    expect(m.types.PermitSingle.map((f) => f.name)).toEqual(["details", "spender", "sigDeadline"]);
    expect(m.primaryType).toBe("PermitSingle");
  });

  it("rend les grands entiers en CHAINES : un uint160 ne tient pas dans un Number", () => {
    // MONTANT_MAX_PERMIT2 vaut 2^160-1. Passe en Number, il perdrait ses chiffres bas
    // silencieusement, et la signature autoriserait un montant different de celui affiche.
    expect(typeof m.message.details.amount).toBe("string");
    expect(m.message.details.amount).toBe(MONTANT_MAX_PERMIT2.toString());
    expect(Number(m.message.details.amount)).not.toBe(MONTANT_MAX_PERMIT2);
  });
});

describe("l'entree de la commande PERMIT2_PERMIT", () => {
  const p: PermitSingle = {
    details: { token: JETON, amount: 42n, expiration: 7n, nonce: 1n },
    spender: UNIVERSAL_ROUTER_BASE,
    sigDeadline: 99n,
  };

  it("la commande est 0x0a", () => {
    expect(COMMAND_PERMIT2_PERMIT).toBe(0x0a);
  });

  it("s'encode en mots de 32 octets, avec la signature en dynamique", () => {
    const sig = "0x" + "ab".repeat(65);
    const enc = encodePermit2PermitInput(p, sig);
    // 6 mots de struct + 1 offset + 1 longueur + 65 octets rembourres a 96
    expect(enc.length % 32).toBe(0);
    expect(enc.length).toBe(32 * 8 + 96);
    // l'offset annonce doit designer le mot de longueur
    const offset = Number(BigInt("0x" + toHex(enc.slice(6 * 32, 7 * 32)).slice(2)));
    expect(offset).toBe(7 * 32);
    const longueur = Number(BigInt("0x" + toHex(enc.slice(7 * 32, 8 * 32)).slice(2)));
    expect(longueur).toBe(65);
  });

  it("refuse une signature malformee plutot que d'encoder n'importe quoi", () => {
    expect(() => encodePermit2PermitInput(p, "0xzz")).toThrow(/malformee/);
    expect(() => encodePermit2PermitInput(p, "0xabc")).toThrow(/malformee/);
  });
});

describe("ce qui reste a faire a l'utilisateur — la regle qui evite une promesse fausse", () => {
  const commun = { token: JETON, montant: 1000n, chainId: 8453, maintenant: 1_700_000_000n };

  it("sans approbation vers Permit2, une SIGNATURE NE SUFFIT PAS", () => {
    const b = besoin({ ...commun, allowanceVersPermit2: 0n, autorisationDuRouteur: null });
    expect(b.etat).toBe("APPROBATION_REQUISE");
    expect(b.aSigner).toBeNull();
    expect(b.approbation).not.toBeNull();
    expect(b.approbation!.to).toBe(JETON);
    expect(b.raison).toMatch(/Permit2 ne la remplace pas/);
  });

  it("une allowance NON LUE n'est pas une allowance suffisante", () => {
    // null n'est pas zero, et surtout pas « assez ». Proposer une signature qui echouerait
    // est pire que demander une approbation de trop.
    const b = besoin({ ...commun, allowanceVersPermit2: null, autorisationDuRouteur: null });
    expect(b.etat).toBe("APPROBATION_REQUISE");
    expect(b.raison).toMatch(/n'a pas pu etre lue/);
  });

  it("approuve mais sans autorisation du routeur : une signature suffit", () => {
    const b = besoin({ ...commun, allowanceVersPermit2: MONTANT_MAX_PERMIT2, autorisationDuRouteur: null });
    expect(b.etat).toBe("SIGNATURE_SUFFIT");
    expect(b.approbation).toBeNull();
    expect(b.aSigner).not.toBeNull();
    expect(b.aSigner!.message.spender).toBe(UNIVERSAL_ROUTER_BASE);
    // la signature perime vite, meme si l'autorisation dure
    expect(BigInt(b.aSigner!.message.sigDeadline)).toBe(commun.maintenant + 1800n);
    expect(BigInt(b.aSigner!.message.details.expiration)).toBe(commun.maintenant + 30n * 86400n);
  });

  it("deja autorise pour assez et pas expire : RIEN a signer", () => {
    const b = besoin({
      ...commun,
      allowanceVersPermit2: MONTANT_MAX_PERMIT2,
      autorisationDuRouteur: { montant: 5000n, expiration: commun.maintenant + 1000n, nonce: 2n },
    });
    expect(b.etat).toBe("DEJA_AUTORISE");
    expect(b.aSigner).toBeNull();
    expect(b.approbation).toBeNull();
  });

  it("une autorisation EXPIREE demande une signature, pas une approbation", () => {
    const b = besoin({
      ...commun,
      allowanceVersPermit2: MONTANT_MAX_PERMIT2,
      autorisationDuRouteur: { montant: MONTANT_MAX_PERMIT2, expiration: commun.maintenant - 1n, nonce: 4n },
    });
    expect(b.etat).toBe("SIGNATURE_SUFFIT");
    // et le nonce du permit reprend celui lu sur la chaine : un nonce reutilise est rejete
    expect(BigInt(b.aSigner!.message.details.nonce)).toBe(4n);
  });

  it("un montant insuffisant demande une signature qui le releve", () => {
    const b = besoin({
      ...commun,
      allowanceVersPermit2: MONTANT_MAX_PERMIT2,
      autorisationDuRouteur: { montant: 10n, expiration: commun.maintenant + 9999n, nonce: 0n },
    });
    expect(b.etat).toBe("SIGNATURE_SUFFIT");
    expect(BigInt(b.aSigner!.message.details.amount)).toBe(MONTANT_MAX_PERMIT2);
  });

  it("l'approbation vise Permit2 et non le routeur", () => {
    const d = calldataApprobation();
    expect(d.startsWith("0x095ea7b3")).toBe(true);
    expect(d.toLowerCase()).toContain(PERMIT2.slice(2).toLowerCase());
    expect(d.toLowerCase()).not.toContain(UNIVERSAL_ROUTER_BASE.slice(2).toLowerCase());
  });
});

describe("le calldata complet : permit PUIS swap, en une transaction", () => {
  it("les deux commandes sont presentes, dans le bon ordre, et le swap se relit", async () => {
    const { encodeUniversalRouterExactInSingle } = await import("../src/encode.js");
    const { decodeUniversalRouterCalldata } = await import("../src/calldata.js");

    const poolKey = {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: JETON,
      fee: 500,
      tickSpacing: 10,
      hooks: "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145",
    };
    const permit: PermitSingle = {
      details: { token: JETON, amount: MONTANT_MAX_PERMIT2, expiration: 9999n, nonce: 0n },
      spender: UNIVERSAL_ROUTER_BASE,
      sigDeadline: 8888n,
    };

    const sans = encodeUniversalRouterExactInSingle([{ poolKey, zeroForOne: true, amountIn: 10n ** 15n }]);
    const avec = encodeUniversalRouterExactInSingle(
      [{ poolKey, zeroForOne: true, amountIn: 10n ** 15n }],
      { permit: { permit, signature: "0x" + "cd".repeat(65) } },
    );
    expect(avec.length).toBeGreaterThan(sans.length);

    // La liste de commandes doit valoir 0x0a10 : le permit d'abord. Un swap presente avant
    // son permit echouerait faute d'autorisation, et l'ordre est le seul garde-fou.
    const d = decodeUniversalRouterCalldata(avec);
    expect(d.commands.toLowerCase()).toBe("0x0a10");

    // Et le swap doit rester lisible malgre la commande ajoutee devant : c'est ce qui prouve
    // que les offsets ont suivi. Sans ce controle on enverrait signer des octets que
    // personne n'a relus.
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0]!.poolKey.hooks.toLowerCase()).toBe(poolKey.hooks);
    expect(d.legs[0]!.amountIn).toBe((10n ** 15n).toString());
    expect(d.legs[0]!.zeroForOne).toBe(true);
    expect(d.issues).toHaveLength(0);
    expect(d.complete).toBe(true);
  });

  it("sans permit, la liste ne porte que le swap — on n'ajoute rien d'inutile", async () => {
    const { encodeUniversalRouterExactInSingle } = await import("../src/encode.js");
    const { decodeUniversalRouterCalldata } = await import("../src/calldata.js");
    const d = decodeUniversalRouterCalldata(
      encodeUniversalRouterExactInSingle([
        {
          poolKey: {
            currency0: "0x0000000000000000000000000000000000000000",
            currency1: JETON,
            fee: 500,
            tickSpacing: 10,
            hooks: "0x9ce0e33e68c7bfc035b31961e4f1ddc55f0c0145",
          },
          zeroForOne: true,
          amountIn: 1n,
        },
      ]),
    );
    expect(d.commands.toLowerCase()).toBe("0x10");
    expect(d.legs).toHaveLength(1);
  });
});
