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
    fetch(import.meta.env.BASE_URL + 'data/journey/manifest.json')
      .then((r) => {
        if (!r.ok) throw Error('资料读取失败');
        return r.json();
      })
      .then((d: Journey) => {
        if (d.schemaVersion !== 2 || d.features.length !== 125) throw Error('资料版本不匹配');
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
