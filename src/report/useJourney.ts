import { datasetId, isLegacy } from '../datasets';
import { useCallback } from 'react';
import { readResult } from '../resultCatalog';
import { loadJson } from '../assetRequests';
import type { Journey } from '../journey';
import { validateJourney } from '../journeyValidation';
import { useResource } from './useResource';

const readJourney = () =>
  loadJson<Journey>('manifest.json', (data) => validateJourney(data, datasetId));

export function useJourney(enabled: boolean, methodId: string) {
  const read = useCallback(
    () => (isLegacy ? readJourney() : readResult(datasetId, methodId)),
    [methodId],
  );
  return useResource(
    enabled ? (isLegacy ? 'manifest.json' : `result:${datasetId}:${methodId}`) : null,
    read,
    true,
  );
}
