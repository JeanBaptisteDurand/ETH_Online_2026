/**
 * L'encodeur inverse du decodeur : PoolKey -> calldata Universal Router.
 *
 * A quoi il sert, et a quoi il ne sert PAS. Il ne sert pas a envoyer des transactions. Il sert
 * a fabriquer, a partir de PoolKey REELLES lues sur la chaine (docs/dataset/measurements.jsonl),
 * le calldata d'un swap que la page d'exemple declenche et que les tests rejouent. Les
 * transactions reellement capturees sur Base sont dans test/fixtures/real-calldata.json ; celles
 * fabriquees ici portent une PoolKey reelle dans une enveloppe synthetique, et les tests le
 * disent noir sur blanc.
 *
 * Le fait qu'encoder puis decoder redonne exactement la PoolKey de depart est teste sur les
 * 7 817 pools du jeu : c'est ce qui garantit que la lecture des octets 0xa0..0xc0 n'est pas un
 * coup de chance sur un echantillon.
 */
import type { PoolKey } from "./types.js";
import { SELECTOR_EXECUTE_DEADLINE } from "./calldata.js";

const WORD = 32;

function word(v: bigint | number): Uint8Array {
  let x = BigInt(v);
  if (x < 0n) x += 1n << 256n;
  const o = new Uint8Array(WORD);
  for (let i = 31; i >= 0; i--) {
    o[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return o;
}

function addrWord(a: string): Uint8Array {
  const o = new Uint8Array(WORD);
  const s = a.toLowerCase().replace(/^0x/, "");
  if (s.length !== 40) throw new Error(`adresse invalide: ${a}`);
  for (let i = 0; i < 20; i++) o[12 + i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return o;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** un `bytes` dynamique : longueur puis contenu, remonte a un multiple de 32 */
function dynBytes(b: Uint8Array): Uint8Array {
  const pad = (WORD - (b.length % WORD)) % WORD;
  return concat([word(b.length), b, new Uint8Array(pad)]);
}

/** abi.encode(bytes[]) : tete d'offsets puis les elements */
function bytesArray(items: Uint8Array[]): Uint8Array {
  const encoded = items.map(dynBytes);
  const head: Uint8Array[] = [];
  let off = items.length * WORD;
  for (const e of encoded) {
    head.push(word(off));
    off += e.length;
  }
  return concat([word(items.length), ...head, ...encoded]);
}

export interface ExactInSingle {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum?: bigint;
  hookData?: Uint8Array;
}

/** abi.encode(IV4Router.ExactInputSingleParams) — la disposition lue par le decodeur */
export function encodeExactInSingleParams(p: ExactInSingle): Uint8Array {
  const hookData = p.hookData ?? new Uint8Array(0);
  const body = concat([
    addrWord(p.poolKey.currency0),
    addrWord(p.poolKey.currency1),
    word(p.poolKey.fee),
    word(p.poolKey.tickSpacing),
    addrWord(p.poolKey.hooks),
    word(p.zeroForOne ? 1 : 0),
    word(p.amountIn),
    word(p.amountOutMinimum ?? 0n),
    word(0x120), // offset de hookData, relatif au debut de la struct
    dynBytes(hookData),
  ]);
  return concat([word(0x20), body]);
}

export interface EncodeSwapOptions {
  deadline?: bigint;
  /** actions ajoutees apres le swap ; par defaut SETTLE_ALL (0x0c) et TAKE_ALL (0x0f) */
  settleTake?: boolean;
}

/**
 * Un `execute(bytes,bytes[],uint256)` complet portant un V4_SWAP / SWAP_EXACT_IN_SINGLE.
 * C'est la forme exacte observee sur Base (voir test/fixtures/real-calldata.json).
 */
export function encodeUniversalRouterExactInSingle(
  swaps: ExactInSingle[],
  opts: EncodeSwapOptions = {},
): string {
  if (swaps.length === 0) throw new Error("au moins un swap");
  const settleTake = opts.settleTake ?? true;
  const actions: number[] = swaps.map(() => 0x06);
  const params: Uint8Array[] = swaps.map(encodeExactInSingleParams);
  if (settleTake) {
    const first = swaps[0]!;
    const inCur = first.zeroForOne ? first.poolKey.currency0 : first.poolKey.currency1;
    const outCur = first.zeroForOne ? first.poolKey.currency1 : first.poolKey.currency0;
    actions.push(0x0c); // SETTLE_ALL(currency, maxAmount)
    params.push(concat([addrWord(inCur), word(first.amountIn)]));
    actions.push(0x0f); // TAKE_ALL(currency, minAmount)
    params.push(concat([addrWord(outCur), word(0)]));
  }

  const v4Input = concat([
    word(0x40),
    word(0x40 + dynBytes(Uint8Array.from(actions)).length),
    dynBytes(Uint8Array.from(actions)),
    bytesArray(params),
  ]);

  const commands = Uint8Array.from([0x10]);
  const inputs = [v4Input];
  const argsHead = concat([word(0x60), word(0x60 + dynBytes(commands).length), word(opts.deadline ?? 0xffffffffn)]);
  const args = concat([argsHead, dynBytes(commands), bytesArray(inputs)]);

  const sel = SELECTOR_EXECUTE_DEADLINE.slice(2);
  const selBytes = Uint8Array.from([0, 2, 4, 6].map((i) => parseInt(sel.slice(i, i + 2), 16)));
  const all = concat([selBytes, args]);
  return "0x" + Array.from(all, (b) => b.toString(16).padStart(2, "0")).join("");
}
