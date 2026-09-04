/**
 * The only place this server is allowed to produce a number that was not measured — and it is
 * labelled INTERPOLATED, it cites the two measured points it sits between, and it refuses to
 * extrapolate.
 *
 * Extraction against size is smooth and strongly curved (gate A3: 99.99 -> 57.44 bps from 1e14 to
 * 1e18 on one pool), so the interpolation is linear in log(size), which is how the instrument
 * plots it. Outside the bracket there is nothing to interpolate between, and a value there would
 * be a model output, not a measurement. We return null and say so.
 */
export interface Point {
  amountIn: string;
  bps: number;
}

export interface Interpolation {
  bps: number;
  lower: Point;
  upper: Point;
  method: "linear in log10(size) between two MEASURED points";
}

export function interpolate(points: Point[], amountIn: string): Interpolation | { reason: string } {
  const target = BigInt(amountIn);
  const sorted = [...points].sort((a, b) => (BigInt(a.amountIn) < BigInt(b.amountIn) ? -1 : 1));
  if (sorted.length < 2) return { reason: "fewer_than_two_measured_points_on_this_pool_direction" };
  const min = sorted[0] as Point;
  const max = sorted[sorted.length - 1] as Point;
  if (target < BigInt(min.amountIn) || target > BigInt(max.amountIn)) {
    return { reason: `size_outside_measured_range[${min.amountIn},${max.amountIn}]_no_extrapolation` };
  }
  for (let i = 0; i + 1 < sorted.length; i++) {
    const lo = sorted[i] as Point;
    const hi = sorted[i + 1] as Point;
    const l = BigInt(lo.amountIn);
    const h = BigInt(hi.amountIn);
    if (target < l || target > h) continue;
    if (target === l) return { bps: lo.bps, lower: lo, upper: lo, method: exactMethod };
    if (target === h) return { bps: hi.bps, lower: hi, upper: hi, method: exactMethod };
    const ll = Math.log10(Number(l));
    const lh = Math.log10(Number(h));
    const lt = Math.log10(Number(target));
    const t = (lt - ll) / (lh - ll);
    const bps = lo.bps + t * (hi.bps - lo.bps);
    return { bps: Math.round(bps * 1e4) / 1e4, lower: lo, upper: hi, method: methodName };
  }
  return { reason: "no_bracket_found" };
}

const methodName = "linear in log10(size) between two MEASURED points" as const;
const exactMethod = methodName;
