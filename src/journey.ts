export type Asset = { file: string; shape: number[]; bytes: number; sha256: string };
export type Metrics = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};
export type WindowChunk = {
  start: number;
  count: number;
  file: string;
  bytes: number;
  sha256: string;
};
export type Model = {
  id: string;
  name: string;
  threshold: number;
  scores: number[];
  history: { epoch: number; loss: number; lr: number }[];
  recon: Asset;
  focusFeatures: number[];
  metrics: { point_wise: Metrics; point_adjusted: Metrics; continuous_score_auc: number };
  windowThreshold: number;
  run: string;
  windows: { chunks: WindowChunk[]; count: number; length: number; features: number };
  contributions: { chunks: WindowChunk[]; features: number };
  examples: { code: string; index: number; start: number; feature: number }[];
};
export type Feature = { index: number; key: string; label: string; description: string };
export type Journey = {
  datasets: Record<string, Asset & { keys: string[]; times: string[] }>;
  schemaVersion: number;
  resultVersion: string;
  window: number;
  inputChunkRows: number;
  features: Feature[];
  times: string[];
  labels: number[];
  models: Model[];
  input: Asset;
  labelMatrix: Asset;
  summary: {
    rawRows: number;
    rawFeatures: number;
    emptyFeatures: number;
    emptyRows: number;
    cleanRows: number;
    features: number;
    trainRows: number;
    testRows: number;
    anomalousRows: number;
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;
    omittedTimes: string[];
    cleanStart: string;
    cleanEnd: string;
  };
  removedFeatures: string[];
};
export const fmt = (n: number, digits = 0) =>
  n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
export const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(2)}%`);
export function trainingScale(values: Float64Array) {
  let min = Infinity,
    max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    min,
    max,
    normalize: (value: number) => (min === max ? 0 : (value - min) / (max - min)),
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
const assetCache = new Map<string, Promise<Float64Array>>();
export function loadAsset(asset: Pick<Asset, 'file' | 'bytes' | 'sha256'>) {
  const key = asset.file + ':' + asset.sha256;
  const existing = assetCache.get(key);
  if (existing) return existing;
  const request = fetch(`${import.meta.env.BASE_URL}data/journey/${asset.file}?v=${asset.sha256}`)
    .then(async (r) => {
      if (!r.ok) throw Error('数据读取失败');
      const b = await r.arrayBuffer();
      if (b.byteLength !== asset.bytes) throw Error('数据文件长度不匹配');
      return new Float64Array(b);
    })
    .catch((e) => {
      assetCache.delete(key);
      throw e;
    });
  assetCache.set(key, request);
  return request;
}
const windowCache = new Map<string, Promise<ArrayBuffer>>();
async function windowFile({ file, bytes, sha256 }: WindowChunk) {
  const key = file + ':' + sha256;
  let request = windowCache.get(key);
  if (request) return request;
  request = fetch(`${import.meta.env.BASE_URL}data/journey/${file}?v=${sha256}`)
    .then(async (r) => {
      if (!r.ok) throw Error('窗口结果读取失败');
      const b = await r.arrayBuffer();
      if (b.byteLength !== bytes) throw Error('窗口文件长度不匹配');
      return b;
    })
    .catch((e) => {
      windowCache.delete(key);
      throw e;
    });
  windowCache.set(key, request);
  if (windowCache.size > 10) windowCache.delete(windowCache.keys().next().value!);
  return request;
}
export async function loadWindow(m: Model, start: number) {
  const pack = m.windows,
    chunk = pack.chunks.find((c) => start >= c.start && start < c.start + c.count);
  if (!chunk) throw Error('没有对应的完整窗口');
  const raw = await windowFile(chunk);
  const size = pack.length * pack.features;
  const offset = (start - chunk.start) * size;
  return {
    start,
    modelId: m.id,
    recon: new Float32Array(raw, offset * 4, size).slice(),
  };
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
