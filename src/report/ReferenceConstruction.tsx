import { useEffect, useRef, useState } from 'react';
import { colors } from './ReportUI';
import { curveTick } from './curveScale';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => value * value * (3 - 2 * value);

export default function ReferenceConstruction({
  values,
  progress,
  range,
  sourceStart,
  sourceTime,
  onStep,
}: {
  values: number[];
  progress: number;
  range: [number, number];
  sourceStart: number;
  sourceTime: string;
  onStep: (step: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(860);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const reverse = ease(clamp((progress - 0.25) / 0.4));
  const flip = ease(clamp((progress - 0.65) / 0.35));
  const step = progress <= 0.25 ? 0 : progress <= 0.65 ? 1 : 2;
  const names = ['取参考片段', '时间反转', '幅值翻转'];
  const [lo, hi] = range;
  const left = width < 550 ? 48 : 62;
  const right = width < 550 ? 12 : 18;
  const height = 260;
  const x = (position: number) => left + (position / (values.length - 1)) * (width - left - right);
  const y = (value: number) => 20 + ((hi - value) / (hi - lo || 1)) * (height - 52);
  const points = values.map((value, index) => ({
    position: index + (values.length - 1 - 2 * index) * reverse,
    value: value + (1 - 2 * value) * flip,
    original: value,
    index,
  }));
  const path = points
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.position)},${y(point.value)}`)
    .join(' ');
  const endpoints = [points[0], points[points.length - 1]];
  return (
    <div
      ref={container}
      className="curve reference-construction"
      data-y-min={lo}
      data-y-max={hi}
      data-reference-step={step}
    >
      <div className="reference-origin">
        <span>参考来源</span>
        <p>
          测试集第{sourceStart + 1}—{sourceStart + values.length}点 · {sourceTime}
        </p>
      </div>
      <div className="reference-steps" role="group" aria-label="参考片段变换">
        {names.map((name, index) => (
          <button key={name} aria-pressed={step === index} onClick={() => onStep(index)}>
            {name}
          </button>
        ))}
      </div>
      <div className="curve-top">
        <strong>{names[step]}</strong>
        <span className="reference-rule">
          {step === 0 ? '取出连续24个观测值' : step === 1 ? '第1点 ↔ 第24点' : '新值 = 1 − 原值'}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`参考片段：${names[step]}`}>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1={left}
              x2={width - right}
              y1={y(lo + (hi - lo) * fraction)}
              y2={y(lo + (hi - lo) * fraction)}
              stroke="var(--line)"
            />
            <text x={left - 10} y={y(lo + (hi - lo) * fraction) + 4} textAnchor="end">
              {curveTick(lo + (hi - lo) * fraction, hi - lo)}
            </text>
          </g>
        ))}
        {step === 2 && (
          <line
            x1={left}
            x2={width - right}
            y1={y(0.5)}
            y2={y(0.5)}
            stroke={colors.muted}
            strokeDasharray="4 5"
            opacity=".65"
          />
        )}
        <path d={path} fill="none" stroke={colors.input} strokeWidth="2" strokeLinejoin="round" />
        {points.map((point) => (
          <circle
            key={point.index}
            cx={x(point.position)}
            cy={y(point.value)}
            r="2.5"
            fill={colors.input}
          />
        ))}
        {endpoints.map((point, index) => (
          <g
            key={point.index}
            data-source-point={point.index}
            data-position={point.position}
            data-value={point.value}
          >
            <circle
              cx={x(point.position)}
              cy={y(point.value)}
              r="5"
              fill={index === 0 ? colors.input : colors.ink}
            />
            <text
              x={x(point.position)}
              y={y(point.value) - 13}
              textAnchor="middle"
              fill={colors.ink}
            >
              {index === 0 ? '起' : '末'}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((fraction) => (
          <text
            key={fraction}
            x={x(fraction * (values.length - 1))}
            y={height - 9}
            textAnchor="middle"
          >
            第{Math.round(fraction * (values.length - 1)) + 1}点
          </text>
        ))}
      </svg>
      <div className="reference-values" aria-live="off">
        {endpoints.map((point, index) => (
          <span key={point.index}>
            <i className={index === 0 ? 'reference-first' : 'reference-last'} />
            {index === 0 ? '原起点' : '原末点'} {point.original.toFixed(4)}
            <span>→</span>
            <strong>{point.value.toFixed(4)}</strong>
            <small>第{Math.round(point.position) + 1}点</small>
          </span>
        ))}
      </div>
    </div>
  );
}
