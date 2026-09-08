/**
 * Ce que ces tests fixent, ce sont les erreurs reellement commises en montant ce chemin.
 *
 * Le vrai appareil (Speculos servant Ledger Sync) est teste par
 * `scripts/seed-id.ts`, qui a besoin du reseau et d'un conteneur ; ici tout est
 * deterministe.
 */
import { describe, it, expect } from "vitest";
import { fetchChallenge, proveSeedId, TRUSTCHAIN_API } from "../src/lkrp.js";
import { walkAndConfirm, speculosScreen, LEDGER_SYNC_CONNECT } from "../src/speculos.js";

const CHALLENGE = {
  tlv: "0101070201001210979cdd229d7958231d1081a8d2fe2097",
  json: { challenge: { data: "979cdd229d7958231d1081a8d2fe2097", expiry: "2026-09-08T08:03:54Z" }, host: "trustchain.api.live.ledger.com" },
};

const fakeFetch = (body: unknown, ok = true, status = 200) =>
  (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;

describe("le defi du backend Ledger", () => {
  it("rend le tlv, qui est ce que l'appareil attend", async () => {
    const c = await fetchChallenge(TRUSTCHAIN_API, fakeFetch(CHALLENGE));
    expect(c.tlv).toBe(CHALLENGE.tlv);
    expect(c.data).toBe("979cdd229d7958231d1081a8d2fe2097");
    expect(c.host).toBe("trustchain.api.live.ledger.com");
  });

  it("refuse une reponse sans tlv au lieu d'envoyer du vide a l'appareil", async () => {
    await expect(fetchChallenge(TRUSTCHAIN_API, fakeFetch({ json: {} }))).rejects.toThrow(
      /sans champ tlv/,
    );
  });

  it("refuse un HTTP non-200", async () => {
    await expect(
      fetchChallenge(TRUSTCHAIN_API, fakeFetch({}, false, 503)),
    ).rejects.toThrow(/HTTP 503/);
  });
});

/* ------------------------------------------------------------------ ecrans */

function fakeScreen(sequence: string[]) {
  let i = 0;
  const pressed: string[] = [];
  return {
    pressed,
    screen: {
      async read() {
        return sequence[Math.min(i, sequence.length - 1)]!;
      },
      async press(b: "left" | "right" | "both") {
        pressed.push(b);
        if (b === "right") i += 1;
      },
    },
  };
}

describe("marcher dans les ecrans", () => {
  it("confirme sur « Connect », et seulement sur lui", async () => {
    // Le bug reellement commis : un appui double sur le TITRE annule le flux
    // (« stream has been aborted »). Il faut atteindre l'element, pas le titre.
    const { screen, pressed } = fakeScreen(["Connect to Ledger Sync?", "Connect", "Don't connect"]);
    const r = await walkAndConfirm(screen, LEDGER_SYNC_CONNECT, { delayMs: 0 });
    expect(r.confirmed).toBe(true);
    expect(r.screens).toEqual(["Connect to Ledger Sync?", "Connect"]);
    expect(pressed).toEqual(["right", "both"]); // une navigation, puis la confirmation
  });

  it("ne confirme rien si l'ecran cible n'apparait jamais", async () => {
    const { screen, pressed } = fakeScreen(["App info", "Quit app"]);
    const r = await walkAndConfirm(screen, LEDGER_SYNC_CONNECT, { steps: 4, delayMs: 0 });
    expect(r.confirmed).toBe(false);
    expect(pressed).not.toContain("both");
  });

  it("« Don't connect » n'est jamais pris pour « Connect »", async () => {
    const { screen } = fakeScreen(["Don't connect", "Don't connect"]);
    const r = await walkAndConfirm(screen, LEDGER_SYNC_CONNECT, { steps: 3, delayMs: 0 });
    expect(r.confirmed).toBe(false);
  });

  it("s'arrete des que l'APDU a repondu, sans continuer a appuyer", async () => {
    const { screen, pressed } = fakeScreen(["App info"]);
    const r = await walkAndConfirm(screen, LEDGER_SYNC_CONNECT, {
      delayMs: 0,
      settled: () => true,
    });
    expect(pressed).toEqual([]);
    expect(r.screens).toEqual([]);
  });

  it("un Speculos qui repond 500 le dit au lieu de rendre un ecran vide", async () => {
    const s = speculosScreen("http://x", fakeFetch({}, false, 500));
    await expect(s.read()).rejects.toThrow(/HTTP 500/);
  });
});

/* -------------------------------------------------------------- la preuve */

const REAL = {
  pubkeyCredential: { publicKey: Uint8Array.from(Buffer.from("031fbef68de38f9facd182c1bc60c3f17290c294cc0d197f57eb645aa43733440a", "hex")) },
  signature: Uint8Array.from(Buffer.from("3045022100ee", "hex")),
  attestationType: 0,
  attestationPubkeyCredential: { publicKey: Uint8Array.from(Buffer.from("029a8b", "hex")) },
  attestation: Uint8Array.from(Buffer.from("3044022033", "hex")),
};

const fakeDevice = (result: unknown) => () => ({ getSeedId: async () => result });

describe("la preuve rendue par l'appareil", () => {
  it("porte la cle, la signature, l'attestation et LE DEFI signe", async () => {
    let approved = false;
    const p = await proveSeedId(
      {} as never,
      { tlv: CHALLENGE.tlv, data: "979c", expiry: "", host: "" },
      async () => { approved = true; },
      fakeDevice(REAL),
    );
    expect(approved).toBe(true);
    expect(p.publicKey).toBe("031fbef68de38f9facd182c1bc60c3f17290c294cc0d197f57eb645aa43733440a");
    expect(p.attestationType).toBe(0);
    // Sans le defi, la signature ne prouve rien de datable : elle doit voyager avec.
    expect(p.challenge).toBe("979c");
  });

  it("refuse une reponse sans signature au lieu de rendre une chaine vide", async () => {
    await expect(
      proveSeedId({} as never, { tlv: "00", data: "", expiry: "", host: "" }, async () => {},
        fakeDevice({ ...REAL, signature: undefined })),
    ).rejects.toThrow(/aucune signature/);
  });

  it("refuse une reponse sans cle publique", async () => {
    await expect(
      proveSeedId({} as never, { tlv: "00", data: "", expiry: "", host: "" }, async () => {},
        fakeDevice({ ...REAL, pubkeyCredential: {} })),
    ).rejects.toThrow(/aucune cle publique/);
  });

  it("l'approbation echouee fait echouer l'appel — jamais une preuve auto-approuvee", async () => {
    await expect(
      proveSeedId({} as never, { tlv: "00", data: "", expiry: "", host: "" },
        async () => { throw new Error("l'ecran « Connect » n'est jamais apparu"); },
        fakeDevice(REAL)),
    ).rejects.toThrow(/jamais apparu/);
  });
});
