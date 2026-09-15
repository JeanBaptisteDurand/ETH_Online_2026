// LA FRONTIERE VERS packages/guard. Un seul fichier, et il ne fait QUE reexporter.
//
// POURQUOI ELLE EXISTE, et pourquoi elle est en .mjs. La page de demonstration ne reecrit
// pas la garde : elle l'APPELLE. Mais `apps/web/tsconfig.app.json` compile avec
// `noUnusedLocals`, et deux fichiers du paquet — alternative.ts et guard-sans-table.ts —
// portent chacun un parametre inutilise. Ils sont justes, ils sont testes, et le depot est
// gele depuis le rendu : on ne les touche pas. Or `types.ts` reference
// `import("./alternative.js").Alternative`, donc le moindre import de type tire le fichier
// fautif dans le programme et fait echouer `tsc -b`.
//
// La reponse est la meme que pour `src/data/codec.mjs` : un module JS, que tsc ne verifie
// pas (allowJs est faux), et une frontiere de types ecrite a cote, dans garde.d.mts. Le
// CODE reste celui du paquet, a l'octet pres ; seules les SIGNATURES sont redites.
//
// L'extension est .ts et non .js sur les chemins ci-dessous : Vite ne rejoue la substitution
// « .js -> .ts » que lorsque l'importateur est lui-meme un fichier TypeScript. Depuis un
// .mjs, `./calldata.js` ne resoudrait rien et le bundle casserait au build, pas ici.
//
// data/table.json (21 Mo) N'EST JAMAIS ATTEINT : on importe guard-sans-table.ts et non
// guard.ts, et la table est reconstruite depuis le corpus deja embarque (voir table.ts).

export {
  decodeUniversalRouterCalldata,
  ACTIONS,
  SELECTOR_EXECUTE_DEADLINE,
  COMMAND_V4_SWAP,
} from '../../../../packages/guard/src/calldata.ts'
export { poolId, encodePoolKey, ZERO_ADDRESS } from '../../../../packages/guard/src/poolkey.ts'
export { assertTable, consult, hookContext } from '../../../../packages/guard/src/table.ts'
export { thresholdsFor, gradeConsultation, gradeBps } from '../../../../packages/guard/src/verdict.ts'
export { chercherAlternative, ECONOMIE_MIN_BPS } from '../../../../packages/guard/src/alternative.ts'
export {
  transactionDeRemplacement,
  plancher,
  TOLERANCE_BPS,
  ECHEANCE_SECONDES,
} from '../../../../packages/guard/src/envoi.ts'
export { encodeUniversalRouterExactInSingle } from '../../../../packages/guard/src/encode.ts'
export {
  PERMIT2,
  COMMAND_PERMIT2_PERMIT,
  UNIVERSAL_ROUTER_BASE,
} from '../../../../packages/guard/src/permit2.ts'
/**
 * L'INTERCEPTION REELLE. `envelopperProvider` est la piece qui fait tout le produit : elle
 * enveloppe un fournisseur EIP-1193 et n'arrete QUE `eth_sendTransaction`. La page de
 * demonstration l'utilise telle quelle — elle ne la simule pas. Montrer une interception
 * simulee dans une demonstration dont le sujet EST l'interception serait la faute la plus
 * chere possible.
 *
 * `guard-sans-table.ts` et non `guard.ts` : le second inline data/table.json, 21 Mo.
 */
export { envelopperProvider, UserRejectedByGuard } from '../../../../packages/guard/src/injection.ts'
export { tareGuard } from '../../../../packages/guard/src/guard-sans-table.ts'
