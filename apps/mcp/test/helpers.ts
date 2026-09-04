import { loadConfig, type Config } from "../src/config.js";
import { createStore, type Store } from "../src/store.js";
import { blockNumber } from "../src/rpc.js";

export const store: Store = createStore();

export function cfg(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig(), ...overrides };
}

/** Config that is forbidden to touch the network, so tests are deterministic offline. */
export function offlineCfg(overrides: Partial<Config> = {}): Config {
  return cfg({ liveEnabled: false, apiUrl: "http://127.0.0.1:1", apiTimeoutMs: 50, ...overrides });
}

export function textOf(res: { content: { type: string; text?: string }[] }): string {
  return res.content.map((c) => c.text ?? "").join("\n");
}

export function payloadOf(res: { content: { type: string; text?: string }[] }): Record<string, unknown> {
  const text = textOf(res);
  const start = text.indexOf("```json");
  const end = text.lastIndexOf("```");
  if (start < 0 || end <= start) throw new Error("no json payload in the answer");
  return JSON.parse(text.slice(start + 7, end)) as Record<string, unknown>;
}

/** The live fork is optional in CI; these helpers let a test skip instead of lie. */
export async function forkAtBlock(expected: number): Promise<boolean> {
  const head = await blockNumber(loadConfig().rpcUrl, 1500);
  return head === expected;
}

export const HOOK_EXTRACTOR = "0x985c14baa2a18316ffda0aefb3a632fadfca2acc";
export const HOOK_UNREGISTERED = "0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc";
export const HOOK_INIT_ONLY = "0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000";
export const POOL_EXTRACTOR = "0x84a874d2ca24f829f7067365bbc8a1811772b6f8ed5634558737c9c93225497e";
export const BLOCK = 50614000;
