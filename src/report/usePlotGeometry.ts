import { useLayoutEffect, useState } from 'react';

/** Shared pixel geometry keeps curves and their point controls on the same axis. */
export function plotInsets(width: number) {
  return { left: Math.min(width * 0.48, width < 550 ? 60 : 62), right: width < 550 ? 8 : 18 };
}

export function usePlotGeometry() {
  const [element, container] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1100);
  useLayoutEffect(() => {
    if (!element) return;
    const update = (value: number) => {
      if (value > 0) setWidth(value);
    };
    update(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { container, width, ...plotInsets(width) };
}
