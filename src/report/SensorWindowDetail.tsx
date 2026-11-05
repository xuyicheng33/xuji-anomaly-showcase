import { useEffect, useState } from 'react';
import { errorColor, sensorWindows, type SensorWindow } from '../contributions';
import type { Journey, Model } from '../journey';
import { useCurveData } from './useCurveData';
import { curveDomain, curveTick } from './curveScale';
import { colors } from './ReportUI';
import { Footnote } from './notes';

const decimal = (value: number) => value.toFixed(9);

function WindowPlot({ rows, selected }: { rows: SensorWindow[]; selected: number }) {
  const [low, high] = curveDomain(rows.flatMap((row) => [row.input, row.prediction]));
  const x = (i: number) => 58 + (i / Math.max(1, rows.length - 1)) * 424;
  const y = (v: number) => 18 + ((high - v) / (high - low)) * 106;
  return (
    <div className="window-reconstruction-plot">
      <div className="legend">
        <span>
          <i style={{ background: colors.input }} />
          输入值
        </span>
        <span>
          <i style={{ background: colors.recon }} />
          各窗口重建
        </span>
      </div>
      <svg viewBox="0 0 500 156" role="img" aria-label="同一输入值与各覆盖窗口的重建值">
        {[low, (low + high) / 2, high].map((value) => (
          <g key={value}>
            <line x1="58" x2="482" y1={y(value)} y2={y(value)} stroke="var(--line)" />
            <text x="50" y={y(value) + 4} textAnchor="end">
              {curveTick(value, high - low)}
            </text>
          </g>
        ))}
        <line
          x1="58"
          x2="482"
          y1={y(rows[0].input)}
          y2={y(rows[0].input)}
          stroke={colors.input}
          strokeWidth="1.5"
        />
        {rows.map((row, i) => (
          <circle
            key={row.start}
            cx={x(i)}
            cy={y(row.prediction)}
            r={i === selected ? 4.5 : 2.5}
            fill={colors.recon}
            stroke={i === selected ? colors.input : 'none'}
          >
            <title>{`窗口 ${row.start + 1}：重建 ${decimal(row.prediction)}`}</title>
          </circle>
        ))}
        <text x="58" y="148">
          第 {rows[0].start + 1} 个窗口
        </text>
        <text x="482" y="148" textAnchor="end">
          第 {rows.at(-1)!.start + 1} 个窗口
        </text>
      </svg>
    </div>
  );
}

export default function SensorWindowDetail({
  data,
  model,
  index,
  feature,
  meanError,
  close,
}: {
  data: Journey;
  model: Model;
  index: number;
  feature: number;
  meanError: number;
  close: () => void;
}) {
  const inputAsset = useCurveData(data.input, feature);
  const input = inputAsset.data?.[index];
  const [rows, setRows] = useState<SensorWindow[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (input === undefined) return;
    let active = true;
    setRows(null);
    setError('');
    setSelected(0);
    sensorWindows(model, index, feature, input)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch(() => {
        if (active) setError('窗口明细读取失败。');
      });
    return () => {
      active = false;
    };
  }, [model, index, feature, input, attempt]);
  const point = data.features[feature];
  const row = rows?.[selected];
  const minimum = rows ? Math.min(...rows.map((item) => item.error)) : 0;
  const maximum = rows ? Math.max(...rows.map((item) => item.error)) : 1;
  const span = maximum - minimum;
  return (
    <section
      className="sensor-window-detail result-reveal"
      aria-label="测点覆盖窗口明细"
      data-feature={feature}
      data-point={index + 1}
    >
      <div className="sensor-detail-heading">
        <div>
          <h3>{point.label}</h3>
          <small>{point.key}</small>
        </div>
        <button className="text-button" onClick={close}>
          收起明细
        </button>
      </div>
      <p className="quiet">
        第 {index + 1} 点 · {data.times[index]}
      </p>
      {error || inputAsset.error ? (
        <p role="alert">
          {error || inputAsset.error}
          <button
            onClick={() => {
              inputAsset.retry();
              setAttempt((n) => n + 1);
            }}
          >
            重试测点明细
          </button>
        </p>
      ) : rows && row ? (
        <>
          <WindowPlot rows={rows} selected={selected} />
          <div className="window-error-heading">
            <h4>
              {rows.length} 个窗口的平方误差
              <Footnote note="window-aggregation" reference="ref-sensor-window-errors" />
            </h4>
            <span className="error-color-scale">
              <span>{minimum.toPrecision(4)}</span>
              <i aria-hidden="true" />
              <span>{maximum.toPrecision(4)}</span>
            </span>
          </div>
          <div className="window-error-grid" role="group" aria-label="选择覆盖窗口的平方误差">
            {rows.map((item, i) => (
              <button
                key={item.start}
                aria-label={`第 ${i + 1} 个覆盖窗口，第 ${item.start + 1}—${item.start + data.window} 点，平方误差 ${decimal(item.error)}`}
                aria-pressed={selected === i}
                data-error={item.error}
                style={{
                  backgroundColor: errorColor(
                    span > 1e-12 ? item.error - minimum : 0,
                    span > 1e-12 ? span : 1,
                  ),
                  color:
                    span > 1e-12 && (item.error - minimum) / span > 0.55 ? 'white' : colors.input,
                }}
                onClick={() => setSelected(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="window-cell-detail" aria-live="polite">
            <strong>
              窗口：第 {row.start + 1}—{row.start + data.window} 点
            </strong>
            <dl>
              <div>
                <dt>输入</dt>
                <dd data-testid="sensor-window-input">{decimal(row.input)}</dd>
              </div>
              <div>
                <dt>重建</dt>
                <dd data-testid="sensor-window-prediction">{decimal(row.prediction)}</dd>
              </div>
              <div>
                <dt>平方误差</dt>
                <dd data-testid="sensor-window-error">{decimal(row.error)}</dd>
              </div>
            </dl>
          </div>
          <div className="sensor-contribution-results">
            <div>
              <span>平均误差</span>
              <strong data-testid="sensor-mean-error">{decimal(meanError)}</strong>
            </div>
            <div>
              <span>分数贡献</span>
              <strong data-testid="sensor-score-contribution">
                {decimal(meanError / data.features.length)}
              </strong>
            </div>
          </div>
        </>
      ) : (
        <p className="sensor-detail-loading" role="status">
          正在读取该测点的覆盖窗口…
        </p>
      )}
    </section>
  );
}
