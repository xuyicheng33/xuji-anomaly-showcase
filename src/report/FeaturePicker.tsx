import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Feature } from '../journey';
import {
  featureGroup,
  featureGroups,
  featureName,
  matchesFeature,
  type FeatureGroup,
} from './featureNames';

export default function FeaturePicker({
  features,
  value,
  onChange,
  label = '测点',
  name = '选择测点',
  aggregate = false,
}: {
  features: Feature[];
  value: number;
  onChange: (value: number) => void;
  label?: string;
  name?: string;
  aggregate?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState<FeatureGroup>('全部');
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: 0, top: 0, width: 0, maxHeight: 0 });
  const id = useId();
  const current = features.find((feature) => feature.index === value);
  const filtered = features.filter((feature) => matchesFeature(feature, query, group));
  const groups = featureGroups.filter(
    (item) => item === '全部' || features.some((feature) => featureGroup(feature) === item),
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const inside = (target: Node | null) =>
    !!target && (!!root.current?.contains(target) || !!panel.current?.contains(target));
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!trigger.current) return;
      const box = trigger.current.getBoundingClientRect();
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? innerWidth;
      const viewportHeight = viewport?.height ?? innerHeight;
      const bottomEdge = topEdge + viewportHeight;
      const gap = 8 * zoom;
      const margin = 12;
      const below = bottomEdge - box.bottom - gap - margin;
      const above = box.top - topEdge - gap - margin;
      const detached = Math.max(below, above) < 280 * zoom;
      const down = below >= 360 * zoom || below >= above;
      const available = detached ? viewportHeight - margin * 2 : down ? below : above;
      const height = Math.min(540 * zoom, available);
      const width = Math.min(Math.max(box.width, 280 * zoom), viewportWidth - margin * 2);
      const left = Math.max(
        leftEdge + margin,
        Math.min(box.left, leftEdge + viewportWidth - width - margin),
      );
      const top = detached
        ? topEdge + margin
        : down
          ? box.bottom + gap
          : Math.max(topEdge + margin, box.top - gap - height);
      const next = {
        left: left / zoom,
        top: top / zoom,
        width: width / zoom,
        maxHeight: height / zoom,
      };
      setPlacement((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!inside(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choose = (index: number) => {
    onChange(index);
    close();
  };
  return (
    <div className="field feature-field">
      <span>{label}</span>
      <div
        ref={root}
        className="feature-picker"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        onBlur={(event) => {
          if (!inside(event.relatedTarget as Node)) setOpen(false);
        }}
      >
        <button
          ref={trigger}
          type="button"
          className="feature-trigger"
          aria-label={name}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={id}
          data-value={value}
          onClick={() => {
            if (open) close();
            else {
              setQuery('');
              setGroup('全部');
              setOpen(true);
            }
          }}
        >
          <span>
            {value < 0 && aggregate ? '全部测点平均' : current ? featureName(current) : '选择测点'}
            {current && <small>{current.key}</small>}
          </span>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3 4 3 3 3-3" />
          </svg>
        </button>
        {open &&
          createPortal(
            <div
              ref={panel}
              id={id}
              className="feature-panel"
              role="dialog"
              aria-label={`${name}列表`}
              style={placement}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                }
              }}
              onBlur={(event) => {
                if (!inside(event.relatedTarget as Node)) setOpen(false);
              }}
            >
              <div className="feature-search">
                <input
                  ref={search}
                  type="search"
                  aria-label="搜索测点"
                  placeholder="搜索名称或测点编号"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      panel.current?.querySelector<HTMLButtonElement>('.feature-option')?.focus();
                    }
                  }}
                />
                <button type="button" className="text-button" onClick={close}>
                  取消
                </button>
              </div>
              <div className="feature-groups" aria-label="测点分类">
                {groups.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={group === item}
                    onClick={() => setGroup(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div
                className="feature-options"
                onKeyDown={(event) => {
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  const buttons = Array.from(
                    panel.current?.querySelectorAll<HTMLButtonElement>('.feature-option') ?? [],
                  );
                  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? buttons.length - 1
                        : Math.max(
                            0,
                            Math.min(buttons.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)),
                          );
                  event.preventDefault();
                  buttons[next]?.focus();
                }}
              >
                {aggregate && group === '全部' && !query.trim() && (
                  <button
                    type="button"
                    className="feature-option"
                    data-value={-1}
                    aria-pressed={value < 0}
                    onClick={() => choose(-1)}
                  >
                    全部测点平均
                  </button>
                )}
                {filtered.map((feature) => (
                  <button
                    key={feature.key}
                    type="button"
                    className="feature-option"
                    data-value={feature.index}
                    aria-pressed={value === feature.index}
                    onClick={() => choose(feature.index)}
                  >
                    <span>{featureName(feature)}</span>
                    <small>{feature.key}</small>
                  </button>
                ))}
                {!filtered.length && (
                  <p className="feature-no-results" role="status">
                    没有匹配的测点
                  </p>
                )}
              </div>
              <p className="feature-result-count">
                {filtered.length} / {features.length} 个测点
              </p>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
