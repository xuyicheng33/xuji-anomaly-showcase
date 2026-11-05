import TableScrollHint from './TableScrollHint';
import { useEffect, useMemo, useRef } from 'react';
import { type Journey, type Model } from '../journey';
import { Footnote } from './notes';
import { Outcome } from './ReportUI';
import Fraction from './Fraction';
import { featureName } from './featureNames';

function pointCalculation(
  input: Float64Array,
  recon: Float32Array,
  index: number,
  local: number,
  features: number,
) {
  const rows = Array.from({ length: features }, (_, feature) => {
    const value = input[index * features + feature],
      prediction = recon[local * features + feature],
      difference = value - prediction;
    return { feature, value, prediction, difference, error: difference * difference };
  });
  const sum = rows.reduce((total, row) => total + row.error, 0);
  return { rows, sum, score: sum / features };
}
const decimal = (value: number) => value.toFixed(9);

export function ScoreCalculation({
  data,
  model,
  input,
  recon,
  start,
  point,
  id = 'window-calculation',
  focusFeature = -1,
  labels,
}: {
  data: Journey;
  model: Model;
  input: Float64Array;
  recon: Float32Array;
  start: number;
  point: number;
  id?: string;
  focusFeature?: number;
  labels?: Float64Array | null;
}) {
  const features = data.features.length;
  const index = start + point,
    calculation = useMemo(
      () => pointCalculation(input, recon, point, point, features),
      [input, recon, point, features],
    );
  const body = useRef<HTMLTableSectionElement>(null);
  const selectedRow = calculation.rows[focusFeature];
  useEffect(() => {
    if (focusFeature < 0) return;
    const row = body.current?.rows[focusFeature];
    const scroller = body.current?.closest('.calculation-table-scroll');
    if (row && scroller) scroller.scrollTop = row.offsetTop - 45;
  }, [focusFeature]);
  return (
    <section
      className="score-calculation"
      id={id}
      aria-label="异常分数计算过程"
      data-point={index + 1}
    >
      <div className="calculation-heading">
        <div>
          <h2>
            异常分数计算
            <Footnote note="score-calculation" reference={'ref-' + id} />
          </h2>
          <p>
            {model.name}，第 {start + 1}—{start + data.window} 点窗口，窗口内第 {point + 1} /{' '}
            {data.window} 个时刻
          </p>
        </div>
      </div>
      <p className="calculation-time">
        {data.times[index]}，第 {index + 1} 点，归一化数值
      </p>
      <div className="calculation-layout">
        <div>
          <h3>
            <span>01</span> 逐项相减，再平方
          </h3>
          {selectedRow && (
            <div className="sensor-calculation-detail" role="region" aria-label="当前测点计算明细">
              <p>
                {focusFeature + 1}. {featureName(data.features[focusFeature])}
                <small>{data.features[focusFeature].key}</small>
              </p>
              <dl>
                {(
                  [
                    ['输入', selectedRow.value],
                    ['重建', selectedRow.prediction],
                    ['差值', selectedRow.difference],
                    ['平方误差', selectedRow.error],
                  ] as const
                ).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{decimal(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <TableScrollHint id={id + '-scroll-hint'}>左右滑动查看输入、重建与误差。</TableScrollHint>
          <div
            className="calculation-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={`全部${features}个测点计算明细`}
            aria-describedby={id + '-scroll-hint'}
          >
            <table className="calculation-table">
              <thead>
                <tr>
                  <th scope="col">测点</th>
                  <th scope="col">输入</th>
                  <th scope="col">重建</th>
                  <th scope="col">差值</th>
                  <th scope="col">平方误差</th>
                </tr>
              </thead>
              <tbody ref={body}>
                {calculation.rows.map((row) => (
                  <tr
                    key={row.feature}
                    className={row.feature === focusFeature ? 'selected-sensor' : undefined}
                    data-feature={row.feature}
                  >
                    <th scope="row">
                      <span>
                        {row.feature + 1}. {featureName(data.features[row.feature])}
                      </span>
                      <small>{data.features[row.feature].key}</small>
                    </th>
                    <td>{decimal(row.value)}</td>
                    <td>{decimal(row.prediction)}</td>
                    <td>{decimal(row.difference)}</td>
                    <td>{decimal(row.error)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="calculation-help">平方误差 =（输入 − 重建）²。</p>
          {focusFeature >= 0 && labels && (
            <p className="calculation-help">
              第 {index + 1} 点，{featureName(data.features[focusFeature])}标签：
              <span className="note-anchor">
                {labels[index * features + focusFeature] ? '异常' : '正常'}
                <Footnote note="anomaly-labels" reference={'ref-' + id + '-label'} />
              </span>
            </p>
          )}
        </div>
        <div className="calculation-total">
          <h3>
            <span>02</span> 汇总全部{features}项
          </h3>
          <p>平方误差合计</p>
          <strong className="sum-value" data-testid={id + '-sum'}>
            {decimal(calculation.sum)}
          </strong>
          <div className="calculation-equation">
            <Fraction numerator={decimal(calculation.sum)} denominator={features} />
            <span className="equation-result">
              <span>=</span>
              <strong
                data-testid={id === 'window-calculation' ? 'calculated-score' : id + '-score'}
              >
                {decimal(calculation.score)}
              </strong>
            </span>
          </div>
          <h3>
            <span>03</span> 与窗口阈值比较
          </h3>
          <p className="calculation-comparison">
            {decimal(calculation.score)}{' '}
            <b>{calculation.score > model.windowThreshold ? '>' : '≤'}</b>{' '}
            {decimal(model.windowThreshold)}
          </p>
          <Outcome
            label={data.labels[index]}
            score={calculation.score}
            model={{ ...model, threshold: model.windowThreshold }}
          />
        </div>
      </div>
    </section>
  );
}
