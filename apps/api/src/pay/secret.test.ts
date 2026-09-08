/**
 * D'ou vient la cle de paiement — et le fait que le service le DISE.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePayerKey, keyringPath } from "./secret.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NOM = "HEDERA_PAYER_PRIVATE_KEY";
let dir: string;
let sauve: Record<string, string | undefined>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tare-keyring-"));
  sauve = { TARE_KEYRING: process.env.TARE_KEYRING, [NOM]: process.env[NOM] };
  process.env.TARE_KEYRING = join(dir, "absent.json");
});
afterEach(() => {
  for (const [k, v] of Object.entries(sauve)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("resoudre la cle de paiement", () => {
  it("tombe sur l'environnement quand il n'y a pas de trousseau — et l'ANNONCE", async () => {
    process.env[NOM] = "0xabc";
    const r = await resolvePayerKey();
    expect(r.value).toBe("0xabc");
    expect(r.source).toBe("environnement");
    // le repli doit se voir : "il marche" n'est pas "il est protege"
    expect(r.describe).toMatch(/CLAIR/);
    expect(r.describe).toMatch(/seal/);
  });

  it("refuse quand il n'y a ni trousseau ni variable — jamais de cle vide", async () => {
    delete process.env[NOM];
    await expect(resolvePayerKey()).rejects.toThrow(/aucune cle de paiement/);
  });

  it("refuse d'ouvrir un trousseau qui scelle un AUTRE secret", async () => {
    const p = join(dir, "keyring.json");
    process.env.TARE_KEYRING = p;
    writeFileSync(
      p,
      JSON.stringify({
        v: "tare.keyring.v1",
        scelle_le: "2026-09-08T08:20:57.503Z",
        appareil: "Speculos", physique: false,
        backend: "https://trustchain-backend.api.aws.stg.ldg-tech.com",
        rootId: "00914e", membre: { pubkey: "02aa", privatekey: "bb" },
        nom: "OPENAI_API_KEY", scelle: "00",
      }),
    );
    await expect(resolvePayerKey(NOM)).rejects.toThrow(/pas « HEDERA_PAYER_PRIVATE_KEY »/);
  });

  it("keyringPath suit TARE_KEYRING", () => {
    process.env.TARE_KEYRING = "/tmp/ailleurs.json";
    expect(keyringPath()).toBe("/tmp/ailleurs.json");
  });
});
