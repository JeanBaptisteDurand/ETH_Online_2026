/**
 * L'IDENTITE D'AGENT HCS-14.
 *
 * Un identifiant deterministe n'a qu'une propriete : deux personnes parties des memes six
 * champs doivent obtenir la meme chaine, sans se parler. Tout ce qui suit tient cette
 * propriete, regle de canonicalisation par regle de canonicalisation.
 *
 * CE QUI MANQUE, ET QU'IL FAUT DIRE : la norme publie deux vecteurs de test avec leurs
 * ENTREES mais sans leurs EMPREINTES. Il n'existe donc aucun resultat de reference publie.
 * Ces tests valident :
 *   - le base58 contre les vecteurs standard de Bitcoin ET contre bs58@4.0.1, une
 *     implementation independante et repandue (les valeurs ci-dessous en viennent) ;
 *   - la canonicalisation contre le pseudo-code de la norme, regle par regle ;
 *   - la stabilite de notre propre identifiant, pour qu'il ne bouge pas par accident.
 * Ce qu'ils ne peuvent PAS valider, c'est que notre lecture de la norme est celle qu'un
 * autre implementeur ferait. C'est une limite reelle, elle est ecrite dans la reponse de
 * GET /agent et pas seulement ici.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { base58, canonique, jsonCanonique, empreinte, uaid } from "../src/agent/hcs14.js";
import { TARE, UAID_TARE, VERSION } from "../src/agent/identite.js";
import { agentMessage, identiteJson, AGENT_SCHEMA } from "../src/agent/publish.js";

describe("base58", () => {
  // Vecteurs standard de Bitcoin, plus deux cas de zeros de tete. Verifies contre
  // bs58@4.0.1 (present dans packages/keyring/node_modules) avant d'etre figes ici.
  const vecteurs: Array<[string, string]> = [
    ["", ""],
    ["00", "1"],
    ["000001", "112"],
    ["61", "2g"],
    ["626262", "a3gV"],
    ["68656c6c6f20776f726c64", "StV1DL6CwTryKyV"],
    ["00000000000000000000", "1111111111"],
  ];
  for (const [hex, attendu] of vecteurs) {
    it(`0x${hex || "(vide)"} -> ${attendu || "(vide)"}`, () => {
      expect(base58(new Uint8Array(Buffer.from(hex, "hex")))).toBe(attendu);
    });
  }

  it("un octet nul de tete vaut un « 1 », et n'est pas avale", () => {
    // C'est la raison pour laquelle l'implementation ne passe pas par un BigInt : un BigInt
    // perdrait les zeros de tete, et deux empreintes differentes se liraient pareil.
    expect(base58(new Uint8Array([0, 1]))).not.toBe(base58(new Uint8Array([1])));
  });
});

describe("la canonicalisation, regle par regle", () => {
  const base = {
    registry: "self",
    name: "TARE",
    version: "0.1.0",
    protocol: "mcp",
    nativeId: "hedera:testnet:0.0.1",
    skills: [17, 10],
  };

  it("registry et protocol passent en minuscules, mais pas le nom", () => {
    const c = canonique({ ...base, registry: "SELF", protocol: "MCP", name: "TARE" });
    expect(c.registry).toBe("self");
    expect(c.protocol).toBe("mcp");
    expect(c.name).toBe("TARE");
  });

  it("les espaces de bord sont rognes sur les cinq chaines", () => {
    const c = canonique({
      registry: " self ",
      name: " TARE ",
      version: " 0.1.0 ",
      protocol: " mcp ",
      nativeId: " hedera:testnet:0.0.1 ",
      skills: [],
    });
    expect([c.registry, c.name, c.version, c.protocol, c.nativeId]).toEqual([
      "self",
      "TARE",
      "0.1.0",
      "mcp",
      "hedera:testnet:0.0.1",
    ]);
  });

  it("les competences sont triees en NOMBRES, pas en chaines", () => {
    // Le piege : [0, 17, 9].sort() rend [0, 17, 9] et non [0, 9, 17]. Deux agents aux memes
    // competences auraient alors deux identites differentes.
    expect(canonique({ ...base, skills: [17, 0, 9] }).skills).toEqual([0, 9, 17]);
  });

  it("l'ordre des competences a l'entree ne change pas l'empreinte", () => {
    expect(empreinte({ ...base, skills: [10, 17] })).toBe(empreinte({ ...base, skills: [17, 10] }));
  });

  it("les cles du JSON hache sont triees, et il n'y a aucune espace", () => {
    const j = jsonCanonique(base);
    expect(j).toBe(
      '{"name":"TARE","nativeId":"hedera:testnet:0.0.1","protocol":"mcp","registry":"self","skills":[10,17],"version":"0.1.0"}',
    );
    expect(j).not.toContain(" ");
  });

  it("un champ requis vide fait lever, il n'est pas remplace par du vide", () => {
    for (const champ of ["registry", "name", "version", "protocol", "nativeId"] as const) {
      expect(() => canonique({ ...base, [champ]: "  " })).toThrow(/champ HCS-14 manquant/);
    }
  });

  it("changer une competence change l'identifiant", () => {
    expect(empreinte({ ...base, skills: [10] })).not.toBe(empreinte({ ...base, skills: [10, 17] }));
  });

  it("les parametres de routage n'entrent PAS dans l'empreinte", () => {
    // La norme est explicite : « Communication details are NOT included in the hash ».
    const a = uaid({ ...base, uid: "0" });
    const b = uaid({ ...base, uid: "autre-chose" });
    expect(a.split(";")[0]).toBe(b.split(";")[0]);
    expect(a).not.toBe(b);
  });

  it("le domaine ne s'ajoute que s'il existe, et jamais vide", () => {
    expect(uaid({ ...base })).not.toContain("domain=");
    expect(uaid({ ...base, domain: "tare.dev" })).toContain(";domain=tare.dev");
  });
});

describe("l'identite de TARE", () => {
  it("est celle-ci, et elle ne doit pas bouger par accident", () => {
    expect(jsonCanonique(TARE)).toBe(
      '{"name":"TARE","nativeId":"hedera:testnet:0.0.10367920","protocol":"mcp","registry":"self","skills":[10,17,21,33,39],"version":"0.1.0"}',
    );
    expect(UAID_TARE).toBe(
      "uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY" +
        ";registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0",
    );
  });

  it("la version figee est celle de package.json — elle entre dans l'empreinte", () => {
    // Ecrite en dur pour que l'identite soit la meme sans le fichier sous la main ; ce test
    // est ce qui l'empeche de deriver en silence.
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });

  it("registry vaut « self » : TARE n'est inscrit dans aucun annuaire", () => {
    // La norme : « for self-sovereign agents lacking a specific registry, the registry field
    // shall be set to 'self' ». Ecrire « hol » ou « hedera » revendiquerait une inscription.
    expect(TARE.registry).toBe("self");
    expect(TARE.uid).toBe("0");
  });

  it("ne revendique aucune competence qui n'a pas de code source en face", () => {
    // 11 Smart Contract Audit, 34 Consensus Participation et 7 Knowledge Retrieval etaient
    // tentants et sont volontairement absents.
    expect(TARE.skills).toEqual([10, 17, 21, 33, 39]);
    for (const interdit of [7, 11, 34]) expect(TARE.skills).not.toContain(interdit);
  });

  it("le nativeId est le compte qui paie les ancrages : c'est ce qui relie identite et journal", () => {
    expect(TARE.nativeId).toBe("hedera:testnet:0.0.10367920");
  });
});

describe("le serveur MCP annonce la meme identite", () => {
  it("la chaine recopiee dans apps/mcp est exactement celle qu'on calcule", () => {
    // apps/mcp ne depend pas de apps/api : la chaine y est recopiee. Sans ce test, le serveur
    // MCP pourrait annoncer une identite que personne ne saurait recalculer — le contraire
    // exact de ce a quoi sert un identifiant deterministe.
    const src = readFileSync(
      resolve(import.meta.dirname, "../../mcp/src/server.ts"),
      "utf8",
    );
    const m = src.match(/export const SERVER_UAID =\s*([\s\S]*?);\n/);
    expect(m, "SERVER_UAID doit exister dans apps/mcp/src/server.ts").toBeTruthy();
    const recopiee = (m![1]!.match(/"([^"]*)"/g) ?? [])
      .map((x) => x.slice(1, -1))
      .join("");
    expect(recopiee).toBe(UAID_TARE);
  });
});

describe("le message publie sur le topic", () => {
  const msg = agentMessage(TARE, "2026-09-09T00:00:00.000Z");

  it("porte l'identifiant ET les six champs, pour que le lecteur recalcule", () => {
    const j = JSON.parse(msg);
    expect(j.v).toBe(AGENT_SCHEMA);
    expect(j.uaid).toBe(UAID_TARE);
    expect(j.canonical).toEqual(canonique(TARE));
  });

  it("tient sous les 1024 octets d'un message HCS non chunke", () => {
    expect(Buffer.byteLength(msg, "utf8")).toBeLessThan(1024);
  });

  it("est deterministe a horodatage egal", () => {
    expect(agentMessage(TARE, "2026-09-09T00:00:00.000Z")).toBe(msg);
  });
});

describe("ce que GET /agent rend", () => {
  const j = identiteJson(null);

  it("donne de quoi recalculer sans nous croire", () => {
    expect(j.uaid).toBe(UAID_TARE);
    expect(j.canonical_json).toBe(jsonCanonique(TARE));
    expect(j.method.hash).toBe("sha384");
    expect(j.method.encoding).toContain("base58");
  });

  it("dit ses limites, et nomme celle qui compte", () => {
    const tout = j.limites.join(" ");
    expect(tout).toMatch(/aucun resultat de reference publie/);
    expect(tout).toMatch(/pseudo-code/);
    expect(tout).toMatch(/aucun annuaire/);
  });

  it("sans topic configure, ne fait pas croire a une publication", () => {
    expect(j.topic).toBeNull();
  });
});
