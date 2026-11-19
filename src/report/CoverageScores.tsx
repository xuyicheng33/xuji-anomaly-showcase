import TableScrollHint from './TableScrollHint';
import { useCallback, useEffect, useRef } from 'react';
import { loadCalculationIndex, loadPointScores } from '../calculationIndex';
import { coveringWindows } from '../dataGeometry';
import type { Journey, Model } from '../journey';
import Fraction from './Fraction';
import { useResource } from './useResource';

const decimal = (value: number) => value.toFixed(9);

/**
 * Report 4.4: a time point is reconstructed in every window that covers it. Each window gives
 * its own score for the point; their average is the point's anomaly score.
 */
export function CoverageScores({
  data,
  model,
  index,
  activeStart,
  onSelect,
}: {
  data: Journey;
  model: Model;
  index: number;
  /** The window shown in the step before, marked in the list. */
  activeStart: number;
  onSelect: (start: number) => void;
}) {
  const readIndex = useCallback(() => loadCalculationIndex(data), [data]);
  const catalog = useResource(data.calculation.sha256, readIndex);
  const readScores = useCallback(
    () => loadPointScores(catalog.data!, model.id, index, data.times.length),
    [catalog.data, model.id, index, data.times.length],
  );
  const scores = useResource(
    catalog.data ? `${data.calculation.sha256}:${model.id}:${index}` : null,
    readScores,
  );
  const starts = coveringWindows(index, data.times.length, data.window);
  const rows = scores.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  const scroller = useRef<HTMLDivElement>(null);
  // Keep the window from the step before in view inside the list.
  useEffect(() => {
    const box = scroller.current,
      row = box?.querySelector<HTMLElement>('tr.selected-sensor');
    if (box && row) box.scrollTop = row.offsetTop - (box.querySelector('thead')?.offsetHeight ?? 0);
  }, [activeStart, rows.length]);
  if (catalog.error || scores.error)
    return (
      <div role="alert" className="inline-error">
        {catalog.error || scores.error}
        <button
          onClick={() => {
            catalog.retry();
            scores.retry();
          }}
        >
          重试计算索引
        </button>
      </div>
    );
  if (!rows.length) return <p role="status">正在读取 {starts.length} 个覆盖窗口的分数…</p>;
  return (
    <div className="coverage-scores">
      <div
        ref={scroller}
        className="window-score-scroll"
        role="region"
        tabIndex={0}
        aria-label="覆盖当前时刻的全部窗口"
        aria-describedby="window-score-hint"
      >
        <table>
          <thead>
            <tr>
              <th>覆盖窗口</th>
              <th>窗口内位置</th>
              <th>该时刻分数</th>
              <th>
                <span className="sr-only">查看该窗口</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.start}
                className={activeStart === row.start ? 'selected-sensor' : undefined}
              >
                <th scope="row">
                  第 {(row.start + 1).toLocaleString('en-US')}—
                  {(row.start + data.window).toLocaleString('en-US')} 点
                </th>
                <td>
                  {index - row.start + 1} / {data.window}
                </td>
                <td>{decimal(row.score)}</td>
                <td>
                  <button
                    className="inline-link"
                    aria-pressed={activeStart === row.start}
                    onClick={() => onSelect(row.start)}
                  >
                    查看 {data.features.length} 项
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableScrollHint id="window-score-hint">左右滑动查看计算明细。</TableScrollHint>
      <div className="coverage-total">
        <span>{rows.length} 个窗口取平均</span>
        <span className="score-equation" data-testid="aggregate-equation">
          <Fraction numerator={decimal(total)} denominator={rows.length} />
          <span className="equation-result">
            <span>=</span>
            <strong data-testid="aggregate-score">{decimal(total / rows.length)}</strong>
          </span>
        </span>
      </div>
    </div>
  );
}
