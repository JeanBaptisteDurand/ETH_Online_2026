/**
 * @tare/guard — la garde TARE.
 *
 * TARE mesure ce qu'un hook Uniswap v4 prend sur un swap : sur un fork epingle, le bytecode du
 * hook est remplace par un stub inerte de 89 octets conforme a Hooks.sol, le meme swap est cote
 * deux fois, l'ecart EST le prelevement. Ce paquet ne mesure rien : il CONSULTE les 125 072 mesures
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
// La porte de remplacement : la seule piece qui touche a une transaction au moment ou elle
// part. Elle CONSTRUIT le calldata, elle ne l'envoie jamais.
export { chercherAlternative, jetonDuPool, ECONOMIE_MIN_BPS } from "./alternative.js";
// Permit2 : une seule signature au lieu de deux transactions. Il ne rend pas la substitution
// possible — elle l'est deja — il la rend supportable pour l'utilisateur.
export {
  PERMIT2,
  COMMAND_PERMIT2_PERMIT,
  MONTANT_MAX_PERMIT2,
  domaineHash,
  digestPermit,
  messageTypeAsigner,
  encodePermit2PermitInput,
  calldataApprobation,
  besoin as besoinPermit2,
} from "./permit2.js";
export type { PermitSingle, DetailsPermit, EtatPermit2, Besoin } from "./permit2.js";
export type { Alternative, EtatAlternative, Porte } from "./alternative.js";
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
/**
 * Le chemin Ledger. Les paquets @ledgerhq ne sont charges qu'a l'ouverture reelle d'un
 * appareil (import() dynamique dans ledger.ts) : importer @tare/guard n'en tire aucun octet.
 */
export {
  ledgerEip712Approver,
  ledgerWebHidTransport,
  openWebHidDevice,
  buildGuardTypedData,
  encodeSignature,
  isUserRejection,
  promptDigest,
  takeField,
  labelField,
  swapSizeField,
  freshnessField,
  datasetField,
  TARE_GUARD_TYPES,
  TARE_GUARD_PRIMARY_TYPE,
  LEDGER_DEFAULT_PATH,
  LEDGER_STATUS_USER_REJECTED,
} from "./ledger.js";
export type {
  Eip712Field,
  Eip712TypedData,
  TypedDataOptions,
  LedgerTransportOptions,
  DeviceSignature,
  DeviceSession,
  OpenDevice,
  EthLike,
} from "./ledger.js";
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
