import { dataset, datasetConfigs, datasetId, datasetHome } from '../datasets';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function DatasetSwitch({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState({ left: 0, top: 0, width: 160 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const box = trigger.current!.getBoundingClientRect();
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const viewport = window.visualViewport;
      const edge = viewport?.offsetLeft ?? 0;
      const available = viewport?.width ?? innerWidth;
      const width = Math.min(160 * zoom, available - 24);
      setPlacement({
        left: Math.max(edge + 12, Math.min(box.left, edge + available - width - 12)) / zoom,
        top: (box.bottom + 8) / zoom,
        width: width / zoom,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="dataset-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="dataset-trigger"
        aria-label="切换数据集"
        aria-describedby="current-dataset"
        aria-expanded={open}
        aria-controls="dataset-options"
        onClick={() => setOpen((value) => !value)}
      >
        <span id="current-dataset">{dataset.title}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <nav id="dataset-options" className="dataset-options" aria-label="数据集" style={placement}>
          {(['converter', 'wind'] as const).map((id) => (
            <a
              key={id}
              href={datasetHome(id, page)}
              aria-current={datasetId === id ? 'true' : undefined}
              onClick={() => setOpen(false)}
            >
              {datasetConfigs[id].title}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
