import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dataset } from '../datasets';
import { chapters, route } from './navigation';
import { getNoteOrigin, pausePresentation } from './notes';

export function useReportNavigation() {
  const [page, setPage] = useState(route);
  const [address, setAddress] = useState(location.hash);
  const [contentPage, setContentPage] = useState(() => (route() === 'metrics' ? null : route()));
  const [menu, setMenu] = useState(false);
  const previousPage = useRef(page),
    menuButton = useRef<HTMLButtonElement>(null),
    returning = useRef(false),
    historyNavigation = useRef(false),
    restorePosition = useRef<number | null>(null),
    scrollPositions = useRef(new Map<string, number>());
  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    history.replaceState({ ...history.state, showcasePage: route() }, '');
    const pop = (event: PopStateEvent) => {
      historyNavigation.current = !!event.state?.showcasePage;
    };
    const f = () => {
      const next = route();
      scrollPositions.current.set(previousPage.current, window.scrollY);
      returning.current = previousPage.current === 'metrics' && next !== 'metrics';
      restorePosition.current = historyNavigation.current
        ? (scrollPositions.current.get(next) ?? 0)
        : null;
      historyNavigation.current = false;
      history.replaceState({ ...history.state, showcasePage: next }, '');
      pausePresentation();
      setPage(next);
      setAddress(location.hash);
      if (next !== 'metrics') setContentPage(next);
      previousPage.current = next;
      setMenu(false);
    };
    window.addEventListener('hashchange', f);
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('hashchange', f);
      window.removeEventListener('popstate', pop);
      history.scrollRestoration = previousRestoration;
    };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useLayoutEffect(() => {
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', dataset.description);
    document.title =
      (page === 'metrics'
        ? '数据与评估说明'
        : chapters.find((c) => c.id === page)?.name || '从数据到异常判定') +
      dataset.titleSuffix +
      '　许继电气';
  }, [page]);
  // Run after the visible chapter commits, including a deferred chapter's first load.
  const reveal = useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const note = new URLSearchParams(address.split('?')[1] ?? '').get('note');
      const target = page === 'metrics' && note ? document.getElementById('note-' + note) : null;
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
      } else if (returning.current) {
        const origin = getNoteOrigin();
        window.scrollTo(0, scrollPositions.current.get(page) ?? origin?.y ?? 0);
        document.getElementById(origin?.reference ?? '')?.focus({ preventScroll: true });
        returning.current = false;
      } else {
        window.scrollTo(0, restorePosition.current ?? 0);
        restorePosition.current = null;
        document.getElementById('main')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [page, address]);
  return { page, address, contentPage, menu, setMenu, menuButton, reveal };
}
