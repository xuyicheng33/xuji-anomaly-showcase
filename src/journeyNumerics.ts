import type { Metrics } from './journeyTypes';
export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
export const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(2)}%`);
export function trainingScale(values: Float64Array, epsilon = 0) {
  let min = Infinity,
    max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    min,
    max,
    normalize: (value: number) =>
      min === max && epsilon === 0 ? 0 : (value - min) / (max - min + epsilon),
  };
}
export type OutcomeCode = 'tp' | 'fp' | 'fn' | 'tn';
export function outcomeCode(label: number, score: number, threshold: number): OutcomeCode {
  return label ? (score > threshold ? 'tp' : 'fn') : score > threshold ? 'fp' : 'tn';
}
export function series(
  values: Float64Array,
  feature: number,
  start: number,
  length: number,
  features: number,
) {
  return Array.from(
    { length: Math.min(length, values.length / features - start) },
    (_, i) => values[(start + i) * features + feature],
  );
}
export function meanSeries(
  values: Float64Array | Float32Array,
  start: number,
  length: number,
  features: number,
) {
  return Array.from({ length: Math.min(length, values.length / features - start) }, (_, i) => {
    let sum = 0;
    for (let f = 0; f < features; f++) sum += values[(start + i) * features + f];
    return sum / features;
  });
}
export function countMetrics(
  labels: number[],
  scores: number[],
  threshold: number,
  start = 0,
  end = labels.length,
): Metrics {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (let i = start; i < end; i++) {
    switch (outcomeCode(labels[i], scores[i], threshold)) {
      case 'tp':
        tp++;
        break;
      case 'fp':
        fp++;
        break;
      case 'fn':
        fn++;
        break;
      case 'tn':
        tn++;
        break;
    }
  }
  return metricsFromCounts(tp, fp, fn, tn);
}
function metricsFromCounts(tp: number, fp: number, fn: number, tn: number): Metrics {
  return {
    tp,
    fp,
    fn,
    tn,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,
  };
}
export function metricPrefixes(labels: number[], scores: number[], threshold: number) {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const prefixes = [metricsFromCounts(...counts)];
  for (let i = 0; i < labels.length; i++) {
    counts[{ tp: 0, fp: 1, fn: 2, tn: 3 }[outcomeCode(labels[i], scores[i], threshold)]]++;
    prefixes.push(metricsFromCounts(...counts));
  }
  return prefixes;
}
export function pointAdjusted(labels: number[], scores: number[], threshold: number) {
  const p = scores.map((v) => v > threshold);
  let i = 0;
  while (i < labels.length) {
    if (!labels[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < labels.length && labels[i]) i++;
    if (p.slice(start, i).some(Boolean)) p.fill(true, start, i);
  }
  return p;
}
export function windowScores(
  input: Float64Array,
  recon: Float32Array,
  start: number,
  window: number,
  features: number,
) {
  return Array.from({ length: window }, (_, i) => {
    let s = 0;
    for (let j = 0; j < features; j++)
      s += (input[(start + i) * features + j] - recon[i * features + j]) ** 2;
    return s / features;
  });
}
