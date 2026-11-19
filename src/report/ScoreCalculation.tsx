import TableScrollHint from './TableScrollHint';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Journey } from '../journey';
import { Footnote } from './notes';
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
  input,
  recon,
  start,
  point,
  id = 'window-calculation',
  focusFeature = -1,
  labels,
  stale = false,
}: {
  data: Journey;
  input: Float64Array;
  recon: Float32Array;
  start: number;
  point: number;
  id?: string;
  focusFeature?: number;
  labels?: Float64Array | null;
  /** Shown while the next window loads; results are marked only once they are current. */
  stale?: boolean;
}) {
  const features = data.features.length;
  const index = start + point,
    calculation = useMemo(
      () => pointCalculation(input, recon, point, point, features),
      [input, recon, point, features],
    );
  const body = useRef<HTMLTableSectionElement>(null);
  const [expanded, setExpanded] = useState(false);
  const selectedRow = calculation.rows[focusFeature];
  useEffect(() => {
    if (focusFeature < 0) return;
    const row = body.current?.rows[focusFeature];
    const scroller = body.current?.closest('.calculation-table-scroll');
    if (row && scroller) scroller.scrollTop = row.offsetTop - 45;
  }, [focusFeature, expanded]);
  return (
    <section
      className="score-calculation"
      id={id}
      aria-label="单个窗口的平方误差"
      data-point={index + 1}
    >
      <div className="calculation-layout">
        <div className="calculation-details" data-expanded={expanded}>
          <button
            className="calculation-details-toggle"
            aria-expanded={expanded}
            aria-controls={id + '-rows'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '收起测点明细' : `查看全部 ${features} 个测点明细`}
          </button>
          <div id={id + '-rows'} className="calculation-rows">
            {selectedRow && (
              <div
                className="sensor-calculation-detail"
                role="region"
                aria-label="当前测点计算明细"
              >
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
            <TableScrollHint
              id={id + '-scroll-hint'}
              verticalHint={<>共 {features} 个测点，上下滑动查看全部测点。</>}
            >
              共 {features} 个测点，上下滑动查看全部测点，左右滑动查看输入、重建与误差。
            </TableScrollHint>
            <div
              className="calculation-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`全部 ${features} 个测点计算明细`}
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
            {focusFeature >= 0 && labels && (
              <p className="calculation-help">
                当前测点标签：第 {index + 1} 点，{featureName(data.features[focusFeature])}，
                <span className="note-anchor">
                  {labels[index] ? '异常' : '正常'}
                  <Footnote note="anomaly-labels" reference={'ref-' + id + '-label'} />
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="calculation-total">
          <h3>汇总全部 {features} 项</h3>
          <div className="calculation-equation">
            <Fraction
              numerator={
                <span data-testid={stale ? undefined : id + '-sum'}>
                  {decimal(calculation.sum)}
                </span>
              }
              denominator={features}
            />
            <span className="equation-result">
              <span>=</span>
              <strong
                data-testid={
                  stale
                    ? undefined
                    : id === 'window-calculation'
                      ? 'calculated-score'
                      : id + '-score'
                }
              >
                {decimal(calculation.score)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
