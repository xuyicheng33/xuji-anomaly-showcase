import type { Journey, Metrics, Model } from '../journey';
import { useLayoutEffect, useRef, useState } from 'react';
import { pct, outcomeCode } from '../journey';
import FeaturePicker from './FeaturePicker';
import { modelName } from './modelNames';
export const colors = {
  input: 'var(--chart-input)',
  recon: 'var(--chart-recon)',
  score: 'var(--chart-score)',
  anomaly: 'var(--chart-threshold)',
  ink: 'var(--muted)',
  muted: 'var(--chart-muted)',
};
export function ModelSelect({
  data,
  value,
  onChange,
}: {
  data: Journey;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [box, setBox] = useState({ x: 4, y: 4, width: 0, height: 0 });
  useLayoutEffect(() => {
    const update = () => {
      const b = ref.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]');
      if (b)
        setBox({ x: b.offsetLeft, y: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight });
    };
    update();
    const o = new ResizeObserver(update);
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, [value, data]);
  if (data.models.length === 1)
    return <span className="model-identity">{modelName(data.models[0])}</span>;
  return (
    <div ref={ref} className="segmented model-select" aria-label="选择模型">
      <i
        className="selection-indicator"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      />
      {data.models.map((m) => (
        <button key={m.id} aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
          {modelName(m)}
        </button>
      ))}
    </div>
  );
}
export function FeatureSelect({
  data,
  value,
  onChange,
  aggregate = false,
}: {
  data: Journey;
  value: number;
  onChange: (v: number) => void;
  aggregate?: boolean;
}) {
  return (
    <FeaturePicker
      features={data.features}
      value={value}
      onChange={onChange}
      label={aggregate ? '显示范围' : '测点'}
      aggregate={aggregate}
    />
  );
}
export function Heading({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="chapter-heading">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Confusion({
  metrics,
  active,
  caption = '混淆矩阵',
}: {
  metrics: Metrics;
  active?: string;
  caption?: string;
}) {
  const cells = [
    ['tp', '检出', '实际异常，模型报警', metrics.tp],
    ['fn', '漏检', '实际异常，未报警', metrics.fn],
    ['fp', '误报', '实际正常，模型报警', metrics.fp],
    ['tn', '正确正常', '实际正常，未报警', metrics.tn],
  ];
  return (
    <div className="matrix-section">
      <div className="matrix-caption">
        <h3>{caption}</h3>
      </div>
      <div className="confusion" aria-label={caption}>
        {cells.map(([id, name, desc, count]) => (
          <div
            key={id}
            className={'confusion-cell ' + id + (active === id ? ' current' : '')}
            data-testid={'count-' + id}
          >
            <span>
              {name} <small>{String(id).toUpperCase()}</small>
            </span>
            <strong>{count}</strong>
            <p>
              <span>{String(desc).split('，')[0]}</span>，<span>{String(desc).split('，')[1]}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
export function Rates({ metrics }: { metrics: Metrics }) {
  return (
    <div className="rates">
      {[
        ['精确率', metrics.precision],
        ['召回率', metrics.recall],
        ['逐点F1', metrics.f1],
      ].map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <strong>{pct(v as number | null)}</strong>
        </div>
      ))}
    </div>
  );
}
export function Outcome({ label, score, model }: { label: number; score: number; model: Model }) {
  const code = outcomeCode(label, score, model.threshold);
  return (
    <span className={'outcome ' + code}>
      {{ tp: '检出异常', fp: '误报', fn: '漏检异常', tn: '正常' }[code]}
    </span>
  );
}

export function ResultSummary({
  metrics,
  scope,
  children,
}: {
  metrics: Metrics;
  scope: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="result-summary" aria-label={scope}>
      <span className="result-summary-scope">{scope}</span>
      <div className="result-summary-values">
        {[
          ['检出', metrics.tp],
          ['误报', metrics.fp],
          ['漏检', metrics.fn],
          ['逐点F1', pct(metrics.f1)],
        ].map(([label, value]) => (
          <span key={label}>
            {label}
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
