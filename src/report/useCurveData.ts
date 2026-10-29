import { useEffect, useState } from 'react';
import { loadAsset, type Asset } from '../journey';
import { useDataAsset } from './useDataAsset';

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

export function useWindowInput(asset: Asset, start: number, enabled: boolean) {
  const key = asset.sha256 + ':' + start,
    [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{ key: string; data: Float64Array | null; error: string }>({
      key: '',
      data: null,
      error: '',
    });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: '' }));
    const first = Math.floor(start / 128) * 128,
      last = Math.floor((start + 63) / 128) * 128;
    const chunks = first === last ? [first] : [first, last];
    Promise.all(
      chunks.map((from) =>
        loadAsset({
          file: `input-rows-v1/${asset.sha256}/${from}.bin`,
          bytes: Math.min(128, asset.shape[0] - from) * 125 * 8,
          shape: [Math.min(128, asset.shape[0] - from), 125],
          sha256: asset.sha256,
        }),
      ),
    )
      .then((parts) => {
        const result = new Float64Array(64 * 125);
        for (let i = 0; i < 64; i++) {
          const row = start + i,
            chunk = Math.floor(row / 128) * 128,
            part = parts[chunks.indexOf(chunk)],
            offset = (row - chunk) * 125;
          result.set(part.subarray(offset, offset + 125), i * 125);
        }
        if (active) setState({ key, data: result, error: '' });
      })
      .catch(() => {
        if (active) setState({ key, data: null, error: '窗口输入读取失败。' });
      });
    return () => {
      active = false;
    };
  }, [key, enabled, attempt]);
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : '',
    retry: () => setAttempt((n) => n + 1),
  };
}
