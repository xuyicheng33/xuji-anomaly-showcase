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

/** 1, 2 or 5 times a power of ten, at least as large as `raw`. */
export function niceStep(raw: number) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw)),
    fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

/** Round grid values inside the domain; the domain itself keeps every observation. */
export function valueTicks(low: number, high: number, count = 3) {
  const span = high - low;
  if (!(span > 0)) return { values: [low], step: 1 };
  // Start near `count` intervals and halve towards 1-2-5 steps until two ticks fit.
  for (let step = niceStep(span / count); step > span / 50; step = smallerStep(step)) {
    const values: number[] = [];
    for (let k = Math.ceil(low / step - 1e-9); k * step <= high + step * 1e-9; k++)
      values.push(k * step);
    if (values.length >= 2) return { values, step };
  }
  return { values: [low, high], step: span };
}
function smallerStep(step: number) {
  const power = 10 ** Math.floor(Math.log10(step) + 1e-9),
    mantissa = Math.round(step / power);
  return mantissa === 1 ? power / 2 : mantissa === 2 ? power : power * 2;
}

export function tickLabel(value: number, step: number) {
  if (Math.abs(value) > 0 && (Math.abs(value) >= 1e7 || step < 1e-5)) return value.toExponential(2);
  const digits = Math.min(9, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return (Math.abs(value) < 10 ** -digits / 2 ? 0 : value).toFixed(digits);
}

/** Point or epoch numbers: both ends plus round steps that keep clear of the ends. */
export function indexTicks(first: number, last: number, count: number) {
  if (count <= 1 || last <= first) return [first];
  if (count === 2) return [first, last];
  const step = Math.max(1, niceStep((last - first) / (count - 1)));
  const values = [first];
  for (let v = Math.ceil((first + 1) / step) * step; v < last; v += step)
    if (v - first >= step / 2 && last - v >= step / 2) values.push(v);
  values.push(last);
  return values;
}
