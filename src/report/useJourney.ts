import { datasetId } from '../datasets';
import { loadJson } from '../assetRequests';
import type { Journey } from '../journey';
import { useResource } from './useResource';

function validateJourney(d: Journey) {
  if (
    d.schemaVersion !== 2 ||
    d.dataset?.id !== datasetId ||
    !d.models.length ||
    !d.features.length ||
    d.input.shape[1] !== d.features.length ||
    d.input.shape[0] !== d.times.length ||
    d.labels.length !== d.times.length ||
    !Number.isInteger(d.window) ||
    d.window < 1 ||
    d.window > d.times.length ||
    !Number.isInteger(d.inputChunkRows) ||
    d.inputChunkRows < 1 ||
    d.inputRowHashes?.length !== Math.ceil(d.times.length / d.inputChunkRows) ||
    d.datasets.train.shape[0] < d.window ||
    d.datasets.train.times.length !== d.datasets.train.shape[0] ||
    d.datasets.train.keys.length !== d.datasets.train.shape[1] ||
    d.features.some(
      (feature, index) => feature.index !== index || !d.datasets.train.keys.includes(feature.key),
    ) ||
    [d.input, d.labelMatrix, d.datasets.train, ...d.models.map((m) => m.recon)].some(
      (asset) => Object.keys(asset.curves ?? {}).length < asset.shape[1],
    ) ||
    d.models.some(
      (m) =>
        m.scores.length !== d.times.length ||
        !m.scores.every(Number.isFinite) ||
        !Number.isFinite(m.threshold) ||
        !Number.isFinite(m.windowThreshold) ||
        !m.history?.length ||
        m.history.some((row) => ![row.epoch, row.loss, row.lr].every(Number.isFinite)) ||
        m.windows.length !== d.window ||
        m.windows.features !== d.features.length ||
        m.windows.count !== d.times.length - d.window + 1,
    )
  )
    throw Error('资料版本不匹配');
}
const readJourney = () => loadJson<Journey>('manifest.json', validateJourney);

export function useJourney(enabled: boolean) {
  return useResource(enabled ? 'manifest.json' : null, readJourney);
}
