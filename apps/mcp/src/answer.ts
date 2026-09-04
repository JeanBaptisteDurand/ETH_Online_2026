/**
 * The shape of every answer, and how it is rendered for the model.
 *
 * A tool result is one text block: a dense report a human can read, followed by the exact JSON
 * payload. Numbers appear verbatim — never reformatted, never rounded, never converted to a
 * "human" unit — because the moment a number is rewritten it stops being the measurement.
 */
export const HEADER =
  "TARE — every number below was read from the cited source and is reproduced verbatim. " +
  "Do not compute, round, convert or average any of them. Report the label with the value.";

export interface Payload {
  tool: string;
  query: Record<string, unknown>;
  [k: string]: unknown;
}

export function directionLabel(zeroForOne: boolean): string {
  return zeroForOne ? "currency0 -> currency1 (zeroForOne=true)" : "currency1 -> currency0 (zeroForOne=false)";
}

export function short(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 10)}…${addr.slice(-4)}` : addr;
}

/** Exact string for a value that may be null. Never substitutes a default. */
export function v(x: unknown): string {
  return x === null || x === undefined ? "—" : String(x);
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

export function render(lines: string[], payload: Payload): { content: { type: "text"; text: string }[] } {
  const text = [HEADER, "", ...lines, "", "```json", JSON.stringify(payload, null, 1), "```"].join("\n");
  return { content: [{ type: "text" as const, text }] };
}
