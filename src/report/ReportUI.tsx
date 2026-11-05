import type { Journey, Metrics, Model } from '../journey';
import { useLayoutEffect, useRef, useState } from 'react';
import { pct, outcomeCode } from '../journey';
import FeaturePicker from './FeaturePicker';
export const colors = {
  input: '#283c4c',
  recon: '#258077',
  score: '#3566a1',
  anomaly: '#bd653c',
  ink: '#62665e',
  muted: '#96988f',
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
    [box, setBox] = useState({ x: 4, width: 0 });
  useLayoutEffect(() => {
    const update = () => {
      const b = ref.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]');
      if (b) setBox({ x: b.offsetLeft, width: b.offsetWidth });
    };
    update();
    const o = new ResizeObserver(update);
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, [value, data]);
  if (data.models.length === 1)
    return <span className="model-identity">{data.models[0].name}</span>;
  return (
    <div ref={ref} className="segmented model-select" aria-label="选择模型">
      <i className="selection-indicator" style={{ left: box.x, width: box.width }} />
      {data.models.map((m) => (
        <button key={m.id} aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
          {m.name}
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
