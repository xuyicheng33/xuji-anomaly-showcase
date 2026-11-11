import type { Asset, Journey, WindowChunk } from './journeyTypes';

const digest = (value: string) => /^[a-f0-9]{64}$/.test(value);
export function validAsset(asset: Pick<Asset, 'file' | 'bytes' | 'sha256'>) {
  return (
    !!asset &&
    typeof asset.file === 'string' &&
    asset.file.length > 0 &&
    Number.isSafeInteger(asset.bytes) &&
    asset.bytes > 0 &&
    digest(asset.sha256)
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
  if (
    !d ||
    d.schemaVersion !== 2 ||
    d.dataset?.id !== datasetId ||
    !Array.isArray(d.models) ||
    !d.models.length ||
    !Array.isArray(d.features) ||
    !d.features.length ||
    !d.resultVersion ||
    !validAsset(d.cases) ||
    !validAsset(d.calculation) ||
    d.input?.shape[1] !== d.features.length ||
    d.input.shape[0] !== d.times?.length ||
    d.labels?.length !== d.times.length ||
    !Number.isInteger(d.window) ||
    d.window < 1 ||
    d.window > d.times.length ||
    !Number.isInteger(d.inputChunkRows) ||
    d.inputChunkRows < 1 ||
    d.inputRowHashes?.length !== Math.ceil(d.times.length / d.inputChunkRows) ||
    !d.inputRowHashes.every(digest) ||
    !d.datasets?.train ||
    d.datasets.train.shape[0] < d.window ||
    !validAsset(d.datasets.train.times) ||
    d.datasets.train.keys.length !== d.datasets.train.shape[1] ||
    d.features.some(
      (feature, index) => feature.index !== index || !d.datasets.train.keys.includes(feature.key),
    ) ||
    [d.input, d.labelMatrix, d.datasets.train, ...d.models.map((m) => m.recon)].some(
      (asset) =>
        !validAsset(asset) ||
        asset.shape.length !== 2 ||
        asset.bytes !== asset.shape[0] * asset.shape[1] * 8 ||
        Array.from({ length: asset.shape[1] }, (_, i) => i).some((i) => !digest(asset.curves?.[i])),
    ) ||
    d.labelMatrix.shape.some((value, i) => value !== d.input.shape[i]) ||
    new Set(d.models.map((m) => m.id)).size !== d.models.length ||
    d.models.some(
      (m) =>
        !m.id ||
        m.scores?.length !== d.times.length ||
        !m.scores.every(Number.isFinite) ||
        !Number.isFinite(m.threshold) ||
        !Number.isFinite(m.windowThreshold) ||
        !m.history?.length ||
        m.history.some((row) => ![row.epoch, row.loss, row.lr].every(Number.isFinite)) ||
        m.recon.shape.some((value, i) => value !== d.input.shape[i]) ||
        !digest(m.recon.curves.mean) ||
        m.windows?.length !== d.window ||
        m.windows.features !== d.features.length ||
        m.windows.count !== d.times.length - d.window + 1 ||
        !validChunks(m.windows.chunks, m.windows.count, d.window * d.features.length * 4) ||
        m.windows.chunks.some(
          (chunk) =>
            !validAsset(chunk.integrity) ||
            chunk.integrity.shape.length !== 2 ||
            chunk.integrity.shape[0] !== 2 * chunk.count + d.window - 1 ||
            chunk.integrity.shape[1] !== 32 ||
            chunk.integrity.bytes !== (2 * chunk.count + d.window - 1) * 32,
        ) ||
        m.contributions?.features !== d.features.length ||
        !validChunks(m.contributions.chunks, d.times.length, d.features.length * 8) ||
        m.focusFeatures?.length !== d.times.length ||
        m.focusFeatures.some(
          (feature) => !Number.isInteger(feature) || feature < 0 || feature >= d.features.length,
        ),
    ) ||
    !digest(d.input.curves.mean)
  )
    throw Error('资料版本不匹配');
}
