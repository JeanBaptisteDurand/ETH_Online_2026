/**
 * La parite bit a bit entre notre table de permissions et le registre officiel.
 *
 * `flags.ts` porte depuis le premier jour la phrase « __tests__/flags.test.ts la verifie
 * sur les 613 fiches, bit a bit ». Ce fichier n'existait pas. C'etait une promesse morte :
 * du code qui affirme etre couvert par un test absent, exactement le defaut que TARE
 * reproche au registre — decrire sans verifier.
 *
 * Ce que ce fichier prouve reellement :
 *
 *   1. les 14 bits sont ceux de `Hooks.sol` — uniques, et couvrant 0..13 sans trou ;
 *   2. sur CHAQUE fiche du registre, pour CHAQUE booleen de permission qu'elle porte,
 *      le bit lu dans l'adresse dit la meme chose que le booleen. Un seul ecart casse
 *      le widget a 14 diodes, qui n'appelle personne et ne peut donc pas se rattraper ;
 *   3. les trois copies de cette table dans le depot (ici, packages/hookflags,
 *      apps/mcp) donnent le meme bit pour le meme nom. Elles sont recopiees faute de
 *      chaine de build partagee ; une divergence silencieuse entre elles produirait
 *      deux verdicts differents pour un meme hook.
 *
 * Le compte de comparaisons est ecrit dans la sortie, pas devine : 613 fiches x 14
 * booleens = 8582. Le moteur Python imprime le meme nombre depuis
 * engine/tests/test_flags.py, et c'est voulu : deux implementations independantes,
 * un seul resultat.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { HOOK_FLAG_BITS, FLAG_ORDER, decodeFlags, canAlterSwapOutput } from "../flags.js";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const REGISTRY = resolve(REPO, "docs", "hooklist.json");

interface Entry {
  hook?: { address?: string; name?: string };
  flags?: Record<string, boolean>;
}

function entries(): Entry[] {
  const raw = JSON.parse(readFileSync(REGISTRY, "utf8"));
  return Array.isArray(raw) ? raw : (raw.hooks ?? []);
}

describe("les 14 bits sont ceux de Hooks.sol", () => {
  it("quatorze permissions, pas treize ni quinze", () => {
    expect(Object.keys(HOOK_FLAG_BITS)).toHaveLength(14);
    expect(FLAG_ORDER).toHaveLength(14);
  });

  it("les bits couvrent 0..13 exactement, sans trou ni doublon", () => {
    const bits = Object.values(HOOK_FLAG_BITS).sort((a, b) => a - b);
    expect(bits).toEqual(Array.from({ length: 14 }, (_, i) => 1 << i));
  });

  it("l'adresse nulle ne declare aucune permission", () => {
    const d = decodeFlags("0x0000000000000000000000000000000000000000");
    expect(d.bitmap).toBe(0);
    expect(d.active).toEqual([]);
  });

  it("seuls les 14 bits bas comptent — les 146 autres sont ignores", () => {
    // Meme quartet bas, parties hautes opposees : meme declaration.
    const a = decodeFlags("0x00000000000000000000000000000000000020c0");
    const b = decodeFlags("0xffffffffffffffffffffffffffffffffffff20c0");
    expect(b.bitmap).toBe(a.bitmap);
    expect(b.active).toEqual(a.active);
  });
});

describe("parite avec le registre officiel, fiche par fiche", () => {
  it("aucun ecart sur aucun bit d'aucune fiche", () => {
    expect(existsSync(REGISTRY), `${REGISTRY} absent`).toBe(true);
    const list = entries();
    expect(list.length).toBeGreaterThan(500);

    let checked = 0;
    const mismatches: string[] = [];

    for (const e of list) {
      const addr = e.hook?.address;
      if (typeof addr !== "string" || !addr.startsWith("0x")) continue;
      const declared = e.flags;
      if (!declared) continue;

      const active = new Set(decodeFlags(addr).active as string[]);
      for (const name of FLAG_ORDER) {
        if (!(name in declared)) continue;
        checked += 1;
        const theirs = Boolean(declared[name]);
        const ours = active.has(name);
        if (theirs !== ours) {
          mismatches.push(`${addr} ${name}: registre=${theirs} adresse=${ours}`);
        }
      }
    }

    // Si la forme du registre change, `checked` s'effondre et le test passerait a vide.
    expect(checked, "rien n'a ete compare — la forme du registre a change").toBeGreaterThan(5000);
    expect(mismatches, `${mismatches.length} ecarts sur ${checked} comparaisons`).toEqual([]);

    // Le nombre publie, imprime plutot qu'affirme.
    console.log(`    ${checked} comparaisons de bits sur ${list.length} fiches, 0 ecart`);
  });

  it("le nombre de comparaisons est bien 14 par fiche portant des flags", () => {
    const withFlags = entries().filter(
      (e) => e.flags && typeof e.hook?.address === "string" && e.hook.address.startsWith("0x"),
    );
    let checked = 0;
    for (const e of withFlags) {
      for (const name of FLAG_ORDER) if (name in (e.flags as object)) checked += 1;
    }
    expect(checked).toBe(withFlags.length * 14);
  });
});

describe("les trois copies de la table ne divergent pas", () => {
  /**
   * Elles sont recopiees a la main faute de chaine de build partagee (voir l'en-tete de
   * flags.ts). Une recopie qui derive est pire qu'une dependance : elle donne deux
   * reponses differentes sans que rien ne casse. On lit donc les deux autres fichiers
   * comme du texte et on compare les decalages.
   */
  function shiftsFrom(path: string, pattern: RegExp): Record<string, number> {
    const src = readFileSync(path, "utf8");
    const out: Record<string, number> = {};
    for (const m of src.matchAll(pattern)) {
      const nom = m[1];
      const val = m[2];
      // Un groupe de capture peut ne pas avoir participe : le typer non-optionnel
      // laisserait passer un `out[undefined]` a l'execution.
      if (nom === undefined || val === undefined) continue;
      out[nom] = Number(val);
    }
    return out;
  }

  it("packages/hookflags declare les memes decalages", () => {
    const p = resolve(REPO, "packages", "hookflags", "src", "index.ts");
    expect(existsSync(p), `${p} absent`).toBe(true);
    // Table SCREAMING_SNAKE : `BEFORE_SWAP: 1 << 7,`
    const theirs = shiftsFrom(p, /^\s{2}([A-Z][A-Z_0-9]+):\s*1 << (\d+),/gm);
    expect(Object.keys(theirs)).toHaveLength(14);

    const snake = (camel: string) =>
      camel.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
    for (const name of FLAG_ORDER) {
      expect(theirs[snake(name)], `${name} absent de packages/hookflags`).toBe(
        Math.log2(HOOK_FLAG_BITS[name]),
      );
    }
  });

  it("apps/mcp declare les memes decalages", () => {
    const p = resolve(REPO, "apps", "mcp", "src", "hookflags.ts");
    expect(existsSync(p), `${p} absent`).toBe(true);
    // Table de paires : `["beforeSwap", 7],`
    const theirs = shiftsFrom(p, /\["(\w+)",\s*(\d+)\]/g);
    expect(Object.keys(theirs)).toHaveLength(14);
    for (const name of FLAG_ORDER) {
      expect(theirs[name], `${name} absent de apps/mcp`).toBe(Math.log2(HOOK_FLAG_BITS[name]));
    }
  });
});

describe("capacite n'est pas mesure", () => {
  it("un hook qui rend un delta sur le swap peut deplacer la sortie", () => {
    // 0x985c14baa2... porte beforeSwapReturnsDelta + afterSwapReturnsDelta.
    expect(canAlterSwapOutput("0x985c14baa2a18316ffda0aefb3a632fadfca2acc")).toBe(true);
  });

  it("l'adresse nulle ne peut rien deplacer", () => {
    expect(canAlterSwapOutput("0x0000000000000000000000000000000000000000")).toBe(false);
  });

  it("la capacite ne rend jamais un nombre — elle ne remplace pas un bps", () => {
    const r = canAlterSwapOutput("0x985c14baa2a18316ffda0aefb3a632fadfca2acc");
    expect(typeof r).toBe("boolean");
  });
});
