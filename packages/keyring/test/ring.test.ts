/**
 * Le trousseau, sans reseau ni conteneur.
 *
 * Le cycle reel (Speculos + backend LKRP) est prouve par scripts/ring.ts ; ici on fixe les
 * regles qui ne doivent JAMAIS ceder, et chacune correspond a une erreur qu'on a faite ou
 * qu'on aurait pu faire.
 */
import { describe, it, expect } from "vitest";
import { seal, open, type TrustchainSdk, type Trustchain } from "../src/ring.js";
import { parseRing, SCHEMA, type SealedRing } from "../src/store.js";

const TRUSTCHAIN: Trustchain = {
  rootId: "00914e888507dbcb06b27d5fd3e50f3465d632d63fde0b07b587f7ebb99cfae281",
  walletSyncEncryptionKey: "58dfca27d9cb4279196d0f2a".padEnd(64, "0"),
  applicationPath: "m/0'/17'/0'",
};

/** Un SDK double : le "chiffrement" est un XOR, ce qui suffit a verifier les allers-retours. */
function fakeSdk(over: Partial<TrustchainSdk> = {}): TrustchainSdk {
  const xor = (d: Uint8Array) => Uint8Array.from(d.map((b) => b ^ 0x5a));
  return {
    async initMemberCredentials() {
      return { pubkey: "02aa", privatekey: "bb" };
    },
    async getOrCreateTrustchain() {
      return { trustchain: TRUSTCHAIN };
    },
    async restoreTrustchain() {
      return TRUSTCHAIN;
    },
    async encryptUserData(_t, d) {
      return xor(d);
    },
    async decryptUserData(_t, d) {
      return xor(d);
    },
    ...over,
  };
}

const approved = async () => ({ screens: ["Connect to Ledger Sync?", "Connect"], confirmed: true });
const refused = async () => ({ screens: ["Don't connect"], confirmed: false });

const baseSeal = {
  nom: "HEDERA_PAYER_PRIVATE_KEY",
  secret: "0x9838aaaabbbbccccddddeeeeffff00001111222233334444555566667777eb7a",
  appareil: "Speculos — application Ledger Sync (Nano X)",
  physique: false,
  backend: "https://trustchain-backend.api.aws.stg.ldg-tech.com",
};

describe("sceller", () => {
  it("scelle le secret et rend la trace des ecrans", async () => {
    const out = await seal({ sdk: fakeSdk(), approve: approved, ...baseSeal });
    expect(out.ring.v).toBe(SCHEMA);
    expect(out.ring.rootId).toBe(TRUSTCHAIN.rootId);
    expect(out.screens).toContain("Connect");
    // le secret n'apparait nulle part en clair
    expect(JSON.stringify(out.ring)).not.toContain(baseSeal.secret);
  });

  it("n'ecrit JAMAIS la cle de chiffrement — sinon le fichier ne protege rien", async () => {
    const out = await seal({ sdk: fakeSdk(), approve: approved, ...baseSeal });
    const brut = JSON.stringify(out.ring);
    expect(brut).not.toContain(TRUSTCHAIN.walletSyncEncryptionKey);
    expect(brut).not.toContain("walletSyncEncryptionKey");
  });

  it("refuse de sceller si l'appareil n'a rien confirme", async () => {
    await expect(seal({ sdk: fakeSdk(), approve: refused, ...baseSeal })).rejects.toThrow(
      /aucune approbation/,
    );
  });

  it("refuse un secret vide au lieu de sceller du neant", async () => {
    await expect(
      seal({ sdk: fakeSdk(), approve: approved, ...baseSeal, secret: "" }),
    ).rejects.toThrow(/le secret est vide/);
  });

  it("note que l'appareil n'etait PAS physique — jamais suppose", async () => {
    const out = await seal({ sdk: fakeSdk(), approve: approved, ...baseSeal });
    expect(out.ring.physique).toBe(false);
    expect(out.ring.appareil).toMatch(/Speculos/);
  });
});

describe("ouvrir", () => {
  const ring = (over: Partial<SealedRing> = {}): SealedRing => ({
    v: SCHEMA,
    scelle_le: "2026-09-08T08:20:57.503Z",
    appareil: baseSeal.appareil,
    physique: false,
    backend: baseSeal.backend,
    rootId: TRUSTCHAIN.rootId,
    membre: { pubkey: "02aa", privatekey: "bb" },
    nom: baseSeal.nom,
    scelle: Buffer.from(Uint8Array.from(Buffer.from(baseSeal.secret, "utf8")).map((b) => b ^ 0x5a)).toString("hex"),
    ...over,
  });

  it("rend le secret d'origine, octet pour octet", async () => {
    expect(await open(fakeSdk(), ring())).toBe(baseSeal.secret);
  });

  it("n'appelle AUCUN appareil : un SDK qui en exige un ferait echouer ce test", async () => {
    let touche = false;
    const sdk = fakeSdk({
      async getOrCreateTrustchain() {
        touche = true;
        throw new Error("appareil requis");
      },
    });
    await open(sdk, ring());
    expect(touche).toBe(false);
  });

  it("dit que le membre a peut-etre ete revoque quand le backend ne rend aucune cle", async () => {
    const sdk = fakeSdk({
      async restoreTrustchain() {
        return { ...TRUSTCHAIN, walletSyncEncryptionKey: "" };
      },
    });
    await expect(open(sdk, ring())).rejects.toThrow(/revoque/);
  });
});

describe("relire un trousseau", () => {
  it("refuse un fichier qui contient une cle de chiffrement en clair", () => {
    const empoisonne = JSON.stringify({
      v: SCHEMA, rootId: "x", membre: { pubkey: "a", privatekey: "b" },
      scelle: "00", nom: "X", backend: "y",
      walletSyncEncryptionKey: "deadbeef",
    });
    expect(() => parseRing(empoisonne)).toThrow(/ne protege rien/);
  });

  it("refuse un schema inconnu au lieu de deviner", () => {
    expect(() => parseRing('{"v":"autre.chose"}')).toThrow(/schema inattendu/);
  });

  it("refuse des credentials de membre incomplets", () => {
    const s = JSON.stringify({
      v: SCHEMA, rootId: "x", membre: { pubkey: "a" }, scelle: "00", nom: "X", backend: "y",
    });
    expect(() => parseRing(s)).toThrow(/incomplets/);
  });

  it("nomme le champ manquant", () => {
    expect(() => parseRing(JSON.stringify({ v: SCHEMA, rootId: "x" }))).toThrow(/membre/);
  });
});
