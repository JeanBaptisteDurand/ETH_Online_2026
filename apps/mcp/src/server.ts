/**
 * The MCP surface: four tools, one rule.
 *
 * The rule is in every description and in every answer: the model chooses what to query and
 * explains what came back. It does not produce the number. Every figure a tool prints is read
 * from the committed dataset, from the LOT B API, or from the Python engine's own stdout, and
 * arrives with its block, its size, its direction, its label and a command that reproduces it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig, type Config } from "./config.js";
import { createStore, type Store } from "./store.js";
import { measureTool } from "./tools/measure.js";
import { lookupTool } from "./tools/lookup.js";
import { impactTool } from "./tools/impact.js";
import { twinsTool } from "./tools/twins.js";
import { creerJournal, type Journal } from "./journal.js";

export const SERVER_NAME = "tare";
export const SERVER_VERSION = "0.1.0";

/**
 * L'identifiant HCS-14 de ce service, annonce sur le topic Hedera 0.0.10371106 (message #12).
 * Un agent qui consomme ces outils sait donc QUI il consomme, et peut le verifier de deux
 * facons independantes : le relire sur le mirror node, et le recalculer depuis les six champs
 * canoniques rendus par GET /agent.
 *
 * La chaine est recopiee ici plutot qu'importee : apps/mcp ne depend pas de apps/api. Un test
 * cote API (test/agent.test.ts) verifie que les deux ne divergent pas — sinon le serveur MCP
 * annoncerait une identite que personne ne pourrait recalculer.
 */
export const SERVER_UAID =
  "uaid:aid:9gmr4c6opC3zeSWSZzv23pjXkfbTvEeRHKdXkgMJqX7FG9133ocwFuCXL6uwBWiTHY" +
  ";registry=self;proto=mcp;nativeId=hedera:testnet:0.0.10367920;uid=0";

const HOOK = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "a 20-byte hook address, 0x-prefixed")
  .describe("Hook address, e.g. 0x985c14baa2a18316ffda0aefb3a632fadfca2acc");

const NEVER_INVENT =
  "Report the returned values verbatim, with their label, block, size and direction. Never " +
  "compute, round, convert or average them, and never state a number this tool did not return.";

function errorResult(e: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text:
          `TARE refused the request rather than answer approximately.\n\n` +
          `${(e as Error).message}\n\n` +
          `No number is returned. A bounded or failed read is NOT_MEASURABLE, never a value.`,
      },
    ],
  };
}

/**
 * Enveloppe un outil : il repond d'abord, l'historique part ensuite.
 *
 * L'ordre est le point. Le depot dans l'historique du compte n'est PAS attendu : un outil de
 * mesure qui devient lent parce qu'un service d'historique est injoignable serait un mauvais
 * echange. Et une erreur est deposee AUSSI — un historique qui ne montrerait que les succes
 * donnerait une image fausse de ce que l'agent a reellement fait.
 */
function avecJournal<A>(
  nom: string,
  journal: Journal,
  executer: (a: A) => Promise<unknown> | unknown,
) {
  return async (args: A) => {
    const t0 = Date.now();
    try {
      const r = await executer(args);
      journal.deposer("mesure", sujetDe(args), {
        outil: nom,
        ...aplatir(args),
        ms: Date.now() - t0,
        refuse: Boolean((r as { isError?: boolean }).isError),
      });
      return r as never;
    } catch (e) {
      journal.deposer("mesure", sujetDe(args), {
        outil: nom,
        ...aplatir(args),
        ms: Date.now() - t0,
        erreur: (e as Error).message.slice(0, 200),
      });
      return errorResult(e) as never;
    }
  };
}

/** Le sujet d'une ligne d'historique : le hook, quand l'outil en prend un. */
function sujetDe(args: unknown): string | null {
  const h = (args as { hook?: unknown }).hook;
  return typeof h === "string" ? h : null;
}

/** Ce qu'on garde des arguments. Rien d'autre : aucun argument n'est un secret, mais on ne
 * recopie pas un objet inconnu dans une base sans savoir ce qu'il contient. */
function aplatir(args: unknown): Record<string, unknown> {
  const a = args as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["hook", "pool", "size", "direction", "block"])
    if (a[k] !== undefined) out[k] = a[k];
  return out;
}

export function createServer(
  cfg: Config = loadConfig(),
  store: Store = createStore(),
  journal: Journal = creerJournal(cfg),
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "TARE measures what a Uniswap v4 hook actually takes from a swap, by replacing the hook's " +
        "bytecode with an inert stub on a pinned fork and quoting the same swap twice. " +
        "You never produce a number yourself: call a tool and repeat what it returns, with its " +
        "label (MEASURED, INTERPOLATED, NOT_MEASURABLE, NOT_QUOTABLE), its block, its size, its " +
        "direction and its replay command. A NOT_MEASURABLE is a result, not a failure to work around. " +
        `This service's HCS-14 agent identity is ${SERVER_UAID} — announced on Hedera topic ` +
        "0.0.10371106 and recomputable from the six canonical fields returned by GET /agent. " +
        (journal.etat().actif
          ? "Each tool call you make is recorded in the operator's account history."
          : "No tool call is recorded anywhere: this server holds no API key and sends nothing."),
    },
  );

  server.registerTool(
    "tare_measure",
    {
      title: "Measure one swap through one hook",
      description:
        "Measure what a hook takes on one specific swap: one pool, one size, one direction, one " +
        "block. Answers from the committed dataset when the exact row exists, otherwise from the " +
        "LOT B API, otherwise by running the counterfactual live against the pinned fork " +
        "(anvil_setCode swaps the hook for an inert stub and the same swap is quoted twice), " +
        "otherwise by interpolating between two MEASURED points, otherwise NOT_MEASURABLE. " +
        NEVER_INVENT,
      inputSchema: {
        hook: HOOK,
        pool: z
          .string()
          .regex(/^0x[0-9a-fA-F]{64}$/, "a 32-byte poolId, 0x-prefixed")
          .describe("poolId. Use tare_impact or tare_lookup on the hook to list the pools it carries."),
        size: z
          .string()
          .describe(
            "Swap size as a decimal integer string in the smallest unit of the input token " +
              '(e.g. "1000000000000000" = 1e15). A string, never a float: 1e18 does not survive a double.',
          ),
        direction: z
          .string()
          .describe('"0to1" (currency0 -> currency1, zeroForOne=true) or "1to0".'),
        block: z
          .number()
          .int()
          .optional()
          .describe(`Block number. Defaults to ${cfg.defaultBlock}, the block the committed dataset was taken at.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    avecJournal("tare_measure", journal, (args) => measureTool(args as never, cfg, store)),
  );

  server.registerTool(
    "tare_lookup",
    {
      title: "Everything already known about a hook",
      description:
        "Every recorded profile for one hook: each pool it carries, the measurements taken on it " +
        "by size and direction, each with its label, and the pools that were never measured, " +
        "labelled NOT_MEASURABLE with the reason. Also decodes the hook's declared permissions " +
        "from the low 14 bits of its address. Reads only committed evidence — never measures. " +
        NEVER_INVENT,
      inputSchema: { hook: HOOK },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    avecJournal("tare_lookup", journal, (args) => lookupTool(args as never, cfg, store)),
  );

  server.registerTool(
    "tare_impact",
    {
      title: "Blast radius of a hook",
      description:
        "Which pools and which tokens are exposed to this hook, how much of that surface has " +
        "actually been measured, and the min / median / max extraction across the measured " +
        "subset with the full list of values it was computed from. Liquidity is reported per " +
        "pool and never summed: in-range uint128 liquidity from different pairs has no common " +
        "unit. " + NEVER_INVENT,
      inputSchema: { hook: HOOK },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    avecJournal("tare_impact", journal, (args) => impactTool(args as never, cfg, store)),
  );

  server.registerTool(
    "tare_twins",
    {
      title: "Hooks with the same code or the same hand",
      description:
        "Finds other hooks related to this one: permission twins (identical low-14-bit " +
        "declaration, exact and offline), bytecode twins (identical keccak of the full " +
        "eth_getCode body at the pinned block — NOT_MEASURABLE if the fork is not up), and " +
        "deployer twins (NOT_MEASURABLE: this checkout ships no creation-trace index, and TARE " +
        "does not guess a deployer). " + NEVER_INVENT,
      inputSchema: { hook: HOOK },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    avecJournal("tare_twins", journal, (args) => twinsTool(args as never, cfg, store)),
  );

  return server;
}
