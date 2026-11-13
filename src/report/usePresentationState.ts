import { useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';

const selections = new Map<string, unknown>();

/** Keep chapter selections during this visit; a document reload starts a new visit. */
export function usePresentationState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    selections.has(key)
      ? (selections.get(key) as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  useLayoutEffect(() => {
    selections.set(key, value);
  }, [key, value]);
  return [value, setValue];
}
