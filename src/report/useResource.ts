import { useCallback, useEffect, useState } from 'react';

/** Selection keys prevent an old response from replacing the current view. */
export function useResource<T>(key: string | null, read: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string }>({
    key: null,
    data: null,
    error: '',
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: '' }));
    read().then(
      (data) => {
        if (active) setState({ key, data, error: '' });
      },
      (error: Error) => {
        if (active) setState({ key, data: null, error: error.message });
      },
    );
    return () => {
      active = false;
    };
  }, [key, read, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return {
    data: key !== null && state.key === key ? state.data : null,
    error: key !== null && state.key === key ? state.error : '',
    retry,
  };
}
