import type { Journey, Metrics, Model } from '../journey';
import { useLayoutEffect, useRef, useState } from 'react';
import { pct, outcomeCode } from '../journey';
import FeaturePicker from './FeaturePicker';
import { modelName } from './modelNames';
import InfoTip from './InfoTip';
import { availableMethods } from '../resultCatalog';
export const colors = {
  input: 'var(--chart-input)',
  recon: 'var(--chart-recon)',
  score: 'var(--chart-score)',
  anomaly: 'var(--chart-threshold)',
  ink: 'var(--muted)',
  muted: 'var(--chart-muted)',
};
/** One plate that slides to the pressed button of its segmented group. */
export function SelectionIndicator({
  selector = ':scope > button[aria-pressed=true]',
  className = 'selection-indicator',
}: {
  selector?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null),
    [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null),
    [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const group = ref.current?.parentElement;
    if (!group) return;
    const update = () => {
      const b = group.querySelector<HTMLElement>(selector);
      setBox(
        b
          ? { x: b.offsetLeft, y: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight }
          : null,
      );
    };
    update();
    const frame = requestAnimationFrame(() => setReady(true));
    const resize = new ResizeObserver(update);
    resize.observe(group);
    for (const child of group.children) resize.observe(child);
    window.addEventListener('resize', update);
    const pressed = new MutationObserver(update);
    pressed.observe(group, {
      subtree: true,
      childList: true,
      attributeFilter: ['aria-pressed', 'aria-current'],
    });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      pressed.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [selector]);
  return (
    <i
      ref={ref}
      aria-hidden="true"
      className={className + (ready ? ' is-ready' : '')}
      style={
        box
          ? { left: box.x, top: box.y, width: box.width, height: box.height }
          : { opacity: 0, width: 0, height: 0 }
      }
    />
  );
}
export function ModelSelect({
  data,
  value,
  onChange,
}: {
  data: Journey;
  value: string;
  onChange: (v: string) => void;
}) {
  const methods = availableMethods(data);
  if (methods.length === 1) return <span className="model-identity">{modelName(methods[0])}</span>;
  return (
    <div className="segmented model-select" aria-label="选择模型">
      <SelectionIndicator />
      {methods.map((m) => (
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
export function Heading({ title, label }: { title: React.ReactNode; label?: string }) {
  return (
    <div className="chapter-heading">
      <h1 aria-label={label}>{title}</h1>
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
        <InfoTip label="混淆矩阵说明">
          {cells.map(([id, name, desc]) => (
            <span key={id}>
              {name}（{String(id).toUpperCase()}）：{desc}。
            </span>
          ))}
        </InfoTip>
      </div>
      <div className="confusion" aria-label={caption}>
        {cells.map(([id, name, desc, count]) => (
          <div
            key={id}
            className={'confusion-cell ' + id + (active === id ? ' current' : '')}
            data-testid={'count-' + id}
            role="group"
            aria-label={`${name}，${desc}：${count}`}
          >
            <span>{name}</span>
            <strong key={String(count)} className="value-tick">
              {count}
            </strong>
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
          <strong key={pct(v as number | null)} className="value-tick">
            {pct(v as number | null)}
          </strong>
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
        <span>
          逐点F1
          <strong key={pct(metrics.f1)} className="value-tick">
            {pct(metrics.f1)}
          </strong>
        </span>
      </div>
      {children}
    </div>
  );
}
