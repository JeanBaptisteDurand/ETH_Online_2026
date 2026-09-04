/**
 * The live counterfactual, run by the Python engine, never by this process.
 *
 * `bin/tare_measure.py` imports `engine/tare` and prints one JSON object. We spawn it, read
 * stdout to the end, and parse. If it dies, times out, or prints something we cannot parse, the
 * result is NOT_MEASURABLE with the reason attached — never a number.
 */
import { spawn } from "node:child_process";
import { BRIDGE_PATH, REPO_ROOT } from "./paths.js";
import { normalizeLabel, type Label } from "./labels.js";

export interface EngineRequest {
  rpcUrl: string;
  hook: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  amountIn: string;
  zeroForOne: boolean;
  block: number;
  timeoutMs: number;
  python?: string;
}

export interface EngineResult {
  label: Label;
  bps: number | null;
  out_with: string | null;
  out_without: string | null;
  reason: string | null;
  stub_hash: string | null;
  engine_ver: string | null;
  stored_lp_fee: number | null;
  stored_protocol_fee: number | null;
  observed_at: string | null;
  raw: Record<string, unknown> | null;
}

function notMeasurable(reason: string): EngineResult {
  return {
    label: "NOT_MEASURABLE",
    bps: null,
    out_with: null,
    out_without: null,
    reason,
    stub_hash: null,
    engine_ver: null,
    stored_lp_fee: null,
    stored_protocol_fee: null,
    observed_at: null,
    raw: null,
  };
}

export function engineArgs(req: EngineRequest): string[] {
  return [
    BRIDGE_PATH,
    "--rpc", req.rpcUrl,
    "--hook", req.hook,
    "--currency0", req.currency0,
    "--currency1", req.currency1,
    "--fee", String(req.fee),
    "--tick-spacing", String(req.tickSpacing),
    "--amount", req.amountIn,
    "--zero-for-one", req.zeroForOne ? "1" : "0",
    "--block", String(req.block),
  ];
}

export async function runEngine(req: EngineRequest): Promise<EngineResult> {
  const python = req.python ?? process.env["TARE_PYTHON"] ?? "python3";
  return new Promise<EngineResult>((resolve) => {
    let settled = false;
    const done = (r: EngineResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let child;
    try {
      child = spawn(python, engineArgs(req), { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return done(notMeasurable(`engine_spawn_failed:${(e as Error).message}`));
    }
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    child.stderr.on("data", (c: string) => (err += c));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(notMeasurable(`engine_timeout_after_${req.timeoutMs}ms`));
    }, req.timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      done(notMeasurable(`engine_spawn_failed:${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      const trimmed = out.trim();
      if (trimmed === "") {
        return done(notMeasurable(`engine_no_output:exit=${code}:${err.trim().slice(0, 200)}`));
      }
      let parsed: Record<string, unknown>;
      try {
        // The bridge prints exactly one object; take the last line so a stray warning cannot
        // truncate the payload we parse.
        const lines = trimmed.split("\n");
        parsed = JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;
      } catch {
        return done(notMeasurable(`engine_unparseable_output:${trimmed.slice(0, 200)}`));
      }
      let label: Label;
      try {
        label = normalizeLabel(String(parsed["label"]));
      } catch (e) {
        return done(notMeasurable(`engine_unknown_label:${(e as Error).message}`));
      }
      const bps = typeof parsed["bps"] === "number" ? parsed["bps"] : null;
      if ((label === "MEASURED" || label === "INTERPOLATED") && bps === null) {
        return done(notMeasurable("engine_label_claims_a_number_but_none_came_back"));
      }
      done({
        label,
        bps,
        out_with: parsed["out_with"] == null ? null : String(parsed["out_with"]),
        out_without: parsed["out_without"] == null ? null : String(parsed["out_without"]),
        reason: parsed["reason"] == null ? null : String(parsed["reason"]),
        stub_hash: parsed["stub_hash"] == null ? null : String(parsed["stub_hash"]),
        engine_ver: parsed["engine_ver"] == null ? null : String(parsed["engine_ver"]),
        stored_lp_fee: typeof parsed["stored_lp_fee"] === "number" ? parsed["stored_lp_fee"] : null,
        stored_protocol_fee:
          typeof parsed["stored_protocol_fee"] === "number" ? parsed["stored_protocol_fee"] : null,
        observed_at: parsed["observed_at"] == null ? null : String(parsed["observed_at"]),
        raw: parsed,
      });
    });
  });
}
