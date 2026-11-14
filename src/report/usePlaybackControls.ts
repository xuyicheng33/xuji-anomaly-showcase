import { useEffect, useRef } from 'react';

/** Match scroll targets to the real toolbar height; free the viewport at high zoom. */
export function usePlaybackControls() {
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = controls.current!;
    const page = bar.closest<HTMLElement>('.playback-page')!;
    const update = () => {
      const height = bar.getBoundingClientRect().height;
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const sticky = innerWidth <= 680 && innerWidth / zoom > 240 && height < innerHeight * 0.28;
      page.style.setProperty('--playback-controls-position', sticky ? 'sticky' : 'static');
      page.style.setProperty('--playback-scroll-offset', `${sticky ? height + 24 : 24}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return controls;
}
