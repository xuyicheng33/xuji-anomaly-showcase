import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Short contextual help. Longer methodology remains in the linked explanations. */
export default function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280 });
  const reveal = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpen(false);
  }, []);
  const leave = () => {
    clearTimeout(timer.current);
    if (document.activeElement !== trigger.current)
      timer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current!.getBoundingClientRect();
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const available = viewport?.width ?? innerWidth;
      const bottom = topEdge + (viewport?.height ?? innerHeight);
      const width = Math.min(280 * zoom, available - 24);
      const height = panel.current?.getBoundingClientRect().height ?? 100;
      setPosition({
        left: Math.max(leftEdge + 12, Math.min(box.left, leftEdge + available - width - 12)) / zoom,
        top:
          Math.max(
            topEdge + 12,
            box.bottom + height + 20 < bottom ? box.bottom + 8 : box.top - height - 8,
          ) / zoom,
        width: width / zoom,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, dismiss]);
  return (
    <span className="info-tip">
      <button
        ref={trigger}
        type="button"
        className="info-trigger"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={reveal}
        onBlur={dismiss}
        onClick={() => {
          if (pinned.current) dismiss();
          else {
            pinned.current = true;
            reveal();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') reveal();
        }}
        onPointerLeave={leave}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v5" />
          <circle className="info-dot" cx="10" cy="6" r=".8" />
        </svg>
      </button>
      {open &&
        createPortal(
          <span
            ref={panel}
            id={id}
            className="info-tooltip"
            role="tooltip"
            style={position}
            onPointerEnter={reveal}
            onPointerLeave={leave}
          >
            {children}
          </span>,
          document.body,
        )}
    </span>
  );
}
