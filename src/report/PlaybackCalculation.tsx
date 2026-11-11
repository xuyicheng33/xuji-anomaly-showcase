import { loadCalculationIndex } from '../calculationIndex';
import { coveringWindows } from '../dataGeometry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadWindow, type Journey, type Model } from '../journey';
import { Footnote } from './notes';
import { useDataAsset } from './useDataAsset';
import { useWindowInput } from './useCurveData';
import Fraction from './Fraction';
import { ScoreCalculation } from './ScoreCalculation';
import { useResource } from './useResource';

const decimal = (value: number) => value.toFixed(9);

export function PlaybackCalculation({
  data,
  model,
  index,
  playing,
  pause,
}: {
  data: Journey;
  model: Model;
  index: number | null;
  playing: boolean;
  pause: () => void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<number | null>(null);
  const readIndex = useCallback(() => loadCalculationIndex(data), [data]);
  const catalog = useResource(open ? data.calculation.sha256 : null, readIndex);
  const readWindow = useCallback(() => loadWindow(model, selected!), [model, selected]);
  const windowAsset = useResource(
    selected === null ? null : `${model.run}:${selected}`,
    readWindow,
  );
  const result = windowAsset.data;
  const section = useRef<HTMLElement>(null),
    detail = useRef<HTMLDivElement>(null);
  const inputAsset = useWindowInput(data, selected ?? 0, selected !== null),
    input = inputAsset.data;
  const scoresAsset = useDataAsset(catalog.data?.models[model.id] ?? null);
  useEffect(() => {
    setSelected(null);
  }, [index, model.id]);
  useEffect(() => {
    if (playing) setOpen(false);
  }, [playing]);
  const starts = index === null ? [] : coveringWindows(index, data.times.length, data.window);
  const rows =
    scoresAsset.data && index !== null
      ? starts.map((start) => ({
          start,
          score: scoresAsset.data![start * data.window + index - start],
        }))
      : [];
  const total = rows.reduce((sum, row) => sum + row.score, 0),
    score = index === null ? null : model.scores[index];
  const ready =
    result &&
    result.modelId === model.id &&
    result.start === selected &&
    index !== null &&
    index >= result.start &&
    index < result.start + data.window;
  const reveal = () => {
    pause();
    setOpen(true);
    requestAnimationFrame(() =>
      section.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      }),
    );
  };
  return (
    <section className="playback-calculation" ref={section}>
      <div className="aggregation-summary">
        <div>
          <h2>
            当前时刻分数
            <Footnote note="window-aggregation" />
          </h2>
          <p>
            {index === null ? (
              '选择时刻后查看各窗口的分数。'
            ) : (
              <>
                第 {index + 1} 点，
                <span className="window-scope">{starts.length} 个窗口取平均</span>
              </>
            )}
          </p>
        </div>
        <div className="aggregation-formula">
          {score === null ? (
            <>
              <Fraction numerator="窗口分数合计" denominator="覆盖窗口数" />
              <b>=</b>
              <span>回放分数</span>
            </>
          ) : (
            <>
              <Fraction
                numerator={decimal(rows.length ? total : score * starts.length)}
                denominator={starts.length}
              />
              <span className="equation-result">
                <b>=</b>
                <strong data-testid="aggregate-score">{decimal(score)}</strong>
              </span>
            </>
          )}
        </div>
        <button
          className="inline-link"
          disabled={index === null}
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : reveal())}
        >
          {open ? '收起计算' : '查看当前点计算'} {open ? '↑' : '↓'}
        </button>
      </div>
      {open && index !== null && (
        <div className="aggregation-detail result-reveal">
          <p>
            各窗口在同一时刻的{data.features.length}项平方误差取平均，再合并这 {starts.length}{' '}
            个窗口分数。
          </p>
          {catalog.error || scoresAsset.error ? (
            <div role="alert">
              {catalog.error || scoresAsset.error}
              <button
                onClick={() => {
                  catalog.retry();
                  scoresAsset.retry();
                }}
              >
                重试计算索引
              </button>
            </div>
          ) : !rows.length ? (
            <p role="status">正在读取窗口分数…</p>
          ) : (
            <>
              <div
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
                      <th>计算明细</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.start}
                        className={selected === row.start ? 'selected-sensor' : undefined}
                      >
                        <th scope="row">
                          第 {row.start + 1}—{row.start + data.window} 点
                        </th>
                        <td>
                          {index - row.start + 1} / {data.window}
                        </td>
                        <td>{decimal(row.score)}</td>
                        <td>
                          <button
                            className="inline-link"
                            aria-pressed={selected === row.start}
                            onClick={() => {
                              setSelected(row.start);
                              requestAnimationFrame(() =>
                                detail.current?.scrollIntoView({
                                  block: 'start',
                                  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                                    ? 'instant'
                                    : 'smooth',
                                }),
                              );
                            }}
                          >
                            查看{data.features.length}项
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="window-score-hint" id="window-score-hint">
                左右滑动查看计算明细。
              </p>
              <p className="window-score-total">
                已计入全部 {rows.length} 个覆盖窗口：
                <span className="score-equation" data-testid="aggregate-equation">
                  <Fraction numerator={decimal(total)} denominator={rows.length} />
                  <span className="equation-result">
                    <span>=</span>
                    <strong>{decimal(total / rows.length)}</strong>
                  </span>
                </span>
              </p>
            </>
          )}
          <div ref={detail} className="coverage-calculation">
            {selected !== null &&
              (windowAsset.error || inputAsset.error ? (
                <p role="alert">
                  {windowAsset.error || inputAsset.error}
                  <button
                    onClick={() => {
                      windowAsset.retry();
                      inputAsset.retry();
                    }}
                  >
                    重试窗口
                  </button>
                </p>
              ) : ready && input ? (
                <ScoreCalculation
                  data={data}
                  model={model}
                  input={input}
                  recon={result.recon}
                  start={result.start}
                  point={index - result.start}
                  id="coverage-window-calculation"
                />
              ) : (
                <p role="status">正在读取该窗口的{data.features.length}项计算…</p>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
