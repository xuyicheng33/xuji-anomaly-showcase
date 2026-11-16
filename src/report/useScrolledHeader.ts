import { useEffect } from 'react';

/** Marks the page once it leaves the top so the sticky header can show its edge. */
export function useScrolledHeader() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.toggleAttribute('data-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      root.removeAttribute('data-scrolled');
    };
  }, []);
}
