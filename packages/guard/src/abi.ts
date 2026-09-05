/**
 * Lecture ABI BORNEE.
 *
 * Regle dure n.3 : une lecture bornee ne produit jamais une valeur. C'est ici que la regle
 * s'applique physiquement. `Uint8Array.subarray` tronque en silence et `Buffer.readUInt32BE`
 * hors zone renvoie parfois zero : un offset ABI legerement faux donne alors une adresse de
 * hook 0x000...0, c'est-a-dire "ce swap ne passe par aucun hook" — un faux negatif parfait,
 * exactement le genre de resultat que ce projet a deja publie cinq fois.
 *
 * Toute lecture qui deborde leve OutOfBounds. Le decodeur transforme la levee en issue, et
 * la garde transforme l'issue en NOT_MEASURABLE. Jamais en zero.
 */

export class OutOfBounds extends Error {
  readonly kind = "out_of_bounds";
  constructor(what: string, offset: number, need: number, have: number) {
    super(`${what}: lecture de ${need} octets a ${offset}, la zone n'en a que ${have}`);
    this.name = "OutOfBounds";
  }
}

export class MalformedWord extends Error {
  readonly kind = "malformed_word";
  constructor(message: string) {
    super(message);
    this.name = "MalformedWord";
  }
}

const WORD = 32;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (s.length % 2 !== 0) throw new MalformedWord(`hexa de longueur impaire (${s.length})`);
  if (s.length > 0 && !/^[0-9a-fA-F]+$/.test(s)) throw new MalformedWord("hexa invalide");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "0x";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** Une fenetre sur des octets ABI. Toutes les positions sont relatives a la fenetre. */
export class Region {
  readonly bytes: Uint8Array;
  readonly name: string;

  constructor(bytes: Uint8Array, name: string) {
    this.bytes = bytes;
    this.name = name;
  }

  get length(): number {
    return this.bytes.length;
  }

  /** 32 octets a `offset`, ou une levee. Jamais un mot tronque. */
  word(offset: number): Uint8Array {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new MalformedWord(`${this.name}: offset ${offset} invalide`);
    }
    if (offset + WORD > this.bytes.length) {
      throw new OutOfBounds(this.name, offset, WORD, Math.max(0, this.bytes.length - offset));
    }
    return this.bytes.subarray(offset, offset + WORD);
  }

  uint(offset: number): bigint {
    const w = this.word(offset);
    let v = 0n;
    for (const b of w) v = (v << 8n) | BigInt(b);
    return v;
  }

  /**
   * Un uint qui sert d'index (offset ou longueur ABI). Refuse tout ce qui ne peut pas
   * indexer un tableau JavaScript : au-dela, on ne devine pas, on leve.
   */
  index(offset: number, what: string): number {
    const v = this.uint(offset);
    if (v > MAX_SAFE) throw new MalformedWord(`${this.name}: ${what} = ${v} depasse 2^53-1`);
    const n = Number(v);
    if (n > this.bytes.length) {
      throw new OutOfBounds(`${this.name}/${what}`, offset, n, this.bytes.length);
    }
    return n;
  }

  /** uint256 -> bigint, sans borne haute : c'est un montant, pas un index. */
  amount(offset: number): bigint {
    return this.uint(offset);
  }

  /**
   * Une adresse. Les 12 octets de tete DOIVENT etre nuls : un mot sale n'est pas une
   * adresse, et le silence produirait ici un hook fantome.
   */
  address(offset: number): string {
    const w = this.word(offset);
    for (let i = 0; i < 12; i++) {
      if (w[i] !== 0) {
        throw new MalformedWord(
          `${this.name}: mot a ${offset} non nul sur les 12 octets de tete, ce n'est pas une adresse`,
        );
      }
    }
    return bytesToHex(w.subarray(12, 32));
  }

  bool(offset: number): boolean {
    const v = this.uint(offset);
    if (v > 1n) throw new MalformedWord(`${this.name}: booleen a ${offset} vaut ${v}`);
    return v === 1n;
  }

  /** uint24 (le champ `fee` d'une PoolKey), refuse tout debordement. */
  uint24(offset: number): number {
    const v = this.uint(offset);
    if (v > 0xffffffn) throw new MalformedWord(`${this.name}: uint24 a ${offset} vaut ${v}`);
    return Number(v);
  }

  /** int24 (le champ `tickSpacing`), signe sur 256 bits par extension. */
  int24(offset: number): number {
    let v = this.uint(offset);
    const TWO255 = 1n << 255n;
    if (v >= TWO255) v -= 1n << 256n;
    if (v < -8388608n || v > 8388607n) {
      throw new MalformedWord(`${this.name}: int24 a ${offset} vaut ${v}`);
    }
    return Number(v);
  }

  /** Une sous-fenetre. Deborder leve : on ne rend pas une fenetre plus courte que demandee. */
  slice(offset: number, length: number, name: string): Region {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(length) || length < 0) {
      throw new MalformedWord(`${this.name}: tranche (${offset}, ${length}) invalide`);
    }
    if (offset + length > this.bytes.length) {
      throw new OutOfBounds(
        `${this.name}->${name}`,
        offset,
        length,
        Math.max(0, this.bytes.length - offset),
      );
    }
    return new Region(this.bytes.subarray(offset, offset + length), `${this.name}/${name}`);
  }

  /** Lit un `bytes` dynamique dont l'entete est a `headOffset`, offsets relatifs a `base`. */
  dynBytes(headOffset: number, base: number, name: string): Region {
    const rel = this.index(headOffset, `${name}.offset`);
    const start = base + rel;
    if (start + WORD > this.bytes.length) {
      throw new OutOfBounds(`${this.name}/${name}.len`, start, WORD, Math.max(0, this.bytes.length - start));
    }
    const len = this.index(start, `${name}.length`);
    return this.slice(start + WORD, len, name);
  }

  /**
   * Lit un `bytes[]` : chaque element porte sa propre longueur, et la fenetre rendue est
   * bornee EXACTEMENT a cette longueur. Confondre `bytes[]` et `T[]` ferait lire l'entete
   * de longueur comme un offset ABI — et ressortir une adresse de hook prise n'importe ou.
   */
  dynBytesArray(headOffset: number, base: number, name: string): Region[] {
    const rel = this.index(headOffset, `${name}.offset`);
    const start = base + rel;
    const n = this.index(start, `${name}.length`);
    const dataStart = start + WORD;
    const out: Region[] = [];
    for (let i = 0; i < n; i++) {
      const elemRel = this.index(dataStart + i * WORD, `${name}[${i}].offset`);
      const elemStart = dataStart + elemRel;
      const elemLen = this.index(elemStart, `${name}[${i}].length`);
      out.push(this.slice(elemStart + WORD, elemLen, `${name}[${i}]`));
    }
    return out;
  }

  /**
   * Lit un `T[]` dynamique (elements dynamiques) : renvoie les fenetres de chaque element,
   * chacune bornee a la fin du tableau ou au debut de l'element suivant.
   */
  dynArray(headOffset: number, base: number, name: string): Region[] {
    const rel = this.index(headOffset, `${name}.offset`);
    const start = base + rel;
    const n = this.index(start, `${name}.length`);
    const dataStart = start + WORD;
    const out: Region[] = [];
    for (let i = 0; i < n; i++) {
      const elemRel = this.index(dataStart + i * WORD, `${name}[${i}].offset`);
      const elemStart = dataStart + elemRel;
      if (elemStart > this.bytes.length) {
        throw new OutOfBounds(`${this.name}/${name}[${i}]`, elemStart, WORD, this.bytes.length);
      }
      out.push(this.slice(elemStart, this.bytes.length - elemStart, `${name}[${i}]`));
    }
    return out;
  }
}

export function regionFromHex(hex: string, name: string): Region {
  return new Region(hexToBytes(hex), name);
}
