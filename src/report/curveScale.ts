export type CurveDomain = [number, number];

/** One shared domain for every line; retain every observation and threshold. */
export function curveDomain(
  values: readonly (number | null)[],
  range?: [number, number],
): [number, number] {
  if (range && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[1] > range[0])
    return range;
  let low = Infinity,
    high = -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (!Number.isFinite(low)) return [0, 1];
  const span = high - low;
  const pad =
    span > 0
      ? Math.max(span * 0.12, Math.abs(high) * 1e-9, 1e-12)
      : Math.max(Math.abs(high) * 0.015, 0.001);
  const from = low >= 0 ? Math.max(0, low - pad) : low - pad;
  return [from, high + pad];
}

/** Include both interrupted animation bounds and the newly revealed observations. */
export function playbackEnvelope(...domains: CurveDomain[]): CurveDomain {
  return [Math.min(...domains.map(([low]) => low)), Math.max(...domains.map(([, high]) => high))];
}

/** Small changes stay inside the existing padding instead of moving the whole plot. */
export function shouldTightenDomain(current: CurveDomain, target: CurveDomain) {
  return target[1] - target[0] < (current[1] - current[0]) * 0.8;
}

export function curveTick(value: number, span: number) {
  if (Math.abs(value) > 0 && (Math.abs(value) >= 1e7 || span < 1e-5)) return value.toExponential(2);
  const digits = Math.min(7, Math.max(0, 2 - Math.floor(Math.log10(Math.max(span, 1e-12)))));
  return (Math.abs(value) < 10 ** -digits / 2 ? 0 : value).toFixed(digits);
}
