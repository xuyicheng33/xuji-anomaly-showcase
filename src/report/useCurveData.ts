import { useCallback } from 'react';
import { useResource } from './useResource';
import { loadAsset, type Asset } from '../journey';
import { useDataAsset } from './useDataAsset';
import { rowChunks } from '../dataGeometry';

/** Drawing a curve only needs one column; every number retains its original precision. */
export function useCurveData(asset: Asset | null, feature: number) {
  return useDataAsset(
    asset
      ? {
          file: `curves-v1/${asset.sha256}/${feature < 0 ? 'mean' : feature}.bin`,
          shape: [asset.shape[0], 1],
          bytes: asset.shape[0] * 8,
          sha256: asset.sha256,
        }
      : null,
  );
}

export function useWindowInput(
  asset: Asset,
  start: number,
  enabled: boolean,
  length: number,
  chunkRows: number,
) {
  const sha256 = asset.sha256,
    rows = asset.shape[0],
    features = asset.shape[1];
  const read = useCallback(async () => {
    const chunks = rowChunks(start, length, chunkRows);
    const parts = await Promise.all(
      chunks.map((from) =>
        loadAsset({
          file: `input-rows-v2/${sha256}/${from}.bin`,
          bytes: Math.min(chunkRows, rows - from) * features * 8,
          sha256,
        }),
      ),
    );
    const result = new Float64Array(length * features);
    for (let i = 0; i < chunks.length; i++) {
      const from = Math.max(start, chunks[i]),
        end = Math.min(start + length, chunks[i] + chunkRows);
      result.set(
        parts[i].subarray((from - chunks[i]) * features, (end - chunks[i]) * features),
        (from - start) * features,
      );
    }
    return result;
  }, [sha256, rows, features, start, length, chunkRows]);
  return useResource(enabled ? `${sha256}:${start}:${length}` : null, read);
}
