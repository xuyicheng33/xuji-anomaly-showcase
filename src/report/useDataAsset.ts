import { useCallback } from 'react';
import { loadAsset, type Asset } from '../journey';
import { useResource } from './useResource';

export function useDataAsset(asset: Asset | null) {
  const file = asset?.file ?? '',
    bytes = asset?.bytes ?? 0,
    sha256 = asset?.sha256 ?? '';
  const read = useCallback(() => loadAsset({ file, bytes, sha256 }), [file, bytes, sha256]);
  return useResource(file ? `${file}:${sha256}` : null, read);
}
