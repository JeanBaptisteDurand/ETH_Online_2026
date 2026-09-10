/**
 * LA GARDE, AVEC LA TABLE DU PAQUET.
 *
 *   import { tareGuard } from "@tare/guard";
 *   const rapport = tareGuard(txRequest);
 *
 * Tout le raisonnement vit dans ./guard-sans-table.ts, ou `options.table` est obligatoire.
 * Ce fichier-ci n'ajoute qu'une chose : la table embarquee comme defaut.
 *
 * POURQUOI LES DEUX EXISTENT. `data/table.json` pese 21 Mo et esbuild l'inline dans tout
 * bundle qui l'atteint, meme indirectement. Le script de contenu de l'extension pesait donc
 * 21,9 Mo et faisait parser cette source a V8 sur CHAQUE page, a document_start. Le service
 * worker de l'extension importe la version sans table et charge la table par `fetch`, une
 * fois par vie du worker. Un appelant en Node ou dans un dapp, lui, importe ce fichier.
 */
import { tareGuard as garde } from "./guard-sans-table.js";
import { assertTable, type GuardTable } from "./table.js";
import type { GuardOptions, GuardReport, TxRequest } from "./types.js";
import builtinTable from "../data/table.json" with { type: "json" };

export { UNIVERSAL_ROUTER_BASE, DEFAULT_ROUTERS } from "./guard-sans-table.js";

/** Les 125 072 mesures du bloc 50 614 000, telles qu'elles sont livrees avec le paquet. */
export const TABLE: GuardTable = assertTable(builtinTable);

/** La garde, table du paquet par defaut. `options.table` la remplace. */
export function tareGuard(tx: TxRequest, options: GuardOptions = {}): GuardReport {
  return garde(tx, { ...options, table: options.table ?? TABLE });
}
