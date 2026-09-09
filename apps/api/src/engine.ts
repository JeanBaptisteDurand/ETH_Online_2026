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

/**
 * LE NOEUD EST-IL BIEN CELUI QU'ON CROIT ?
 *
 * Cette verification n'est pas de la paranoia : elle vient d'un incident reel. Un anvil d'un
 * AUTRE projet, lance sur la meme machine avec `--port 8545 --chain-id 4663`, s'etait lie a
 * 127.0.0.1:8545 en IPv4 SPECIFIQUE — ce qui bat le wildcard *:8545 que Docker publie. Notre
 * conteneur repondait correctement (Base 8453, bloc 50 614 000, verifiable sur [::1]:8545) mais
 * tout ce qui appelait 127.0.0.1 tombait sur l'intrus.
 *
 * Consequence si personne ne verifie : le moteur cote deux fois sur une chaine qui n'est pas
 * Base, a un bloc qui n'est pas le notre, et rend des NOMBRES. Ils auraient l'air valides, ils
 * seraient etiquetes MEASURED, et ils ne rejoueraient rien. C'est exactement le defaut que tout
 * le projet refuse : une lecture fausse presentee comme une mesure.
 *
 * On refuse donc, et le refus DIT quoi verifier.
 */
export function assertNodeMatches(
  health: EngineHealth,
  expected: { chainId: number; block: number },
): void {
  if (!health.reachable)
    throw new EngineError(
      `moteur injoignable sur ${health.rpc}${health.error ? ` : ${health.error}` : ""}`,
    );

  if (health.chain_id !== null && health.chain_id !== expected.chainId)
    throw new EngineError(
      `mauvaise chaine : le noeud sur ${health.rpc} annonce chain_id ${health.chain_id}, ` +
        `on attend ${expected.chainId}. Un autre anvil ecoute probablement sur ce port — ` +
        `verifie avec : lsof -nP -iTCP:8545 -sTCP:LISTEN`,
    );

  const fork = health.fork?.block_number ?? null;
  if (fork !== null && fork !== expected.block)
    throw new EngineError(
      `mauvais bloc : le fork du noeud est epingle au bloc ${fork}, on attend ${expected.block}. ` +
        `Une mesure prise ici ne rejouerait pas le corpus.`,
    );

  // Sans fork, ce n'est pas une copie epinglee : les deux cotations ne porteraient pas sur le
  // meme etat, et l'ecart ne serait plus attribuable au seul code du hook.
  if (health.fork === null || fork === null)
    throw new EngineError(
      `le noeud sur ${health.rpc} n'est pas un fork epingle. Le contrefactuel exige un etat fige : ` +
        `docker compose up -d anvil`,
    );
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
