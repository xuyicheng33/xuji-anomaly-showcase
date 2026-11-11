import { datasetId } from '../datasets';
import { loadJson } from '../assetRequests';
import type { Journey } from '../journey';
import { validateJourney } from '../journeyValidation';
import { useResource } from './useResource';

const readJourney = () =>
  loadJson<Journey>('manifest.json', (data) => validateJourney(data, datasetId));

export function useJourney(enabled: boolean) {
  return useResource(enabled ? 'manifest.json' : null, readJourney);
}
