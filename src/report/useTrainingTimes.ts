import { useCallback } from 'react';
import { loadBinary } from '../assetRequests';
import type { Journey } from '../journey';
import { useResource } from './useResource';

/** Preserve every recorded timestamp; only training views fetch the timeline. */
export function useTrainingTimes(data: Journey, enabled = true) {
  const asset = data.datasets.train.times;
  const rows = data.datasets.train.shape[0];
  const read = useCallback(async () => {
    const raw = await loadBinary(asset);
    const times: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (
      !Array.isArray(times) ||
      times.length !== rows ||
      times.some((time) => typeof time !== 'string')
    )
      throw Error('训练时间记录不匹配');
    return times as string[];
  }, [asset, rows]);
  return useResource(enabled ? asset.sha256 : null, read);
}
