import type { Asset, CurveAsset, Journey, Metrics, WindowChunk } from './journeyTypes';
import { countMetrics, pointAdjusted } from './journeyNumerics';

const digest = (value: string) => /^[a-f0-9]{64}$/.test(value);
const text = (value: string) => typeof value === 'string' && value.trim().length > 0;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
const probability = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
export function validAsset(asset: Pick<Asset, 'file' | 'bytes' | 'sha256'>) {
  return (
    !!asset &&
    typeof asset.file === 'string' &&
    asset.file.split('/').every((part) => part && part !== '.' && part !== '..') &&
    !/[\\:?#]/.test(asset.file) &&
    Number.isSafeInteger(asset.bytes) &&
    asset.bytes > 0 &&
    digest(asset.sha256)
  );
}

export function validMatrix(asset: Asset, rows: number, columns: number) {
  return (
    validAsset(asset) &&
    Array.isArray(asset.shape) &&
    asset.shape.length === 2 &&
    asset.shape[0] === rows &&
    asset.shape[1] === columns &&
    asset.bytes === rows * columns * 8
  );
}

export function validMetrics(metrics: Metrics, samples: number) {
  if (!metrics) return false;
  const { tp, fp, fn, tn } = metrics;
  if (![tp, fp, fn, tn].every(count) || tp + fp + fn + tn !== samples) return false;
  const ratio = (value: number | null, numerator: number, denominator: number) =>
    denominator === 0
      ? value === null
      : value !== null && probability(value) && Math.abs(value - numerator / denominator) < 1e-12;
  return (
    ratio(metrics.precision, tp, tp + fp) &&
    ratio(metrics.recall, tp, tp + fn) &&
    ratio(metrics.f1, 2 * tp, 2 * tp + fp + fn)
  );
}

function validCurves(asset: CurveAsset, rows: number, columns: number, mean = false) {
  return (
    validMatrix(asset, rows, columns) &&
    Array.from({ length: columns }, (_, i) => i).every((i) => digest(asset.curves?.[i])) &&
    (!mean || digest(asset.curves?.mean))
  );
}

export function validChunks(chunks: WindowChunk[], count: number, rowBytes: number) {
  if (!Array.isArray(chunks) || !chunks.length) return false;
  let next = 0;
  const files = new Set<string>();
  for (const chunk of chunks) {
    if (
      !validAsset(chunk) ||
      chunk.start !== next ||
      !Number.isSafeInteger(chunk.count) ||
      chunk.count < 1 ||
      chunk.bytes !== chunk.count * rowBytes ||
      files.has(chunk.file)
    )
      return false;
    next += chunk.count;
    files.add(chunk.file);
  }
  return next === count;
}

export function validateJourney(d: Journey, datasetId: string) {
  const reject = () => {
    throw Error('资料版本不匹配');
  };
  if (
    !d ||
    d.schemaVersion !== 2 ||
    d.dataset?.id !== datasetId ||
    !Array.isArray(d.models) ||
    !d.models.length ||
    !Array.isArray(d.features) ||
    !d.features.length ||
    !text(d.resultVersion) ||
    !Array.isArray(d.times) ||
    !d.times.length ||
    d.times.some((value, i) => !text(value) || (i > 0 && value <= d.times[i - 1])) ||
    !Array.isArray(d.labels) ||
    d.labels.length !== d.times.length ||
    d.labels.some((value) => value !== 0 && value !== 1) ||
    !text(d.dataset.title) ||
    !Number.isFinite(d.dataset.samplingMinutes) ||
    d.dataset.samplingMinutes <= 0 ||
    !validAsset(d.cases) ||
    !validAsset(d.calculation) ||
    !Number.isInteger(d.window) ||
    d.window < 1 ||
    d.window > d.times.length ||
    !Number.isInteger(d.inputChunkRows) ||
    d.inputChunkRows < 1 ||
    !Array.isArray(d.inputRowHashes) ||
    d.inputRowHashes.length !== Math.ceil(d.times.length / d.inputChunkRows) ||
    !d.inputRowHashes.every(digest) ||
    !d.datasets?.train ||
    !Array.isArray(d.datasets.train.shape) ||
    !count(d.datasets.train.shape[0]) ||
    d.datasets.train.shape[0] < d.window ||
    !validAsset(d.datasets.train.times) ||
    !Array.isArray(d.datasets.train.keys) ||
    d.datasets.train.keys.length !== d.features.length ||
    new Set(d.datasets.train.keys).size !== d.features.length ||
    new Set(d.features.map((feature) => feature?.key)).size !== d.features.length ||
    d.features.some(
      (feature, index) =>
        !feature ||
        feature.index !== index ||
        !text(feature.key) ||
        !text(feature.label) ||
        d.datasets.train.keys[index] !== feature.key,
    ) ||
    !validCurves(d.input, d.times.length, d.features.length, true) ||
    !validCurves(d.labelMatrix, d.times.length, d.features.length) ||
    !validCurves(d.datasets.train, d.datasets.train.shape[0], d.features.length) ||
    new Set(d.models.map((m) => m?.id)).size !== d.models.length ||
    d.models.some(
      (m) =>
        !m ||
        !text(m.id) ||
        !text(m.name) ||
        m.run !== d.resultVersion ||
        !Array.isArray(m.scores) ||
        m.scores.length !== d.times.length ||
        !m.scores.every((value) => Number.isFinite(value) && value >= 0) ||
        !Number.isFinite(m.threshold) ||
        !Number.isFinite(m.windowThreshold) ||
        !Array.isArray(m.history) ||
        !m.history.length ||
        m.history.some(
          (row, i) =>
            !row ||
            !count(row.epoch) ||
            row.epoch < 1 ||
            (i > 0 && row.epoch <= m.history[i - 1].epoch) ||
            ![row.loss, row.lr].every((value) => Number.isFinite(value) && value >= 0),
        ) ||
        !validCurves(m.recon, d.times.length, d.features.length, true) ||
        !validMetrics(m.metrics?.point_wise, d.times.length) ||
        !validMetrics(m.metrics?.point_adjusted, d.times.length) ||
        !probability(m.metrics?.continuous_score_auc) ||
        m.windows?.length !== d.window ||
        m.windows.features !== d.features.length ||
        m.windows.count !== d.times.length - d.window + 1 ||
        !validChunks(m.windows.chunks, m.windows.count, d.window * d.features.length * 4) ||
        m.windows.chunks.some(
          (chunk) =>
            !validAsset(chunk.integrity) ||
            !Array.isArray(chunk.integrity.shape) ||
            chunk.integrity.shape.length !== 2 ||
            chunk.integrity.shape[0] !== 2 * chunk.count + d.window - 1 ||
            chunk.integrity.shape[1] !== 32 ||
            chunk.integrity.bytes !== (2 * chunk.count + d.window - 1) * 32,
        ) ||
        m.contributions?.features !== d.features.length ||
        !validChunks(m.contributions.chunks, d.times.length, d.features.length * 8) ||
        !Array.isArray(m.focusFeatures) ||
        m.focusFeatures.length !== d.times.length ||
        m.focusFeatures.some(
          (feature) => !Number.isInteger(feature) || feature < 0 || feature >= d.features.length,
        ) ||
        !Array.isArray(m.examples) ||
        !m.examples.length ||
        new Set(m.examples.map((example) => example?.code)).size !== m.examples.length ||
        m.examples.some(
          (example) =>
            !example ||
            !['tp', 'fp', 'fn', 'tn'].includes(example.code) ||
            !count(example.start) ||
            example.start >= m.windows.count ||
            !count(example.index) ||
            example.index < example.start ||
            example.index >= example.start + d.window ||
            !count(example.feature) ||
            example.feature >= d.features.length,
        ),
    )
  )
    reject();

  const s = d.summary;
  if (
    !s ||
    ![
      s.rawRows,
      s.rawFeatures,
      s.emptyFeatures,
      s.emptyRows,
      s.cleanRows,
      s.features,
      s.trainRows,
      s.testRows,
      s.anomalousRows,
    ].every(count) ||
    !Array.isArray(s.omittedTimes) ||
    !Array.isArray(d.removedFeatures) ||
    s.rawRows - s.emptyRows !== s.cleanRows ||
    s.rawFeatures - s.emptyFeatures !== s.features ||
    s.features !== d.features.length ||
    s.trainRows !== d.datasets.train.shape[0] ||
    s.testRows !== d.times.length ||
    s.anomalousRows !== d.labels.reduce((a, b) => a + b, 0) ||
    s.trainRows + s.testRows + s.omittedTimes.length !== s.cleanRows ||
    s.emptyFeatures !== d.removedFeatures.length ||
    s.testStart !== d.times[0] ||
    s.testEnd !== d.times.at(-1)
  )
    reject();
  for (const model of d.models) {
    const expected = {
      point_wise: countMetrics(d.labels, model.scores, model.threshold),
      point_adjusted: countMetrics(
        d.labels,
        pointAdjusted(d.labels, model.scores, model.threshold).map(Number),
        0.5,
      ),
    };
    for (const kind of ['point_wise', 'point_adjusted'] as const)
      for (const key of ['tp', 'fp', 'fn', 'tn'] as const)
        if (model.metrics[kind][key] !== expected[kind][key]) reject();
  }
}
