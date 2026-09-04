/**
 * Appel du moteur TARE. Aucune arithmetique de mesure ici.
 *
 * Le moteur est en Python et il est deja verifie (47 tests, porte A3). L'API ne le
 * reecrit pas : elle lance scripts/measure_one.py, qui importe engine/tare et rend
 * du JSON. Si le processus ne repond pas, on ne fabrique pas de nombre — on remonte
 * l'echec tel quel et l'appelant l'etiquette NOT_MEASURABLE.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { API_ROOT, REPO_ROOT } from "./paths.js";
import type { RawMeasurement } from "./measurement.js";

export const BRIDGE = resolve(API_ROOT, "scripts", "measure_one.py");

export interface EnginePlan {
  currency0: string;
  currency1: string;
  fee: number;
  tick_spacing: number;
  hooks: string;
  zero_for_one: boolean;
  amount_in: string;
}

export interface EngineHealth {
  rpc: string;
  reachable: boolean;
  chain_id: number | null;
  block_number: number | null;
  is_anvil: boolean;
  fork: { block_number: number | null } | null;
  stub_bytes: number;
  stub_hash: string;
  error: string | null;
}

export class EngineError extends Error {}

function run(
  python: string,
  args: string[],
  stdin: string | null,
  timeoutMs: number,
): Promise<string> {
  return new Promise((res, rej) => {
    const child = spawn(python, args, { cwd: REPO_ROOT });
    let out = "";
    let err = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      rej(new EngineError(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rej(new EngineError(`spawn failed: ${e.message}`));
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) rej(new EngineError(`exit ${code}: ${err.trim().slice(0, 300)}`));
      else res(out);
    });
    if (stdin !== null) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

export async function engineHealth(
  python: string,
  rpcUrl: string,
  timeoutMs = 15000,
): Promise<EngineHealth> {
  try {
    const out = await run(python, [BRIDGE, "--rpc", rpcUrl, "--check"], null, timeoutMs);
    return JSON.parse(out) as EngineHealth;
  } catch (e) {
    return {
      rpc: rpcUrl,
      reachable: false,
      chain_id: null,
      block_number: null,
      is_anvil: false,
      fork: null,
      stub_bytes: 89,
      stub_hash: "",
      error: (e as Error).message.slice(0, 200),
    };
  }
}

export async function runPlans(
  python: string,
  rpcUrl: string,
  block: number,
  plans: EnginePlan[],
  timeoutMs = 120000,
): Promise<RawMeasurement[]> {
  const out = await run(
    python,
    [BRIDGE, "--rpc", rpcUrl, "--block", String(block), "--plan-stdin"],
    JSON.stringify(plans),
    timeoutMs,
  );
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed)) throw new EngineError("le pont n'a pas rendu un tableau");
  return parsed as RawMeasurement[];
}
