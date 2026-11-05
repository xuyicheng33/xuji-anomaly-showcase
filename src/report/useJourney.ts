import { dataUrl, datasetId } from '../datasets';
import { useEffect, useState } from 'react';
import type { Journey } from '../journey';

/** The manifest is shared by every chapter; retries keep the current route. */
export function useJourney() {
  const [data, setData] = useState<Journey | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    fetch(dataUrl('manifest.json'))
      .then((r) => {
        if (!r.ok) throw Error('资料读取失败');
        return r.json();
      })
      .then((d: Journey) => {
        if (
          d.schemaVersion !== 2 ||
          (d.dataset?.id ?? 'converter') !== datasetId ||
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
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}
