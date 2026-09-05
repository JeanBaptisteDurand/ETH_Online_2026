/**
 * @tare/guard — la garde TARE.
 *
 * TARE mesure ce qu'un hook Uniswap v4 prend sur un swap : sur un fork epingle, le bytecode du
 * hook est remplace par un stub inerte de 89 octets conforme a Hooks.sol, le meme swap est cote
 * deux fois, l'ecart EST le prelevement. Ce paquet ne mesure rien : il CONSULTE les 995 mesures
 * du bloc 50 614 000 avant que tu ne signes.
 *
 *   import { tareGuard, gate, confirmApprover } from "@tare/guard";
 *   const report = tareGuard(txRequest);
 *   const decision = await gate(report, confirmApprover);
 */
export { tareGuard, TABLE, UNIVERSAL_ROUTER_BASE, DEFAULT_ROUTERS } from "./guard.js";
export {
  decodeUniversalRouterCalldata,
  SELECTOR_EXECUTE,
  SELECTOR_EXECUTE_DEADLINE,
  COMMAND_V4_SWAP,
  ACTIONS,
} from "./calldata.js";
export { poolId, encodePoolKey, sortCurrencies, ZERO_ADDRESS } from "./poolkey.js";
export { keccak256, toHex } from "./keccak.js";
export { Region, OutOfBounds, MalformedWord, hexToBytes, bytesToHex } from "./abi.js";
export { assertTable, consult, hookContext, BadTable } from "./table.js";
export type { GuardTable, TablePool, TablePoint, TableHook, Consultation } from "./table.js";
export { DEFAULT_THRESHOLDS, gradeBps, gradeConsultation, worstVerdict } from "./verdict.js";
export type { Thresholds } from "./verdict.js";
export {
  gate,
  renderPrompt,
  confirmApprover,
  alwaysApprove,
  alwaysDeny,
  ledgerApprover,
} from "./approver.js";
export type { Approver, ApprovalDecision, LedgerTransport, GateOptions } from "./approver.js";
export {
  encodeUniversalRouterExactInSingle,
  encodeExactInSingleParams,
} from "./encode.js";
export type { ExactInSingle, EncodeSwapOptions } from "./encode.js";
export * from "./types.js";

/**
 * La couche navigateur vit dans "@tare/guard/browser" : elle touche au DOM et a
 * window.ethereum, et n'a rien a faire dans un import cote serveur.
 */
