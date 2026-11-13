import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { notes } from './notes';

export default function ExplanationIndex({ address }: { address: string }) {
  const params = new URLSearchParams(address.split('?')[1] ?? '');
  const requested = params.get('note');
  const [active, setActive] = useState(requested ?? notes[0].id);
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const update = () =>
      element
        .closest<HTMLElement>('.explanation-page')
        ?.style.setProperty(
          '--explanation-scroll-offset',
          `${element.getBoundingClientRect().height + 24}px`,
        );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = (nav.current?.getBoundingClientRect().height ?? 0) + 40;
        let current: string = notes[0].id;
        for (const note of notes) {
          if (
            (document.getElementById(`note-${note.id}`)?.getBoundingClientRect().top ?? Infinity) <=
            edge
          )
            current = note.id;
        }
        setActive(current);
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [address]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const index = Math.max(
    0,
    notes.findIndex((note) => note.id === active),
  );
  return (
    <nav
      className="explanation-navigation"
      aria-label="说明目录"
      ref={nav}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        className="explanation-index-toggle"
        ref={trigger}
        aria-expanded={open}
        aria-controls="explanation-index"
        onClick={() => setOpen((value) => !value)}
      >
        <span>说明目录</span>
        <span className="explanation-current">
          {String(index + 1).padStart(2, '0')} · {notes[index].title}
        </span>
        <span aria-hidden="true">{open ? '收起' : '展开'}</span>
      </button>
      <div id="explanation-index" className="explanation-index" hidden={!open}>
        {notes.map((note, i) => (
          <a
            key={note.id}
            href={
              '#/metrics?' + new URLSearchParams({ ...Object.fromEntries(params), note: note.id })
            }
            aria-current={active === note.id ? 'location' : undefined}
            onClick={() => {
              setOpen(false);
              if (requested === note.id)
                requestAnimationFrame(() => {
                  const section = document.getElementById(`note-${note.id}`);
                  section?.scrollIntoView({ block: 'start' });
                  section?.focus({ preventScroll: true });
                });
            }}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {note.title}
          </a>
        ))}
      </div>
    </nav>
  );
}
