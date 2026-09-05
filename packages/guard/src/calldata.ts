/**
 * Decodage du calldata Universal Router jusqu'aux PoolKey v4.
 *
 * Le chemin, verifie sur du calldata REEL de Base (test/fixtures/real-calldata.json) :
 *
 *   execute(bytes commands, bytes[] inputs, uint256 deadline)   0x3593564c
 *     commands[i] & 0x3f == 0x10  ->  V4_SWAP
 *       inputs[i] = abi.encode(bytes actions, bytes[] params)
 *         actions[j] == 0x06 SWAP_EXACT_IN_SINGLE / 0x08 SWAP_EXACT_OUT_SINGLE
 *           params[j] = abi.encode(struct{ PoolKey; bool; uint128; uint128; bytes })
 *             mot 0 : 0x20 (la struct est dynamique, hookData est un bytes)
 *             0x20 currency0 | 0x40 currency1 | 0x60 fee | 0x80 tickSpacing
 *             0xa0 HOOKS  <- l'adresse du hook, octets 0xa0..0xc0
 *             0xc0 zeroForOne | 0xe0 amount | 0x100 amountLimit | 0x120 offset(hookData)
 *         actions[j] == 0x07 SWAP_EXACT_IN / 0x09 SWAP_EXACT_OUT
 *           params[j] = abi.encode(struct{ Currency; PathKey[]; uint128; uint128 })
 *             chaque PathKey : intermediateCurrency | fee | tickSpacing | HOOKS | hookData
 *
 * Le bit 0x80 d'une commande est FLAG_ALLOW_REVERT, on masque sur 0x3f.
 *
 * Ce qui n'est pas lu jusqu'au bout ne devient pas un swap sans hook : cela devient une
 * `issue`, et le rapport final n'est plus `complete`.
 */
import { Region, regionFromHex, OutOfBounds, MalformedWord, bytesToHex } from "./abi.js";
import { poolId, sortCurrencies, ZERO_ADDRESS } from "./poolkey.js";
import type { DecodeIssue, DecodeResult, PoolKey, SwapActionName, SwapLeg } from "./types.js";

/** execute(bytes,bytes[],uint256) */
export const SELECTOR_EXECUTE_DEADLINE = "0x3593564c";
/** execute(bytes,bytes[]) */
export const SELECTOR_EXECUTE = "0x24856bc3";

export const COMMAND_V4_SWAP = 0x10;
export const COMMAND_EXECUTE_SUB_PLAN = 0x21;

export const ACTIONS: Record<number, SwapActionName> = {
  0x06: "SWAP_EXACT_IN_SINGLE",
  0x07: "SWAP_EXACT_IN",
  0x08: "SWAP_EXACT_OUT_SINGLE",
  0x09: "SWAP_EXACT_OUT",
};

function why(e: unknown): string {
  if (e instanceof OutOfBounds) return `lecture_bornee:${e.message}`;
  if (e instanceof MalformedWord) return `mot_malforme:${e.message}`;
  return `erreur:${e instanceof Error ? e.message : String(e)}`;
}

function makeLeg(
  at: { command: number; action: number; hop: number },
  actionName: SwapActionName,
  key: PoolKey,
  zeroForOne: boolean,
  exactIn: boolean,
  amountIn: bigint | null,
  amountOut: bigint | null,
): SwapLeg {
  const openDelta = (amountIn !== null && amountIn === 0n) || (amountOut !== null && amountOut === 0n);
  if (openDelta) {
    amountIn = null;
    amountOut = null;
  }
  return {
    at,
    actionName,
    poolKey: key,
    poolId: poolId(key),
    zeroForOne,
    direction: zeroForOne ? "0->1" : "1->0",
    exactIn,
    amountIn: amountIn === null ? null : amountIn.toString(),
    amountOut: amountOut === null ? null : amountOut.toString(),
    amountIsOpenDelta: openDelta,
  };
}

/**
 * SWAP_EXACT_IN_SINGLE (0x06) et SWAP_EXACT_OUT_SINGLE (0x08).
 * Les deux structs ont exactement la meme disposition : PoolKey, bool, uint128, uint128, bytes.
 */
function decodeSingle(
  p: Region,
  at: { command: number; action: number; hop: number },
  actionName: SwapActionName,
): SwapLeg {
  const body = p.index(0x00, "struct.offset"); // vaut 0x20 en pratique, on le lit quand meme
  const key: PoolKey = {
    currency0: p.address(body + 0x00),
    currency1: p.address(body + 0x20),
    fee: p.uint24(body + 0x40),
    tickSpacing: p.int24(body + 0x60),
    hooks: p.address(body + 0x80),
  };
  const zeroForOne = p.bool(body + 0xa0);
  const amount = p.amount(body + 0xc0);
  const exactIn = actionName === "SWAP_EXACT_IN_SINGLE";
  return makeLeg(at, actionName, key, zeroForOne, exactIn, exactIn ? amount : null, exactIn ? null : amount);
}

/**
 * SWAP_EXACT_IN (0x07) : { Currency currencyIn; PathKey[] path; uint128 amountIn; uint128 min }
 * On avance le long du chemin. Seul le premier saut a un montant d'entree connu : les suivants
 * dependent de l'execution, on ecrit null plutot qu'une estimation.
 */
function decodeExactInPath(
  p: Region,
  command: number,
  action: number,
): SwapLeg[] {
  const body = p.index(0x00, "struct.offset");
  let currencyIn = p.address(body + 0x00);
  const path = p.dynArray(body + 0x20, body, "path");
  const amountIn = p.amount(body + 0x40);
  const legs: SwapLeg[] = [];
  for (let hop = 0; hop < path.length; hop++) {
    const e = path[hop]!;
    const currencyOut = e.address(0x00);
    const { currency0, currency1 } = sortCurrencies(currencyIn, currencyOut);
    const key: PoolKey = {
      currency0,
      currency1,
      fee: e.uint24(0x20),
      tickSpacing: e.int24(0x40),
      hooks: e.address(0x60),
    };
    legs.push(
      makeLeg(
        { command, action, hop },
        "SWAP_EXACT_IN",
        key,
        currencyIn === currency0,
        true,
        hop === 0 ? amountIn : null,
        null,
      ),
    );
    currencyIn = currencyOut;
  }
  return legs;
}

/**
 * SWAP_EXACT_OUT (0x09) : { Currency currencyOut; PathKey[] path; uint128 amountOut; uint128 max }
 * Le routeur remonte le chemin a l'envers ; seul le dernier saut a un montant de sortie connu.
 */
function decodeExactOutPath(
  p: Region,
  command: number,
  action: number,
): SwapLeg[] {
  const body = p.index(0x00, "struct.offset");
  let currencyOut = p.address(body + 0x00);
  const path = p.dynArray(body + 0x20, body, "path");
  const amountOut = p.amount(body + 0x40);
  const legs: SwapLeg[] = [];
  for (let hop = path.length - 1; hop >= 0; hop--) {
    const e = path[hop]!;
    const currencyIn = e.address(0x00);
    const { currency0, currency1 } = sortCurrencies(currencyIn, currencyOut);
    const key: PoolKey = {
      currency0,
      currency1,
      fee: e.uint24(0x20),
      tickSpacing: e.int24(0x40),
      hooks: e.address(0x60),
    };
    legs.push(
      makeLeg(
        { command, action, hop },
        "SWAP_EXACT_OUT",
        key,
        currencyIn === currency0,
        false,
        null,
        hop === path.length - 1 ? amountOut : null,
      ),
    );
    currencyOut = currencyIn;
  }
  return legs.reverse();
}

/** Le contenu d'un input V4_SWAP : abi.encode(bytes actions, bytes[] params). */
function decodeV4Swap(input: Region, command: number, legs: SwapLeg[], issues: DecodeIssue[]): void {
  const actions = input.dynBytes(0x00, 0, "actions");
  const params = input.dynBytesArray(0x20, 0, "params");
  if (actions.length !== params.length) {
    issues.push({
      where: `commande[${command}]`,
      reason: `actions_params_desaccord:${actions.length}!=${params.length}`,
    });
  }
  const n = Math.min(actions.length, params.length);
  for (let j = 0; j < n; j++) {
    const code = actions.bytes[j]!;
    const name = ACTIONS[code];
    if (!name) continue; // SETTLE / TAKE / ... : rien a mesurer, ce ne sont pas des swaps
    const p = params[j]!;
    try {
      if (name === "SWAP_EXACT_IN_SINGLE" || name === "SWAP_EXACT_OUT_SINGLE") {
        legs.push(decodeSingle(p, { command, action: j, hop: 0 }, name));
      } else if (name === "SWAP_EXACT_IN") {
        legs.push(...decodeExactInPath(p, command, j));
      } else {
        legs.push(...decodeExactOutPath(p, command, j));
      }
    } catch (e) {
      issues.push({ where: `commande[${command}].action[${j}] ${name}`, reason: why(e) });
    }
  }
}

export interface DecodeCalldataOptions {
  /** profondeur restante pour EXECUTE_SUB_PLAN (un sous-plan est un execute imbrique) */
  depth?: number;
}

/**
 * Decode le calldata d'un `execute` d'Universal Router. Ne leve jamais : tout ce qui resiste
 * ressort dans `issues` et fait tomber `complete` a false.
 */
export function decodeUniversalRouterCalldata(
  calldata: string,
  opts: DecodeCalldataOptions = {},
): DecodeResult {
  const depth = opts.depth ?? 2;
  const issues: DecodeIssue[] = [];
  const legs: SwapLeg[] = [];
  let selector = "0x";
  let commandsHex = "0x";

  let all: Region;
  try {
    all = regionFromHex(calldata, "calldata");
  } catch (e) {
    return {
      complete: false,
      router: "not-universal-router",
      selector,
      commands: commandsHex,
      legs,
      issues: [{ where: "calldata", reason: why(e) }],
    };
  }
  if (all.length < 4) {
    return {
      complete: false,
      router: "not-universal-router",
      selector,
      commands: commandsHex,
      legs,
      issues: [{ where: "calldata", reason: `trop_court:${all.length}_octets` }],
    };
  }
  selector = bytesToHex(all.bytes.subarray(0, 4));
  if (selector !== SELECTOR_EXECUTE_DEADLINE && selector !== SELECTOR_EXECUTE) {
    return {
      complete: true,
      router: "not-universal-router",
      selector,
      commands: commandsHex,
      legs,
      issues: [],
    };
  }

  const args = all.slice(4, all.length - 4, "args");
  try {
    const commands = args.dynBytes(0x00, 0, "commands");
    commandsHex = bytesToHex(commands.bytes);
    const inputs = args.dynBytesArray(0x20, 0, "inputs");
    if (commands.length !== inputs.length) {
      issues.push({
        where: "execute",
        reason: `commands_inputs_desaccord:${commands.length}!=${inputs.length}`,
      });
    }
    const n = Math.min(commands.length, inputs.length);
    for (let i = 0; i < n; i++) {
      const cmd = commands.bytes[i]! & 0x3f;
      if (cmd === COMMAND_V4_SWAP) {
        try {
          decodeV4Swap(inputs[i]!, i, legs, issues);
        } catch (e) {
          issues.push({ where: `commande[${i}] V4_SWAP`, reason: why(e) });
        }
      } else if (cmd === COMMAND_EXECUTE_SUB_PLAN) {
        // un sous-plan est un execute() complet reencode : on descend, borne en profondeur
        if (depth <= 0) {
          issues.push({ where: `commande[${i}] EXECUTE_SUB_PLAN`, reason: "profondeur_epuisee" });
          continue;
        }
        try {
          const sub = inputs[i]!;
          const subCmds = sub.dynBytes(0x00, 0, "sub.commands");
          const subInputs = sub.dynBytesArray(0x20, 0, "sub.inputs");
          const m = Math.min(subCmds.length, subInputs.length);
          for (let k = 0; k < m; k++) {
            if ((subCmds.bytes[k]! & 0x3f) !== COMMAND_V4_SWAP) continue;
            try {
              decodeV4Swap(subInputs[k]!, i, legs, issues);
            } catch (e) {
              issues.push({ where: `sous-plan[${i}][${k}]`, reason: why(e) });
            }
          }
        } catch (e) {
          issues.push({ where: `commande[${i}] EXECUTE_SUB_PLAN`, reason: why(e) });
        }
      }
    }
  } catch (e) {
    issues.push({ where: "execute", reason: why(e) });
    return {
      complete: false,
      router: "universal-router",
      selector,
      commands: commandsHex,
      legs,
      issues,
    };
  }

  return {
    complete: issues.length === 0,
    router: "universal-router",
    selector,
    commands: commandsHex,
    legs,
    issues,
  };
}

export { ZERO_ADDRESS };
