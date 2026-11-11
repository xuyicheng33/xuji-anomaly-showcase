import { useCallback } from 'react';
import { loadJsonAsset } from '../assetRequests';
import type { Journey } from '../journey';
import { useResource } from './useResource';

/** Preserve every recorded timestamp; only training views fetch the timeline. */
export function useTrainingTimes(data: Journey, enabled = true) {
  const asset = data.datasets.train.times;
  const read = useCallback(() => loadJsonAsset<string[]>(asset), [asset]);
  return useResource(enabled ? asset.sha256 : null, read);
}
