import { useId, useEffect, useRef, useState } from 'react';
import { colors } from './ReportUI';
import { curveDomain, curveTick } from './curveScale';
import { Footnote, type NoteId } from './notes';
import { usePlaybackScale, type PlaybackScale } from './usePlaybackScale';
export default function Curve({
  lines,
  labels = [],
  selection,
  selected,
  reveal,
  threshold,
  height = 220,
  start = 0,
  onSelect,
  times,
  title,
  range,
  axisUnit = '点',
  note,
  reference,
  playbackScale,
}: {
  lines: {
    name: string;
    values: (number | null)[];
    color: string;
    dash?: boolean;
    opacity?: number;
  }[];
  labels?: number[];
  /** Inclusive local sample range, independently rendered from anomaly labels. */
  selection?: { start: number; end: number };
  selected?: number;
  reveal?: number;
  threshold?: number;
  height?: number;
  start?: number;
  onSelect?: (n: number) => void;
  times?: string[];
  title: string;
  range?: [number, number];
  axisUnit?: string;
  note?: NoteId;
  reference?: string;
  playbackScale?: PlaybackScale;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const uid = useId().replace(/:/g, '');
  const W = width,
    L = width < 550 ? 48 : 62,
    R = width < 550 ? 12 : 18,
    T = 20,
    B = 32,
    n = Math.max(2, ...lines.map((l) => l.values.length));
  const nums = lines
    .flatMap((l) => (playbackScale ? l.values.slice(0, reveal) : l.values))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (threshold !== undefined) nums.push(threshold);
  const [lo, hi] = usePlaybackScale(curveDomain(nums, range), playbackScale, reveal === 0);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R),
    y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (height - T - B);
  const path = (vs: (number | null)[]) => {
    let pen = false;
    return vs
      .map((v, i) => {
        if (v === null || !Number.isFinite(v) || (reveal !== undefined && i >= reveal)) {
          pen = false;
          return '';
        }
        const s = (pen ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(v).toFixed(2);
        pen = true;
        return s;
      })
      .join(' ');
  };
  const intervals: { start: number; end: number }[] = [];
  labels.slice(0, Math.min(n, reveal ?? n)).forEach((value, i) => {
    if (!value) return;
    const previous = intervals[intervals.length - 1];
    if (previous?.end === i - 1) previous.end = i;
    else intervals.push({ start: i, end: i });
  });
  return (
    <div className="curve" ref={container} data-y-min={lo} data-y-max={hi}>
      <div className="curve-top">
        <strong>
          {title}
          {note && <Footnote note={note} reference={reference} />}
        </strong>
        <div className="legend">
          {lines.map((l) => (
            <span key={l.name}>
              <i
                className={l.dash ? 'line-dashed' : undefined}
                style={{ background: l.dash ? 'none' : l.color, borderColor: l.color }}
              />
              {l.name}
            </span>
          ))}
          {threshold !== undefined && (
            <span>
              <i className="dashed" />
              阈值
            </span>
          )}
        </div>
      </div>
      <svg
        viewBox={'0 0 ' + W + ' ' + height}
        role="img"
        aria-label={title}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSelect?.(
            Math.max(
              0,
              Math.min(
                n - 1,
                Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (n - 1)),
              ),
            ),
          );
        }}
      >
        <defs>
          <clipPath id={uid}>
            <rect x={L} y={T} width={W - L - R} height={height - T - B} />
          </clipPath>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={W - R}
              y1={y(lo + (hi - lo) * t)}
              y2={y(lo + (hi - lo) * t)}
              stroke="#deded6"
            />
            <text x={L - 10} y={y(lo + (hi - lo) * t) + 4} textAnchor="end">
              {curveTick(lo + (hi - lo) * t, hi - lo)}
            </text>
          </g>
        ))}
        <g clipPath={'url(#' + uid + ')'}>
          {selection && (
            <rect
              className="curve-selection"
              data-selection-start={selection.start}
              data-selection-end={selection.end}
              x={x(selection.start)}
              y={T}
              width={x(selection.end) - x(selection.start)}
              height={height - T - B}
              fill="#355f7b"
              opacity=".12"
            />
          )}
          {intervals.map((interval) =>
            interval.start === interval.end ? (
              <line
                key={interval.start}
                data-anomaly-start={interval.start}
                data-anomaly-end={interval.end}
                x1={x(interval.start)}
                x2={x(interval.end)}
                y1={T}
                y2={height - B}
                stroke="#d99763"
                strokeWidth="3"
                opacity=".35"
              />
            ) : (
              <rect
                key={interval.start}
                data-anomaly-start={interval.start}
                data-anomaly-end={interval.end}
                x={x(interval.start)}
                y={T}
                width={x(interval.end) - x(interval.start)}
                height={height - T - B}
                fill="#d99763"
                opacity=".16"
              />
            ),
          )}
          {threshold !== undefined && (
            <line
              x1={L}
              x2={W - R}
              y1={y(threshold)}
              y2={y(threshold)}
              stroke={colors.anomaly}
              strokeWidth="1.5"
              strokeDasharray="7 5"
            />
          )}
          {lines.map((l) => (
            <path
              key={l.name}
              d={path(l.values)}
              fill="none"
              stroke={l.color}
              opacity={l.opacity ?? 1}
              strokeWidth="2"
              strokeDasharray={l.dash ? '6 4' : undefined}
              strokeLinejoin="round"
            />
          ))}
          {selected !== undefined && selected >= 0 && (
            <g>
              <line
                x1={x(selected)}
                x2={x(selected)}
                y1={T}
                y2={height - B}
                stroke="#77796c"
                strokeDasharray="3 4"
              />
              {lines.map(
                (l) =>
                  l.values[selected] != null && (
                    <circle
                      key={l.name}
                      cx={x(selected)}
                      cy={y(l.values[selected]!)}
                      r="4"
                      fill={l.color}
                    />
                  ),
              )}
            </g>
          )}
        </g>
        {(width < 550 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((t) => {
          const i = Math.round(t * (n - 1));
          return (
            <text
              key={t}
              x={x(i)}
              y={height - 7}
              textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
            >
              {times?.[i]?.slice(5) || '第 ' + (start + i + 1) + ' ' + axisUnit}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
