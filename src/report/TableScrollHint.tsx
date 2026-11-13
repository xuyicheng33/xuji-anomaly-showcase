import { useLayoutEffect, useState, type ReactNode } from 'react';

export default function TableScrollHint({ id, children }: { id: string; children: ReactNode }) {
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(id)}"]`);
    if (!scroller) return;
    const update = () => setOverflow(scroller.scrollWidth > scroller.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [id]);
  return (
    <p className="reference-table-hint" id={id} hidden={!overflow}>
      {children}
    </p>
  );
}
