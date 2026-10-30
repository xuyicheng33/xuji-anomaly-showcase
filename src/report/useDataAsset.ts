import { useEffect, useState } from 'react';
import { loadAsset, type Asset } from '../journey';

/** Keep shared file caching, but only request assets used by the current view. */
export function useDataAsset(asset: Asset | null) {
  const file = asset?.file ?? '',
    bytes = asset?.bytes ?? 0,
    sha256 = asset?.sha256 ?? '';
  const key = file + ':' + sha256;
  const [state, setState] = useState<{ key: string; data: Float64Array | null; error: string }>({
    key: '',
    data: null,
    error: '',
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!file) return;
    let active = true;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: '' }));
    loadAsset({ file, bytes, sha256 })
      .then((data) => {
        if (active) setState({ key, data, error: '' });
      })
      .catch(() => {
        if (active) setState({ key, data: null, error: '数据读取失败。' });
      });
    return () => {
      active = false;
    };
  }, [file, bytes, sha256, key, attempt]);
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : '',
    retry: () => setAttempt((n) => n + 1),
  };
}
