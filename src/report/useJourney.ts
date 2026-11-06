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
    d.models.some(
      (m) =>
        m.scores.length !== d.times.length ||
        m.windows.length !== d.window ||
        m.windows.features !== d.features.length,
    )
  )
    throw Error('资料版本不匹配');
}
const readJourney = () => loadJson<Journey>('manifest.json', validateJourney);

export function useJourney() {
  return useResource('manifest.json', readJourney);
}
