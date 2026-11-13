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
    const update = () =>
      setOverflow({
        x: scroller.scrollWidth > scroller.clientWidth + 1,
        y: scroller.scrollHeight > scroller.clientHeight + 1,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [id]);
  return (
    <p
      className="reference-table-hint"
      id={id}
      hidden={!overflow.x && !(overflow.y && verticalHint)}
    >
      {overflow.x ? children : verticalHint}
    </p>
  );
}
