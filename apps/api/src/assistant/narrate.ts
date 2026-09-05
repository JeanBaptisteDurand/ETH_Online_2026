/**
 * LA REGLE D'OR, MISE EN MACHINE.
 *
 *   Le modele choisit QUOI interroger et explique CE QUI REVIENT.
 *   IL NE PRODUIT JAMAIS UN NOMBRE.
 *
 * Une phrase de l'assistant se construit en deux sortes de morceaux :
 *   - `text(...)`  : de la prose. Elle doit etre SANS CHIFFRE. Un chiffre dans un
 *                    morceau de prose leve UncitedNumberError, immediatement.
 *   - `num(...)`   : un nombre, obligatoirement accompagne de sa citation : d'ou il
 *                    vient, sur quel bloc, quelle taille, quel sens, et la commande
 *                    qui le rejoue.
 *
 * A la fin, `build()` relit la phrase entiere et verifie qu'aucun chiffre n'y a
 * survecu sans citation. Le meme auditeur (`auditNarration`) est passe sur toute
 * phrase venue d'un LLM : si le modele glisse "42 bps", la phrase est REJETEE, pas
 * corrigee — l'assistant retombe sur sa narration deterministe et le dit.
 *
 * Les identifiants ne sont pas des nombres : les adresses 0x..., les pool_id, les
 * ids m_..., les sens "0->1" et une courte liste de mots techniques sont masques
 * avant l'audit. Tout le reste doit etre cite.
 */
import type { Label } from "../labels.js";

export type CitationKind =
  | "measurement" // une valeur en bps venue d'une ligne du jeu
  | "count" // un denombrement exact sur le jeu
  | "threshold" // un seuil demande par l'humain ou publie par le produit
  | "block"
  | "size"
  | "constant"; // une constante du moteur (taille du stub, etc.)

export interface Citation {
  /** le nombre TEL QU'IL EST ECRIT dans la phrase */
  token: string;
  kind: CitationKind;
  /** ce que ce nombre veut dire, en une ligne */
  what: string;
  source: string;
  measurement_id?: string | null;
  hook?: string | null;
  pool_id?: string | null;
  block_number?: number | null;
  amount_in?: string | null;
  direction?: string | null;
  label?: Label | null;
  replay?: string | null;
  /** pour un denombrement : la recette exacte qui le reproduit */
  derived_from?: string | null;
}

export class UncitedNumberError extends Error {
  constructor(
    readonly fragment: string,
    readonly numbers: string[],
  ) {
    super(
      `nombre non source dans la narration : ${numbers.join(", ")} (fragment: ${fragment.slice(0, 120)})`,
    );
    this.name = "UncitedNumberError";
  }
}

/** Ce qui contient des chiffres sans etre un nombre. */
const IDENTIFIER_PATTERNS: RegExp[] = [
  /0x[0-9a-fA-F]*/g, // adresses, pool_id, hashes — et le prefixe "0x" seul d'un exemple
  /m_[0-9a-f]+/g, // ids de mesure
  /\b[01]\s*->\s*[01]\b/g, // le sens du swap
  /\bv[0-9]\b/gi, // Uniswap v4
  /\bx402\b/gi, // le protocole de peage
  /\b402\b/g, // le code HTTP du peage
  /\bsha256\b/gi,
  /\bHooks\.sol\b/g,
  /\banvil_setCode\b/g,
  /\bERC-?[0-9]+\b/gi,
];

export function maskIdentifiers(text: string): string {
  let out = text;
  for (const re of IDENTIFIER_PATTERNS) out = out.replace(re, "·");
  return out;
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

export function findNumbers(text: string): string[] {
  return maskIdentifiers(text).match(NUMBER_RE) ?? [];
}

function normalize(token: string): string {
  return token.replace(",", ".").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export interface AuditResult {
  ok: boolean;
  violations: string[];
  numbers: string[];
  allowed: string[];
}

/**
 * L'auditeur. `allowed` est la liste des nombres qui ont une citation.
 * Tout chiffre qui n'y figure pas est une invention, et l'invention ne passe pas.
 */
export function auditNarration(
  text: string,
  allowed: Iterable<string>,
  identifiers: Iterable<string> = [],
): AuditResult {
  let masked = text;
  for (const id of identifiers) if (id) masked = masked.split(id).join("·");
  const set = new Set<string>();
  for (const a of allowed) {
    set.add(a);
    set.add(normalize(a));
  }
  const numbers = findNumbers(masked);
  const violations = numbers.filter((n) => !set.has(n) && !set.has(normalize(n)));
  return { ok: violations.length === 0, violations, numbers, allowed: [...set] };
}

/** Formatage stable, sans locale : le jeton ecrit est exactement le jeton cite. */
export function fmtBps(n: number): string {
  if (!Number.isFinite(n)) throw new Error("bps non fini");
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, "") || "0";
}

export class Narration {
  private parts: string[] = [];
  private cites: Citation[] = [];
  private allowed = new Set<string>();
  private idents: string[] = [];

  /**
   * Un IDENTIFIANT recopie d'une source : un nom du registre ("ClankerHookStaticFeeV2"),
   * une adresse, un pool_id. Ce n'est pas une affirmation chiffree, donc les chiffres
   * qu'il contient sont masques a l'audit — mais seulement pour CE fragment, mot pour mot.
   */
  ident(fragment: string): this {
    if (fragment.length > 0) {
      this.idents.push(fragment);
      this.parts.push(fragment);
    }
    return this;
  }

  /** De la prose. Sans chiffre. */
  text(fragment: string): this {
    const found = findNumbers(this.mask(fragment));
    if (found.length > 0) throw new UncitedNumberError(fragment, found);
    this.parts.push(fragment);
    return this;
  }

  /** Un nombre et sa provenance. Sans provenance, pas de nombre. */
  num(token: string | number, citation: Omit<Citation, "token">): this {
    const t = typeof token === "number" ? fmtBps(token) : token;
    if (!/^\d+(?:[.,]\d+)?$/.test(t)) throw new Error(`jeton numerique invalide: ${t}`);
    if (!citation.source || !citation.what)
      throw new Error("une citation doit dire d'ou vient le nombre et ce qu'il veut dire");
    this.allowed.add(t);
    this.cites.push({ token: t, ...citation });
    this.parts.push(t);
    return this;
  }

  /** Un denombrement : exact, reproductible par sa recette. */
  count(n: number, what: string, derived_from: string, source: string): this {
    if (!Number.isInteger(n) || n < 0) throw new Error("un denombrement est un entier positif");
    return this.num(String(n), { kind: "count", what, derived_from, source });
  }

  /** Une valeur en bps issue d'une ligne du jeu : elle traine tout son contexte. */
  bps(
    value: number,
    ctx: {
      measurement_id: string;
      hook: string;
      pool_id: string;
      block_number: number;
      amount_in: string;
      direction: string;
      label: Label;
      replay: string;
      source: string;
      what?: string;
    },
  ): this {
    return this.num(fmtBps(value), {
      kind: "measurement",
      what: ctx.what ?? "prelevement mesure, en points de base",
      source: ctx.source,
      measurement_id: ctx.measurement_id,
      hook: ctx.hook,
      pool_id: ctx.pool_id,
      block_number: ctx.block_number,
      amount_in: ctx.amount_in,
      direction: ctx.direction,
      label: ctx.label,
      replay: ctx.replay,
    });
  }

  /** Un seuil : il vient de la question de l'humain, pas d'une mesure. */
  threshold(n: number, what: string, source = "la question posee"): this {
    return this.num(fmtBps(n), { kind: "threshold", what, source });
  }

  block(n: number, source: string): this {
    return this.num(String(n), { kind: "block", what: "numero de bloc du fork epingle", source });
  }

  size(amount: string, source: string): this {
    return this.num(amount, { kind: "size", what: "taille du swap, en unites de base", source });
  }

  private mask(text: string): string {
    let out = text;
    for (const id of this.idents) out = out.split(id).join("·");
    return out;
  }

  build(): { text: string; citations: Citation[]; identifiers: string[] } {
    const text = this.parts.join("");
    const audit = auditNarration(text, this.allowed, this.idents);
    if (!audit.ok) throw new UncitedNumberError(text, audit.violations);
    // On publie les fragments recopies d'une source : le client peut refaire l'audit
    // exactement comme nous, sans avoir a nous croire.
    return { text, citations: this.cites, identifiers: [...new Set(this.idents)] };
  }

  get citations(): Citation[] {
    return this.cites;
  }
}

export interface SanitizeResult {
  kept: string | null;
  violations: string[];
}

/**
 * Le filtre applique a toute phrase venue d'un modele de langage.
 * On ne "corrige" pas une phrase fausse : on la jette. Une phrase corrigee garderait
 * la forme d'une affirmation que personne n'a verifiee.
 */
export function sanitizeModelSay(
  say: string | undefined,
  citations: Citation[],
  identifiers: Iterable<string> = [],
): SanitizeResult {
  if (!say || say.trim() === "") return { kept: null, violations: [] };
  const audit = auditNarration(say, citations.map((c) => c.token), identifiers);
  if (!audit.ok) return { kept: null, violations: audit.violations };
  return { kept: say.trim(), violations: [] };
}
