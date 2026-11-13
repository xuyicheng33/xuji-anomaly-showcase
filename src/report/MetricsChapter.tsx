import TableScrollHint from './TableScrollHint';
import { useState } from 'react';
import type { Journey, Metrics } from '../journey';
import { countMetrics, fmt, pct, pointAdjusted } from '../journey';
import { Section } from './ReportUI';
import Fraction from './Fraction';
import { modelName } from './modelNames';

// Twenty teaching points: the inclusive interval 6–13 is anomalous.
export const exampleLabels = Array.from({ length: 20 }, (_, i) => (i >= 5 && i <= 12 ? 1 : 0));
export const initialAlarms = exampleLabels.map((_, i) => ([2, 7, 10, 17].includes(i) ? 1 : 0));

export function compareMetrics(labels: number[], alarms: number[]) {
  const adjusted = pointAdjusted(labels, alarms, 0.5).map(Number);
  return {
    adjusted,
    pointWise: countMetrics(labels, alarms, 0.5),
    pointAdjusted: countMetrics(labels, adjusted, 0.5),
  };
}

const metricRows: { key: keyof Metrics; label: string; formula?: string }[] = [
  { key: 'tp', label: 'TP 检出' },
  { key: 'fp', label: 'FP 误报' },
  { key: 'fn', label: 'FN 漏检' },
  { key: 'precision', label: 'P 精确率', formula: 'TP / (TP + FP)' },
  { key: 'recall', label: 'R 召回率', formula: 'TP / (TP + FN)' },
  { key: 'f1', label: 'F1', formula: '2TP / (2TP + FP + FN)' },
];

function metricValue(metrics: Metrics, key: keyof Metrics) {
  return ['precision', 'recall', 'f1'].includes(key) ? pct(metrics[key]) : fmt(metrics[key] ?? 0);
}

function MetricComparison({
  pointWise,
  pointAdjusted: adjusted,
}: {
  pointWise: Metrics;
  pointAdjusted: Metrics;
}) {
  return (
    <table className="metrics-comparison" aria-label="示例的逐点和点调整指标对照">
      <thead>
        <tr>
          <th scope="col">计算项</th>
          <th scope="col">逐点</th>
          <th scope="col">区间点调整</th>
        </tr>
      </thead>
      <tbody>
        {metricRows.map((row) => (
          <tr key={row.key} className={row.key === 'f1' ? 'metrics-f1-row' : undefined}>
            <th scope="row">
              {row.label}
              {row.formula && (
                <small>
                  <Fraction
                    numerator={row.formula.split(' / ')[0]}
                    denominator={row.formula.split(' / ')[1]}
                  />
                </small>
              )}
            </th>
            <td data-testid={'pw-' + row.key}>{metricValue(pointWise, row.key)}</td>
            <td data-testid={'pa-' + row.key}>{metricValue(adjusted, row.key)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MetricsChapter({ data }: { data: Journey }) {
  const [alarms, setAlarms] = useState<number[]>(() => [...initialAlarms]);
  const {
    adjusted,
    pointWise,
    pointAdjusted: adjustedMetrics,
  } = compareMetrics(exampleLabels, alarms);
  const models = data.models;
  const toggle = (index: number) =>
    setAlarms((previous) => previous.map((alarm, i) => (i === index ? 1 - alarm : alarm)));

  return (
    <div className="metrics-page">
      <section className="metrics-example" aria-labelledby="metrics-example-title">
        <div className="metrics-example-heading">
          <div>
            <h2 id="metrics-example-title">报警判定与指标对照</h2>
          </div>
          <div className="metrics-presets" aria-label="切换示例报警">
            <button
              type="button"
              onClick={() => setAlarms(exampleLabels.map((_, i) => (i === 7 ? 1 : 0)))}
            >
              单点检出
            </button>
            <button type="button" onClick={() => setAlarms(exampleLabels.map(() => 0))}>
              完全漏检
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setAlarms([...initialAlarms])}
            >
              重置
            </button>
          </div>
        </div>

        <p className="metrics-track-instruction" id="metrics-track-instruction">
          点击报警点切换状态。<span>左右滑动查看全部时间点。</span>
        </p>
        <div
          className="metrics-track-scroll"
          role="region"
          aria-label="20 个时间点的标签、报警和点调整结果"
          tabIndex={0}
          aria-describedby="metrics-track-instruction"
        >
          <div className="metrics-tracks">
            <div className="metrics-track metrics-time-track">
              <span className="metrics-track-name">时间点</span>
              {exampleLabels.map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <div className="metrics-track metrics-truth-track">
              <span className="metrics-track-name">真实标签</span>
              {exampleLabels.map((label, i) => (
                <span
                  key={i}
                  className={'metrics-point' + (label ? ' is-anomaly' : '')}
                  aria-label={`第 ${i + 1} 点：${label ? '异常' : '正常'}`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="metrics-track metrics-alarm-track">
              <span className="metrics-track-name">
                实际报警<small>点击切换</small>
              </span>
              {alarms.map((alarm, i) => (
                <button
                  key={i}
                  type="button"
                  className={'metrics-point' + (alarm ? ' is-alarm' : '')}
                  aria-label={`第 ${i + 1} 点${exampleLabels[i] ? '异常' : '正常'}，${alarm ? '已报警' : '未报警'}`}
                  aria-pressed={Boolean(alarm)}
                  onClick={() => toggle(i)}
                >
                  {alarm}
                </button>
              ))}
            </div>
            <div className="metrics-track metrics-adjusted-track">
              <span className="metrics-track-name">点调整结果</span>
              {adjusted.map((alarm, i) => (
                <span
                  key={i}
                  className={
                    'metrics-point' + (alarm ? (alarms[i] ? ' is-alarm' : ' is-added') : '')
                  }
                  aria-label={`第 ${i + 1} 点：${alarm && !alarms[i] ? '按异常段补为报警' : alarm ? '保留实际报警' : '未报警'}`}
                >
                  {alarm}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="metrics-track-key">
          <span>0 = 正常 / 未报警　1 = 异常 / 报警</span>
          <span>
            <i className="is-added" />
            虚线格 = 点调整补齐
          </span>
        </div>

        <p className="metrics-effect" aria-live="polite" aria-atomic="true">
          逐点检出 <strong>{pointWise.tp} / 8</strong>，点调整检出{' '}
          <strong>{adjustedMetrics.tp} / 8</strong>，误报 <strong>{pointWise.fp}</strong>
        </p>

        <MetricComparison pointWise={pointWise} pointAdjusted={adjustedMetrics} />
        <p className="metrics-definition">F1 为精确率与召回率的调和平均。</p>
      </section>

      <Section title={data.models.length > 1 ? '两种方法的评估结果' : 'SMST-AD 的评估结果'}>
        <p className="reading-copy">同一测试集、统一阈值规则，分别统计逐点与区间点调整指标。</p>
        <TableScrollHint id="metrics-table-hint">左右滑动查看全部指标。</TableScrollHint>
        <div
          className="metrics-archive-scroll"
          role="region"
          aria-label={data.models.length > 1 ? '两种方法的检测指标' : 'SMST-AD 的检测指标'}
          tabIndex={0}
          aria-describedby="metrics-table-hint"
        >
          <table className="metrics-archive">
            <thead>
              <tr>
                <th scope="col">模型</th>
                <th scope="col">口径</th>
                <th scope="col">检出</th>
                <th scope="col">误报</th>
                <th scope="col">漏检</th>
                <th scope="col">精确率</th>
                <th scope="col">召回率</th>
                <th scope="col">F1</th>
              </tr>
            </thead>
            {models.map((model) => (
              <tbody key={model.id}>
                {(['point_wise', 'point_adjusted'] as const).map((mode, index) => (
                  <tr key={mode}>
                    {index === 0 && (
                      <th scope="rowgroup" rowSpan={2}>
                        {modelName(model)}
                      </th>
                    )}
                    <th scope="row">{index === 0 ? '逐点' : '区间点调整'}</th>
                    {metricRows.map((row) => (
                      <td
                        key={row.key}
                        className={row.key === 'f1' ? 'metrics-archive-f1' : undefined}
                      >
                        {metricValue(model.metrics[mode], row.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Section>
    </div>
  );
}
