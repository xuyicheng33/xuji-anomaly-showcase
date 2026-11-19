import { colors } from './ReportUI';
import type { CurveScale } from './Curve';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => value * value * (3 - 2 * value);

/** Sub-steps of the reference material, as shares of the material phase. */
export const referenceSteps = [0.2, 0.65, 1];
export function referenceStep(materialProgress: number) {
  return materialProgress <= 0.25 ? 0 : materialProgress <= 0.65 ? 1 : 2;
}

/**
 * The reference segment drawn over the target interval of the main chart, reversed in time
 * and flipped in value where it stands, so the axes never change between steps.
 */
export function ReferenceOverlay({
  scale,
  values,
  begin,
  progress,
}: {
  scale: CurveScale;
  values: number[];
  begin: number;
  progress: number;
}) {
  const reverse = ease(clamp((progress - 0.25) / 0.4));
  const flip = ease(clamp((progress - 0.65) / 0.35));
  const appear = ease(clamp(progress / 0.12));
  const last = values.length - 1;
  const points = values.map((value, index) => ({
    position: index + (last - 2 * index) * reverse,
    value: value + (1 - 2 * value) * flip,
    index,
  }));
  const path = points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${scale.x(begin + point.position).toFixed(2)},${scale
          .y(point.value)
          .toFixed(2)}`,
    )
    .join(' ');
  const endpoints = [points[0], points[last]];
  return (
    <g
      className="reference-construction"
      data-reference-step={referenceStep(progress)}
      opacity={appear}
    >
      <path
        d={path}
        fill="none"
        stroke={colors.ink}
        strokeWidth="2"
        strokeDasharray="6 4"
        strokeLinejoin="round"
      />
      {endpoints.map((point, index) => {
        const cx = scale.x(begin + point.position),
          cy = scale.y(point.value);
        const below = cy - 16 < scale.top;
        return (
          <g
            key={point.index}
            data-source-point={point.index}
            data-position={point.position}
            data-value={point.value}
          >
            <circle cx={cx} cy={cy} r="4.5" fill={index === 0 ? colors.input : colors.ink} />
            <text
              x={cx}
              y={below ? cy + 20 : cy - 11}
              textAnchor="middle"
              className="reference-end"
            >
              {index === 0 ? '起' : '末'}
            </text>
          </g>
        );
      })}
    </g>
  );
}
