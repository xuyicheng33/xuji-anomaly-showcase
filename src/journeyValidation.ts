import type { Asset, CurveAsset, Journey, WindowChunk } from './journeyTypes';

const digest = (value: string) => /^[a-f0-9]{64}$/.test(value);
const text = (value: string) => typeof value === 'string' && value.trim().length > 0;
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

function validMatrix(asset: Asset, rows: number, columns: number, itemBytes = 8) {
  return (
    validAsset(asset) &&
    Array.isArray(asset.shape) &&
    asset.shape.length === 2 &&
    asset.shape[0] === rows &&
    asset.shape[1] === columns &&
    asset.bytes === rows * columns * itemBytes
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
  // Runtime checks cover readable geometry and resource identity; release tests verify results.
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
    !Array.isArray(d.labels) ||
    d.labels.length !== d.times.length ||
    d.labels.some((value) => value !== 0 && value !== 1) ||
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
    !Number.isSafeInteger(d.datasets.train.shape[0]) ||
    d.datasets.train.shape[0] < d.window ||
    !validAsset(d.datasets.train.times) ||
    !Array.isArray(d.datasets.train.keys) ||
    d.datasets.train.keys.length !== d.features.length ||
    d.features.some(
      (feature, index) =>
        !feature || feature.index !== index || d.datasets.train.keys[index] !== feature.key,
    ) ||
    !validCurves(d.input, d.times.length, d.features.length, true) ||
    !validCurves(d.labelMatrix, d.times.length, d.features.length) ||
    !validCurves(d.datasets.train, d.datasets.train.shape[0], d.features.length) ||
    new Set(d.models.map((m) => m?.id)).size !== d.models.length ||
    d.models.some(
      (m) =>
        !m ||
        !text(m.id) ||
        m.run !== d.resultVersion ||
        !Array.isArray(m.scores) ||
        m.scores.length !== d.times.length ||
        !m.scores.every((value) => Number.isFinite(value) && value >= 0) ||
        !Number.isFinite(m.threshold) ||
        !Number.isFinite(m.windowThreshold) ||
        !Array.isArray(m.history) ||
        !m.history.length ||
        !validCurves(m.recon, d.times.length, d.features.length, true) ||
        m.windows?.length !== d.window ||
        m.windows.features !== d.features.length ||
        m.windows.count !== d.times.length - d.window + 1 ||
        !validChunks(m.windows.chunks, m.windows.count, d.window * d.features.length * 4) ||
        m.windows.chunks.some(
          (chunk) => !validMatrix(chunk.integrity, 2 * chunk.count + d.window - 1, 32, 1),
        ) ||
        m.contributions?.features !== d.features.length ||
        !validChunks(m.contributions.chunks, d.times.length, d.features.length * 8) ||
        !Array.isArray(m.focusFeatures) ||
        m.focusFeatures.length !== d.times.length ||
        m.focusFeatures.some(
          (feature) => !Number.isInteger(feature) || feature < 0 || feature >= d.features.length,
        ) ||
        !Array.isArray(m.examples) ||
        !m.examples.length,
    ) ||
    !d.summary ||
    !Array.isArray(d.removedFeatures)
  )
    throw Error('资料版本不匹配');
}
