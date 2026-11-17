import { useLayoutEffect, useState, type ReactNode } from 'react';

export default function TableScrollHint({
  id,
  children,
  verticalHint,
}: {
  id: string;
  children: ReactNode;
  verticalHint?: ReactNode;
}) {
  const [overflow, setOverflow] = useState({ x: false, y: false });
  useLayoutEffect(() => {
    const scroller = document.querySelector<HTMLElement>(`[aria-describedby~="${CSS.escape(id)}"]`);
    if (!scroller) return;
    // The layout shows remaining content by fading the edge that still scrolls.
    const update = () => {
      const x = scroller.scrollWidth > scroller.clientWidth + 1,
        y = scroller.scrollHeight > scroller.clientHeight + 1;
      setOverflow({ x, y });
      const more = [
        x && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1 && 'end',
        x && scroller.scrollLeft > 1 && 'start',
        y && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1 && 'bottom',
      ].filter(Boolean);
      if (more.length) scroller.dataset.more = more.join(' ');
      else delete scroller.dataset.more;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, [id]);
  return (
    <p
      className="reference-table-hint sr-only"
      id={id}
      hidden={!overflow.x && !(overflow.y && verticalHint)}
    >
      {overflow.x ? children : verticalHint}
    </p>
  );
}
