/**
 * LA GARDE, SANS LA TABLE EMBARQUEE.
 *
 * Meme code que ./guard.ts, a une chose pres : `options.table` est OBLIGATOIRE ici, parce que
 * ce fichier n'importe pas data/table.json. C'est ce qui permet au service worker de
 * l'extension de charger la table par `fetch` au premier swap, au lieu de la faire inliner
 * dans un script de contenu de 21,9 Mo qui tourne sur chaque page.
 *
 * Ce qui suit decrit la garde elle-meme, et vaut pour les deux chemins.
 *
 * tareGuard(txRequest) — la garde.
 *
 * Elle intercepte un swap Uniswap v4 AVANT signature, lit la PoolKey dans le calldata, en tire
 * l'adresse du hook (octets 0xa0..0xc0 de params[j] pour les actions "single"), consulte la
 * table pre-calculee et rend un verdict cite.
 *
 * Elle ne mesure jamais en direct : ~9 s a froid, et un seul mesureur par noeud anvil parce que
 * le stub est de l'etat global. C'est une CONSULTATION, et le rapport le dit : chaque nombre
 * porte son bloc, sa taille, son sens et sa commande de rejeu.
 *
 * Elle ne leve pas. Tout ce qu'elle n'a pas su lire ressort en `warnings` et fait tomber
 * `complete` — un calldata a moitie lu ne devient jamais "aucun hook detecte".
 */
import { decodeUniversalRouterCalldata } from "./calldata.js";
import { ZERO_ADDRESS } from "./poolkey.js";
import { assertTable, consult, type GuardTable } from "./table.js";
import { thresholdsFor, gradeConsultation, worstVerdict, type Thresholds } from "./verdict.js";
import type { Finding, GuardOptions, GuardReport, SwapLeg, TableHit, TxRequest, Verdict } from "./types.js";
import { chercherAlternative } from "./alternative.js";

/** Universal Router sur Base (chain 8453). */
export const UNIVERSAL_ROUTER_BASE = "0x6ff5693b99212da76ad316178a184ab56d299b43";
export const DEFAULT_ROUTERS = [UNIVERSAL_ROUTER_BASE];

function pct(bps: number): string {
  return `${(bps / 100).toFixed(2)} %`;
}

function fmtBps(bps: number): string {
  return `${bps.toFixed(2)} bps`;
}

/** La commande de rejeu, dans la forme utilisee par apps/api/src/measurement.ts. */
function replayFor(table: GuardTable, h: TableHit): string | null {
  const pool = table.pools[h.poolId];
  if (!pool) return null;
  return [
    "python3 apps/api/scripts/measure_one.py",
    "--rpc $RPC",
    `--block ${h.blockNumber}`,
    `--hooks ${pool.hook}`,
    `--currency0 ${pool.currency0}`,
    `--currency1 ${pool.currency1}`,
    `--fee ${pool.fee}`,
    `--tick-spacing ${pool.tick_spacing}`,
    `--zero-for-one ${h.direction === "0->1"}`,
    `--amount-in ${h.amountIn}`,
  ].join(" ");
}

function sentenceFor(
  leg: SwapLeg,
  label: Finding["label"],
  bps: number | null,
  basis: Finding["basis"],
  citations: TableHit[],
  hookCtx: Finding["hookContext"],
  table: GuardTable,
): string {
  const hook = leg.poolKey.hooks;
  if (hook === ZERO_ADDRESS) return "Ce swap ne passe par aucun hook : il n'y a rien a prelever.";

  const short = `${hook.slice(0, 10)}…`;
  if (bps !== null && basis === "exact") {
    return `Le hook ${short} prend ${fmtBps(bps)} (${pct(bps)}) a ta taille exacte de ${leg.amountIn}, mesure au bloc ${citations[0]?.blockNumber ?? table.block_number}.`;
  }
  if (bps !== null && basis === "interpolated") {
    const a = citations[0];
    const b = citations[1];
    return `Le hook ${short} prend environ ${fmtBps(bps)} (${pct(bps)}) a ta taille, interpole entre ${a?.amountIn} (${a?.bps?.toFixed(2)} bps) et ${b?.amountIn} (${b?.bps?.toFixed(2)} bps), mesures au bloc ${table.block_number}.`;
  }
  if (basis === "evidence") {
    const best = citations.filter((c) => c.bps !== null).sort((x, y) => (y.bps ?? 0) - (x.bps ?? 0))[0]
      ?? hookCtx?.measured?.worst;
    if (best && best.bps !== null) {
      const same = best.poolId === leg.poolId;
      const ou = same ? "sur ce pool" : "sur un autre pool du meme hook";
      return `Ta taille n'a pas ete mesuree ici, donc TARE ne chiffre rien pour ce swap. Ce qui est mesure : le hook ${short} a pris ${fmtBps(best.bps)} ${ou}, a la taille ${best.amountIn}, sens ${best.direction}, au bloc ${best.blockNumber}.`;
    }
  }
  if (hookCtx) {
    const l = Object.entries(hookCtx.labels).map(([k, v]) => `${k}:${v}`).join(", ");
    return `Le hook ${short} est dans la table (${hookCtx.nMeasurements} mesures, ${l}) mais aucune ne porte de nombre : NOT_MEASURABLE, pas zero.`;
  }
  return `Le hook ${short} est absent de la table TARE (bloc ${table.block_number}). TARE ne sait pas ce qu'il prend — ce n'est pas la meme chose que "il ne prend rien".`;
}

function findingFor(leg: SwapLeg, table: GuardTable, th: Thresholds): Finding {
  const hook = leg.poolKey.hooks.toLowerCase();
  const noHook = hook === ZERO_ADDRESS;

  if (noHook) {
    return {
      leg,
      hook,
      label: "NOT_MEASURABLE",
      bps: null,
      reason: "aucun_hook:la_poolkey_porte_l_adresse_nulle",
      basis: "none",
      citations: [],
      hookContext: null,
      verdict: "ok",
      sentence: sentenceFor(leg, "NOT_MEASURABLE", null, "none", [], null, table),
      replay: null,
    };
  }

  const c = consult(table, leg.poolId, hook, leg.direction, leg.amountIn);
  const graded = gradeConsultation(c, th, true);
  const replaySource = c.citations[0] ?? c.hookContext?.measured?.worst ?? null;

  return {
    leg,
    hook,
    label: c.label,
    bps: c.bps,
    reason: c.reason,
    basis: c.basis,
    citations: c.citations,
    hookContext: c.hookContext,
    verdict: graded.verdict,
    sentence: sentenceFor(leg, c.label, c.bps, c.basis, c.citations, c.hookContext, table),
    replay: replaySource ? replayFor(table, replaySource) : null,
  };
}

function calldataOf(tx: TxRequest): string | null {
  const d = tx.data ?? tx.input ?? null;
  if (typeof d !== "string" || d.length === 0) return null;
  return d;
}

function headlineOf(verdict: Verdict, findings: Finding[], warnings: string[]): string {
  const hooked = findings.filter((f) => f.hook !== ZERO_ADDRESS);
  if (hooked.length === 0) {
    return warnings.length
      ? "Aucun hook lu dans ce calldata, mais il n'a pas ete lu jusqu'au bout — TARE ne conclut pas."
      : "Aucun hook dans ce swap.";
  }
  const worst = hooked.reduce((a, b) => {
    const av = a.bps ?? -1;
    const bv = b.bps ?? -1;
    return bv > av ? b : a;
  });
  if (worst.bps !== null) {
    const b = worst.citations[0]?.blockNumber ?? 0;
    return `Ce hook prend ${fmtBps(worst.bps)} a ta taille, mesure au bloc ${b}. Continuer ?`;
  }
  const ev = hooked
    .flatMap((f) => f.citations)
    .filter((c) => c.bps !== null)
    .sort((x, y) => (y.bps ?? 0) - (x.bps ?? 0))[0];
  if (ev && ev.bps !== null) {
    return `TARE n'a pas mesure ce pool a cette taille. Le meme hook a pris ${fmtBps(ev.bps)} ailleurs, au bloc ${ev.blockNumber}. Continuer ?`;
  }
  return `Hook ${hooked[0]!.hook.slice(0, 10)}… inconnu de TARE : impossible de dire ce qu'il prend. Continuer ?`;
}

/**
 * Le point d'entree. Ne leve jamais, ne mesure jamais, ne devine jamais un nombre.
 */
export function tareGuard(tx: TxRequest, options: GuardOptions & { table: unknown }): GuardReport {
  const table = assertTable(options.table);
  // Les seuils viennent de la TABLE : ce sont SES centiles, recalcules a chaque construction.
  // Ecrits dans le code, ils redeviendraient faux au prochain balayage — c'est exactement ce
  // qui est arrive aux precedents, absolus, qui bloquaient la transaction mediane du corpus.
  const derives = thresholdsFor(table);
  const th: Thresholds = {
    warnBps: options.warnBps ?? derives.warnBps,
    blockBps: options.blockBps ?? derives.blockBps,
  };
  const routers = (options.routers ?? DEFAULT_ROUTERS).map((r) => r.toLowerCase());
  const warnings: string[] = [];

  const meta = {
    schema: table.schema,
    generatedAt: table.generated_at,
    source: table.source,
    engineVer: table.engine_ver,
    stubHash: table.stub_hash,
    chainId: table.chain_id,
    blockNumber: table.block_number,
    nMeasurements: table.n_measurements,
    nHooks: table.n_hooks,
    nPools: table.n_pools,
  };
  const atBlock = options.atBlock ?? null;
  const staleness = {
    tableBlock: table.block_number,
    atBlock,
    blocksBehind: atBlock === null ? null : atBlock - table.block_number,
  };
  if (staleness.blocksBehind !== null && staleness.blocksBehind > 0) {
    warnings.push(
      `table_en_retard:${staleness.blocksBehind}_blocs (mesures au ${table.block_number}, chaine au ${atBlock})`,
    );
  }

  const data = calldataOf(tx);
  const empty = {
    complete: false,
    router: "not-universal-router" as const,
    selector: "0x",
    commands: "0x",
    legs: [],
    issues: [] as { where: string; reason: string }[],
  };

  if (!data) {
    warnings.push("pas_de_calldata:transaction_sans_donnees");
    return {
      verdict: "ok",
      complete: true,
      decode: { ...empty, complete: true },
      findings: [],
      table: meta,
      staleness,
      headline: "Cette transaction ne porte pas de calldata : ce n'est pas un swap v4.",
      alternative: null,
      warnings,
    };
  }

  const to = typeof tx.to === "string" ? tx.to.toLowerCase() : null;
  if (to !== null && routers.length > 0 && !routers.includes(to)) {
    warnings.push(`destinataire_hors_liste:${to}`);
  }

  const decode = decodeUniversalRouterCalldata(data);
  for (const i of decode.issues) warnings.push(`${i.where}: ${i.reason}`);

  if (decode.router === "not-universal-router") {
    return {
      verdict: "ok",
      complete: decode.complete,
      decode,
      findings: [],
      table: meta,
      staleness,
      headline: `Selecteur ${decode.selector} : ce n'est pas un execute() d'Universal Router, TARE ne se prononce pas.`,
      alternative: null,
      warnings,
    };
  }

  const findings = decode.legs.map((leg) => findingFor(leg, table, th));
  let verdict = worstVerdict(findings.map((f) => f.verdict));

  // La question qui vient juste apres « ce que cette porte prend » : et ailleurs ?
  // La reponse est NON dans 99,8 % des cas — il n'y a qu'une porte — et c'est une reponse,
  // pas un echec de recherche. Quand elle est OUI, elle vaut 300 bps qui deviennent 0,03.
  // On ne cherche que sur le PREMIER saut : sur un chemin multi-saut, les montants suivants
  // dependent de l'execution, donc aucune comparaison a taille egale n'est possible.
  const premier = decode.legs[0];
  const alternative =
    premier && decode.legs.length === 1
      ? chercherAlternative(table, premier.poolId, premier.direction, premier.amountIn)
      : null;

  // Regle dure n.3 : un calldata lu a moitie ne conclut pas. S'il reste une zone illisible
  // ET qu'on n'a rien trouve d'alarmant, on refuse quand meme le 'ok' silencieux.
  if (!decode.complete && verdict === "ok") verdict = "warn";

  return {
    verdict,
    complete: decode.complete,
    decode,
    findings,
    table: meta,
    staleness,
    headline: headlineOf(verdict, findings, warnings),
    warnings,
    alternative,
  };
}
