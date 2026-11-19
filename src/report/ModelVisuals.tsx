import { useId, useState } from 'react';
import type { Visual } from './modelArchitecture';

const round = (value: number) => Math.round(value * 10) / 10;
const line = (points: [number, number][]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ');

/** A deterministic periodic signal: one dominant period plus a faster ripple and noise. */
const SIGNAL = Array.from({ length: 64 }, (_, t) => {
  const noise = Math.sin(t * 12.9898) * 43758.5453;
  return (
    Math.sin((2 * Math.PI * t) / 16) +
    0.35 * Math.sin((2 * Math.PI * t) / 5 + 1) +
    0.18 * (noise - Math.floor(noise) - 0.5)
  );
});
const SPECTRUM = Array.from({ length: 16 }, (_, k) => {
  const f = k + 1;
  let re = 0,
    im = 0;
  SIGNAL.forEach((v, t) => {
    re += v * Math.cos((2 * Math.PI * f * t) / SIGNAL.length);
    im -= v * Math.sin((2 * Math.PI * f * t) / SIGNAL.length);
  });
  return Math.hypot(re, im);
});
const DOMINANT = SPECTRUM.indexOf(Math.max(...SPECTRUM));
const MASK = [24, 40] as const;

function seriesPath(values: number[], width: number, height: number, pad = 8) {
  const min = Math.min(...values),
    max = Math.max(...values);
  return values.map(
    (v, i) =>
      [
        (i / (values.length - 1)) * width,
        pad + (1 - (v - min) / (max - min)) * (height - 2 * pad),
      ] as [number, number],
  );
}

function FftVisual() {
  const points = seriesPath(SIGNAL, 180, 96);
  const peak = Math.max(...SPECTRUM);
  const step = 180 / SPECTRUM.length;
  const x0 = (MASK[0] / 63) * 180,
    x1 = (MASK[1] / 63) * 180;
  const pattern = useId();
  return (
    <div className="model-visual-steps">
      <figure>
        <svg viewBox="0 0 180 96" aria-hidden="true">
          <path className="visual-line" d={line(points)} />
        </svg>
        <figcaption>时间序列</figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 180 96" aria-hidden="true">
          {SPECTRUM.map((amp, i) => (
            <rect
              key={i}
              className={i === DOMINANT ? 'visual-bar is-dominant' : 'visual-bar'}
              x={i * step + 2}
              width={step - 4}
              y={96 - (amp / peak) * 84}
              height={(amp / peak) * 84}
            />
          ))}
        </svg>
        <figcaption>FFT 振幅与主导频率</figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 180 96" aria-hidden="true">
          <defs>
            <pattern id={pattern} width="4" height="4" patternUnits="userSpaceOnUse">
              <path className="visual-hatch" d="M0 4 L4 0" />
            </pattern>
          </defs>
          <rect x={x0} y="0" width={x1 - x0} height="96" fill={`url(#${pattern})`} />
          <path className="visual-line" d={line(points.filter((_, i) => i <= MASK[0]))} />
          <path className="visual-line" d={line(points.filter((_, i) => i >= MASK[1]))} />
          <path
            className="visual-line is-muted"
            d={line(points.filter((_, i) => i >= MASK[0] && i <= MASK[1]))}
          />
        </svg>
        <figcaption>掩码后</figcaption>
      </figure>
    </div>
  );
}

/** Dots and links for a stack of causal convolutions; `dilations` lists each layer. */
function ConvTree({
  dilations,
  inputs,
  kernel = 2,
  padding = 0,
}: {
  dilations: number[];
  inputs: number;
  kernel?: number;
  padding?: number;
}) {
  const width = 320,
    rowGap = 34,
    count = inputs + padding,
    left = 12,
    dx = (width - 2 * left) / (count - 1),
    height = rowGap * dilations.length + 16;
  const x = (t: number) => left + (t + padding) * dx,
    y = (layer: number) => height - 8 - layer * rowGap;
  // Walk back from the newest output to find every position it reads.
  const active: Set<number>[] = [new Set([inputs - 1])];
  const links: [number, number, number][] = [];
  for (let layer = dilations.length; layer > 0; layer--) {
    const next = new Set<number>();
    for (const t of active[0]) {
      for (let j = 0; j < kernel; j++) {
        const source = t - j * dilations[layer - 1];
        if (source < -padding) continue;
        next.add(source);
        links.push([layer, t, source]);
      }
    }
    active.unshift(next);
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {links.map(([layer, t, source], i) => (
        <path
          key={i}
          className="visual-link"
          d={`M${round(x(t))} ${y(layer)} L${round(x(source))} ${y(layer - 1)}`}
        />
      ))}
      {dilations.concat(0).map((_, layer) =>
        Array.from({ length: layer ? inputs : count }, (_, i) => {
          const t = layer ? i : i - padding;
          return (
            <circle
              key={`${layer}-${t}`}
              cx={round(x(t))}
              cy={y(layer)}
              r={t < 0 ? 3 : 2.5}
              className={
                t < 0
                  ? 'visual-dot is-padding'
                  : active[layer]?.has(t)
                    ? 'visual-dot is-active'
                    : 'visual-dot'
              }
            />
          );
        }),
      )}
    </svg>
  );
}

function TcnVisual() {
  return (
    <figure className="model-visual-single">
      <ConvTree dilations={[1, 2, 4, 8]} inputs={16} />
    </figure>
  );
}

function CausalVisual() {
  return (
    <figure className="model-visual-single">
      <ConvTree dilations={[1, 1]} inputs={12} kernel={3} padding={2} />
      <figcaption>空心点为左侧零填充</figcaption>
    </figure>
  );
}

function MultiscaleVisual() {
  return (
    <div className="model-visual-steps">
      {[
        [1, '较小空洞率'],
        [2, '中等空洞率'],
        [4, '较大空洞率'],
      ].map(([d, name]) => (
        <figure key={name}>
          <ConvTree dilations={[d as number, d as number]} inputs={12} />
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function LossVisual() {
  const [error, setError] = useState(0.6);
  const width = 320,
    height = 180,
    left = 16,
    bottom = 160,
    top = 12;
  const sx = (v: number) => left + (v / 2) * (width - left - 8),
    sy = (v: number) => bottom - (v / 3) * (bottom - top);
  const reached = error >= 1;
  const id = useId();
  return (
    <div className="loss-visual">
      <svg viewBox={`0 0 ${width} ${height + 4}`} aria-hidden="true">
        <path className="visual-axis" d={`M${left} ${top} V${bottom} H${width - 8}`} />
        <path className="visual-guide" d={`M${sx(1)} ${top} V${bottom}`} />
        <text className="visual-label" x={sx(1)} y={bottom + 16} textAnchor="middle">
          bound
        </text>
        <text className="visual-label" x={left} y={bottom + 16} textAnchor="middle">
          0
        </text>
        <path
          className="visual-line"
          d={line([
            [sx(0), sy(1)],
            [sx(2), sy(3)],
          ])}
        />
        <path
          className="visual-line is-anomaly"
          d={line([
            [sx(0), sy(1)],
            [sx(1), sy(0)],
            [sx(2), sy(0)],
          ])}
        />
        <path className="visual-cursor" d={`M${sx(error)} ${top} V${bottom}`} />
        <circle className="visual-point" cx={sx(error)} cy={sy(1 + error)} r="4" />
        <circle
          className="visual-point is-anomaly"
          cx={sx(error)}
          cy={sy(Math.max(0, 1 - error))}
          r="4"
        />
      </svg>
      <label className="loss-visual-control" htmlFor={id}>
        <span>重建误差</span>
        <input
          id={id}
          type="range"
          min="0"
          max="2"
          step="0.02"
          value={error}
          onChange={(e) => setError(Number(e.target.value))}
        />
      </label>
      <dl className="loss-visual-readout">
        <div>
          <dt>
            <i className="legend-swatch" />
            正常时刻
          </dt>
          <dd>持续压缩重建误差</dd>
        </div>
        <div>
          <dt>
            <i className="legend-swatch is-anomaly" />
            异常时刻
          </dt>
          <dd key={String(reached)} className="value-tick">
            {reached ? '到达 bound，梯度归零' : '推动误差增大'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const CORRELATION = [
  [1, 0.82, 0.64, 0.18, 0.08, 0.31],
  [0.82, 1, 0.71, 0.22, 0.12, 0.27],
  [0.64, 0.71, 1, 0.43, 0.2, 0.14],
  [0.18, 0.22, 0.43, 1, 0.77, 0.58],
  [0.08, 0.12, 0.2, 0.77, 1, 0.69],
  [0.31, 0.27, 0.14, 0.58, 0.69, 1],
];

function Matrix({
  cell,
}: {
  cell: (i: number, j: number) => { className: string; opacity?: number };
}) {
  const size = 20,
    gap = 3;
  return (
    <svg viewBox={`0 0 ${6 * (size + gap) - gap} ${6 * (size + gap) - gap}`} aria-hidden="true">
      {CORRELATION.map((row, i) =>
        row.map((_, j) => {
          const { className, opacity } = cell(i, j);
          return (
            <rect
              key={`${i}-${j}`}
              x={j * (size + gap)}
              y={i * (size + gap)}
              width={size}
              height={size}
              rx="2"
              className={className}
              style={opacity === undefined ? undefined : { fillOpacity: opacity }}
            />
          );
        }),
      )}
    </svg>
  );
}

function SpatialVisual() {
  const [threshold, setThreshold] = useState(0.5);
  const id = useId();
  const kept = CORRELATION.flat().filter((v, k) => k % 7 !== 0 && v > threshold).length / 2;
  return (
    <div className="spatial-visual">
      <div className="model-visual-steps is-two">
        <figure>
          <Matrix
            cell={(i, j) => ({ className: 'visual-cell is-value', opacity: CORRELATION[i][j] })}
          />
          <figcaption>相关系数绝对值</figcaption>
        </figure>
        <figure>
          <Matrix
            cell={(i, j) => ({
              className: CORRELATION[i][j] > threshold ? 'visual-cell is-kept' : 'visual-cell',
            })}
          />
          <figcaption>
            空间掩码，保留{' '}
            <span className="value-tick" key={kept}>
              {kept}
            </span>{' '}
            对变量
          </figcaption>
        </figure>
      </div>
      <label className="loss-visual-control" htmlFor={id}>
        <span>阈值 τ</span>
        <input
          id={id}
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <output htmlFor={id}>{threshold.toFixed(2)}</output>
      </label>
    </div>
  );
}

function RegularizerVisual() {
  const anomalous = (k: number) => k < 2;
  return (
    <div className="regularizer-visual">
      <figure className="model-visual-single">
        <div className="regularizer-grid">
          <span className="regularizer-axis is-top" aria-hidden="true">
            <i>𝒜</i>
            <i>𝒩</i>
          </span>
          <span className="regularizer-axis is-left" aria-hidden="true">
            <i>𝒜</i>
            <i>𝒩</i>
          </span>
          <Matrix
            cell={(i, j) => ({
              className: !anomalous(i)
                ? 'visual-cell'
                : anomalous(j)
                  ? 'visual-cell is-denominator'
                  : 'visual-cell is-numerator',
            })}
          />
        </div>
      </figure>
      <ul className="regularizer-legend">
        <li>
          <i className="legend-swatch is-numerator" />
          分子：异常变量对正常变量的注意力
        </li>
        <li>
          <i className="legend-swatch is-denominator" />
          分母：异常变量之间的注意力
        </li>
      </ul>
    </div>
  );
}

export function ModelVisual({ visual }: { visual: Visual }) {
  switch (visual) {
    case 'fft':
      return <FftVisual />;
    case 'tcn':
      return <TcnVisual />;
    case 'causal':
      return <CausalVisual />;
    case 'multiscale':
      return <MultiscaleVisual />;
    case 'loss':
      return <LossVisual />;
    case 'spatial':
      return <SpatialVisual />;
    case 'regularizer':
      return <RegularizerVisual />;
  }
}
