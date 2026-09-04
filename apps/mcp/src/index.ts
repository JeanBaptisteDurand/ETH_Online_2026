#!/usr/bin/env node
/**
 * stdio entrypoint. Nothing may be written to stdout but MCP frames — a stray console.log is a
 * protocol error — so every diagnostic goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const store = createStore();
  const p = store.dataset.provenance;
  process.stderr.write(
    `${SERVER_NAME}/${SERVER_VERSION} ready — ${p.measurements_rows} measurements ` +
      `(${p.measurements_sha256.slice(0, 18)}…), ${p.pools_rows} pools, fork ${cfg.rpcUrl}, ` +
      `api ${cfg.apiUrl}, default block ${cfg.defaultBlock}\n`,
  );
  const server = createServer(cfg, store);
  await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  process.stderr.write(`tare-mcp failed to start: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
