import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { colors } from './ReportUI';
import { curveDomain, indexTicks, tickLabel, valueTicks } from './curveScale';
import { Footnote, type NoteId } from './notes';
import { usePlaybackScale, type PlaybackScale } from './usePlaybackScale';
import { usePlotGeometry } from './usePlotGeometry';
export default function Curve({
  lines,
  labels = [],
  labelKey,
  selection,
  selectionLabel,
  selected,
  reveal,
  threshold,
  thresholdLabel = '阈值',
  legend = true,
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
  labelKey?: string;
  /** Inclusive local sample range, independently rendered from anomaly labels. */
  selection?: { start: number; end: number };
  /** Legend entry for the shaded selection, such as the chosen window. */
  selectionLabel?: string;
  selected?: number;
  reveal?: number;
  threshold?: number;
  /** Legend text for the threshold line, e.g. the value it is drawn at. */
  thresholdLabel?: ReactNode;
  /** Off for charts that always show one series named by their title or picker. */
  legend?: boolean;
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
  const { container, width, left: L, right: R } = usePlotGeometry();
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = width,
    T = 20,
    B = 32,
    n = Math.max(2, ...lines.map((l) => l.values.length));
  const nums = lines
    .flatMap((l) => (playbackScale ? l.values.slice(0, reveal) : l.values))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (threshold !== undefined) nums.push(threshold);
  const [lo, hi] = usePlaybackScale(curveDomain(nums, range), playbackScale, reveal === 0);
  const yTicks = valueTicks(lo, hi);
  const tickCount = width < 240 ? 1 : width < 420 ? 2 : width < (times ? 800 : 550) ? 3 : 5;
  // Times keep evenly spread positions; point and epoch numbers use round steps.
  const xTicks =
    tickCount === 1
      ? [Math.round((n - 1) / 2)]
      : times
        ? Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (n - 1)))
        : indexTicks(start + 1, start + n, tickCount).map((label) => label - start - 1);
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
  const indexAt = (clientX: number, box: DOMRect) =>
    Math.max(
      0,
      Math.min(
        n - 1,
        Math.round(((((clientX - box.left) / box.width) * W - L) / (W - L - R)) * (n - 1)),
      ),
    );
  const track = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'mouse') return;
    const i = indexAt(event.clientX, event.currentTarget.getBoundingClientRect());
    const shown = reveal === undefined || i < reveal;
    setHover(shown ? i : null);
  };
  const hoverValues =
    hover === null
      ? []
      : lines.flatMap((l) => {
          const v = l.values[hover];
          return v === null || v === undefined || !Number.isFinite(v) ? [] : [{ ...l, v }];
        });
  const digits = threshold !== undefined ? 9 : 4;
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
        {legend && (
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
                {thresholdLabel}
              </span>
            )}
            {selection && selectionLabel && (
              <span>
                <i className="selection-swatch" />
                {selectionLabel}
              </span>
            )}
            {labelKey && intervals.length > 0 && (
              <span>
                <i className="label-swatch" />
                {labelKey}
              </span>
            )}
          </div>
        )}
      </div>
      <svg
        viewBox={'0 0 ' + W + ' ' + height}
        role="img"
        aria-label={title}
        tabIndex={onSelect ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onSelect || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          onSelect(
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? n - 1
                : Math.max(
                    0,
                    Math.min(n - 1, (selected ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)),
                  ),
          );
        }}
        onClick={(e) => onSelect?.(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerMove={track}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={uid}>
            <rect x={L} y={T} width={W - L - R} height={height - T - B} />
          </clipPath>
        </defs>
        {yTicks.values.map((value) => (
          <g key={value}>
            <line x1={L} x2={W - R} y1={y(value)} y2={y(value)} stroke="var(--line)" />
            <text x={L - 10} y={y(value) + 4} textAnchor="end">
              {tickLabel(value, yTicks.step)}
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
              fill="var(--blue)"
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
                stroke="var(--chart-label)"
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
                fill="var(--chart-label)"
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
          <g className="curve-lines">
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
          </g>
          {hover !== null && hover !== selected && (
            <g className="curve-hover" aria-hidden="true">
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={height - B} />
              {hoverValues.map((l) => (
                <circle key={l.name} cx={x(hover)} cy={y(l.v)} r="3.5" stroke={l.color} />
              ))}
            </g>
          )}
          {selected !== undefined && selected >= 0 && (
            <g>
              <line
                x1={x(selected)}
                x2={x(selected)}
                y1={T}
                y2={height - B}
                stroke="var(--chart-cursor)"
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
        {xTicks.map((i, k) => (
          <text
            key={i}
            x={width < 240 ? W / 2 : x(i)}
            y={height - 7}
            textAnchor={
              width < 240
                ? 'middle'
                : k === 0
                  ? 'start'
                  : k === xTicks.length - 1
                    ? 'end'
                    : 'middle'
            }
          >
            {times?.[i]?.slice(5) || '第 ' + (start + i + 1) + ' ' + axisUnit}
          </text>
        ))}
      </svg>
      {hover !== null && hoverValues.length > 0 && (
        <div
          className={'curve-readout' + (x(hover) > W * 0.62 ? ' is-left' : '')}
          style={{ left: `${(x(hover) / W) * 100}%` }}
          aria-hidden="true"
        >
          <span>{times?.[hover] ?? '第 ' + (start + hover + 1) + ' ' + axisUnit}</span>
          {hoverValues.map((l) => (
            <span key={l.name}>
              <i style={{ background: l.color }} />
              {l.name}
              <strong>{l.v.toFixed(digits)}</strong>
            </span>
          ))}
        </div>
      )}
      {width < 240 && (
        <p className="curve-range">
          {times ? `${times[0]} — ${times[n - 1]}` : `第 ${start + 1}—${start + n} ${axisUnit}`}
        </p>
      )}
    </div>
  );
}
