/**
 * The protocol itself: a real client, over a real stdio pipe, against the built server.
 *
 * This is not a unit test of the handlers — it spawns `dist/src/index.js` as Claude Desktop
 * would, performs the MCP initialize handshake, lists the tools and calls two of them.
 */
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { REPO_ROOT } from "../src/paths.js";
import { BLOCK, HOOK_EXTRACTOR, POOL_EXTRACTOR } from "./helpers.js";

const ENTRY = join(REPO_ROOT, "apps", "mcp", "dist", "src", "index.js");

let client: Client;
let transport: StdioClientTransport;

before(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    // Offline by default so the protocol test never depends on a running fork.
    env: { ...process.env, TARE_LIVE: "0", TARE_API_URL: "http://127.0.0.1:1", TARE_API_TIMEOUT_MS: "50" } as Record<string, string>,
    stderr: "pipe",
  });
  client = new Client({ name: "tare-test-client", version: "0.0.0" });
  await client.connect(transport);
});

after(async () => {
  await client.close();
});

function textOf(res: unknown): string {
  const content = (res as { content: { type: string; text?: string }[] }).content;
  return content.map((c) => c.text ?? "").join("\n");
}

test("MCP tools/list returns the four TARE tools with input schemas", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["tare_impact", "tare_lookup", "tare_measure", "tare_twins"]);
  const measure = tools.find((t) => t.name === "tare_measure");
  assert.ok(measure);
  const props = (measure.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  assert.deepEqual(Object.keys(props).sort(), ["block", "direction", "hook", "pool", "size"]);
  const required = (measure.inputSchema as { required?: string[] }).required ?? [];
  assert.deepEqual(required.sort(), ["direction", "hook", "pool", "size"]);
  for (const t of tools) assert.match(t.description ?? "", /never state a number this tool did not return/);
});

test("MCP tools/call tare_measure returns the recorded measurement over the wire", async () => {
  const res = await client.callTool({
    name: "tare_measure",
    arguments: {
      hook: HOOK_EXTRACTOR,
      pool: POOL_EXTRACTOR,
      size: "1000000000000000",
      direction: "0to1",
      block: BLOCK,
    },
  });
  const text = textOf(res);
  assert.match(text, /LABEL\s+MEASURED/);
  assert.match(text, /^bps\s+99\.96$/m);
  assert.match(text, /442747808421317694054679/);
  assert.match(text, /replay:/);
  assert.match(text, /measurements-v1\.json/);
});

test("MCP tools/call tare_twins answers NOT_MEASURABLE for the parts it cannot prove", async () => {
  const res = await client.callTool({ name: "tare_twins", arguments: { hook: HOOK_EXTRACTOR } });
  const text = textOf(res);
  assert.match(text, /PERMISSION TWINS\s+MEASURED/);
  assert.match(text, /BYTECODE TWINS\s+NOT_MEASURABLE/);
  assert.match(text, /DEPLOYER TWINS\s+NOT_MEASURABLE/);
});

test("a bad argument is refused by the schema, not answered approximately", async () => {
  const res = (await client.callTool({
    name: "tare_measure",
    arguments: { hook: "0xdeadbeef", pool: POOL_EXTRACTOR, size: "1", direction: "0to1" },
  })) as { isError?: boolean; content: { text?: string }[] };
  assert.equal(res.isError, true);
  assert.match(textOf(res), /hook/i);
});
