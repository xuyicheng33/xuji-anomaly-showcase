import { useEffect, useMemo, useRef, useState } from 'react';
import { meanSeries, loadWindow, outcomeCode } from '../journey';
import {
  Heading,
  ModelSelect,
  FeatureSelect,
  Outcome,
  SelectionIndicator,
  colors,
} from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useCurveData, useWindowInput } from './useCurveData';
import { Footnote } from './notes';
import { ScoreCalculation } from './ScoreCalculation';
import { CoverageScores } from './CoverageScores';
import { presentationMemory } from './presentationMemory';
import type { DetectionProps } from './detectionTypes';
import { chapterContent } from './navigation';
const names: Record<string, string> = {
  tp: '检出片段',
  fp: '误报片段',
  fn: '漏检片段',
  tn: '正常片段',
};
type WindowResult = Awaited<ReturnType<typeof loadWindow>>;
export function DetectionChapter(p: DetectionProps) {
  const {
    data,
    model,
    setModel,
    setFeature,
    start: savedStart,
    setStart,
    viewFeature,
    setViewFeature,
  } = p;
  const window = data.window,
    features = data.features.length;
  const inputCurve = useCurveData(data.input, viewFeature);
  const [result, setResult] = useState<WindowResult | null>(null),
    [error, setError] = useState(''),
    [point, setPoint] = useState(Math.min(24, window - 1)),
    [attempt, setAttempt] = useState(0);
  const lastStart = data.times.length - window;
  const pendingExample = useRef<{ key: string; point: number } | null>(null);
  // Typical points by their final outcome: the averaged score against the playback threshold.
  const examples = useMemo(
    () => typicalPoints(data.labels, model.scores, model.threshold),
    [data.labels, model.scores, model.threshold],
  );
  const windowAround = (index: number) => Math.max(0, Math.min(lastStart, index - (window >> 1)));
  // Arriving from playback opens its point; the first visit opens on a detected point.
  // The arrival window is shown from the first render, so no other window loads first.
  const [arrival] = useState(() => {
    const target =
      presentationMemory.detectionTarget ??
      (presentationMemory.detectionVisited
        ? null
        : (examples.find((e) => e.code === 'tp')?.index ?? null));
    if (target === null) return null;
    const next = windowAround(target);
    pendingExample.current = { key: `${model.run}:${model.id}:${next}`, point: target - next };
    return next;
  });
  const synced = useRef(arrival === null);
  const start = synced.current ? savedStart : arrival!;
  useEffect(() => {
    presentationMemory.detectionTarget = null;
    presentationMemory.detectionVisited = true;
    synced.current = true;
    if (arrival !== null) setStart(arrival);
  }, [arrival, setStart]);
  const viewKey = `${model.run}:${model.id}:${start}`;
  const openPoint = (index: number) => {
    const next = windowAround(index);
    pendingExample.current =
      next === start ? null : { key: `${model.run}:${model.id}:${next}`, point: index - next };
    setPoint(index - next);
    setStart(next);
  };

  const retry = () => setAttempt((value) => value + 1);
  useEffect(() => {
    const saved =
      presentationMemory.detection?.key === viewKey ? presentationMemory.detection : null;
    // Keep the previous window on screen until the next one arrives.
    if (saved) setResult(saved.result);
    setError('');
    const selectedPoint =
      pendingExample.current?.key === viewKey ? pendingExample.current.point : null;
    if (selectedPoint !== null) pendingExample.current = null;
    setPoint(Math.min(window - 1, selectedPoint ?? saved?.point ?? window >> 1));
  }, [viewKey, start, window]);
  // Load the selected window automatically; a short pause lets a dragged slider settle first.
  useEffect(() => {
    if (presentationMemory.detection?.key === viewKey) return;
    let active = true;
    const timer = setTimeout(() => {
      loadWindow(model, start)
        .then((r) => {
          if (active) setResult(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [viewKey, start, model, attempt]);
  const inputAsset = useWindowInput(data, start, true),
    input = inputAsset.data;
  const ready = !!input && result?.start === start && result.modelId === model.id,
    labs = data.labels.slice(start, start + window),
    pointScores = model.scores.slice(start, start + window);
  const labelAsset = useCurveData(ready && viewFeature >= 0 ? data.labelMatrix : null, viewFeature);
  useEffect(() => {
    if (ready && result) presentationMemory.detection = { key: viewKey, result, point };
  }, [ready, result, point, viewKey]);
  // The evaluation stays in place while the next window loads, then updates where it stands.
  const currentView = ready
    ? { model, input, recon: result.recon, start, labs, scores: pointScores }
    : null;
  const lastView = useRef(currentView);
  if (currentView) lastView.current = currentView;
  const view = currentView ?? lastView.current,
    stale = !currentView && !!view,
    // Models can use different window lengths; keep the point inside the window on screen.
    shownPoint = view ? Math.min(point, view.labs.length - 1) : point;
  return (
    <div className="detection-page">
      <Heading title={chapterContent.detection.title} />
      <div className="toolbar analysis-toolbar">
        <ModelSelect data={data} value={model.id} onChange={setModel} />
        <FeatureSelect
          data={data}
          value={viewFeature}
          aggregate
          onChange={(n) => {
            setViewFeature(n);
            if (n >= 0) setFeature(n);
          }}
        />
      </div>
      <div className="example-picker">
        <span aria-hidden="true">典型片段</span>
        <div className="segmented" role="group" aria-label="典型片段">
          <SelectionIndicator />
          {examples.map((e) => (
            <button
              key={e.code}
              aria-pressed={start + point === e.index && start === windowAround(e.index)}
              onClick={() => openPoint(e.index)}
            >
              {names[e.code]}
            </button>
          ))}
        </div>
      </div>
      <div className="selection-panel">
        <span className="selection-label" aria-hidden="true">
          片段位置
        </span>
        <input
          aria-label={`选择 ${window} 点片段`}
          type="range"
          min="0"
          max={lastStart}
          value={start}
          onChange={(e) => setStart(+e.target.value)}
        />
        <span className="window-range">
          第 {(start + 1).toLocaleString('en-US')}—{(start + window).toLocaleString('en-US')} 点
          <small>
            {data.times[start]} — {data.times[start + window - 1]}
          </small>
        </span>
      </div>
      {inputCurve.data ? (
        <ReconstructionView
          features={data.features.length}
          aggregate={viewFeature < 0}
          input={Array.from(inputCurve.data.slice(start, start + window))}
          recon={
            ready
              ? viewFeature < 0
                ? meanSeries(result.recon, 0, window, features)
                : Array.from({ length: window }, (_, i) => result.recon[i * features + viewFeature])
              : undefined
          }
          labels={labs}
          labelKey={data.dataset?.id === 'wind' ? '保留异常标签' : '实验异常标签'}
          selected={ready ? point : undefined}
          start={start}
          onSelect={ready ? setPoint : undefined}
        />
      ) : (
        <div className="curve-loading" role={inputCurve.error ? 'alert' : 'status'}>
          {inputCurve.error ? (
            <>
              {inputCurve.error}
              <button onClick={inputCurve.retry}>重新读取</button>
            </>
          ) : (
            '正在读取片段输入…'
          )}
        </div>
      )}
      {inputAsset.error && (
        <div role="alert" className="inline-error">
          {inputAsset.error}
          <button onClick={inputAsset.retry}>重试输入</button>
        </div>
      )}
      {error && (
        <div role="alert" className="inline-error">
          {error}
          <button onClick={retry}>重试</button>
        </div>
      )}
      {view && (
        <div className={'detection-results' + (stale ? ' is-stale' : '')} aria-busy={stale}>
          <Curve
            title="异常分数"
            lines={[{ name: '逐点异常分数', values: view.scores, color: colors.score }]}
            labels={view.labs}
            threshold={view.model.threshold}
            selected={shownPoint}
            height={190}
            start={view.start}
            onSelect={setPoint}
          />
          <label className="slider-label">
            查看时刻
            <input
              aria-label="片段查看时刻"
              type="range"
              min="0"
              max={view.labs.length - 1}
              value={shownPoint}
              onChange={(e) => setPoint(+e.target.value)}
            />
            <span>第 {view.start + shownPoint + 1} 点</span>
          </label>
          <section className="score-steps" aria-labelledby="score-steps-title">
            <div className="score-steps-heading">
              <h2 id="score-steps-title">
                计算过程
                <Footnote note="score-calculation" reference="ref-window-calculation" />
              </h2>
              <p className="calculation-time">
                {data.times[view.start + shownPoint]}，第 {view.start + shownPoint + 1} 点
              </p>
            </div>
            <ol className="score-step-list">
              <li>
                <div className="score-step-title">
                  <span>01</span>
                  <h3>单个窗口：逐项相减再平方</h3>
                  <small>
                    第 {(view.start + 1).toLocaleString('en-US')}—
                    {(view.start + window).toLocaleString('en-US')} 点窗口，窗口内第{' '}
                    {shownPoint + 1} / {window} 个时刻
                  </small>
                </div>
                <ScoreCalculation
                  data={data}
                  input={view.input!}
                  recon={view.recon}
                  start={view.start}
                  point={shownPoint}
                  stale={stale}
                  focusFeature={viewFeature}
                  labels={labelAsset.data}
                />
              </li>
              <li>
                <div className="score-step-title">
                  <span>02</span>
                  <h3>覆盖该时刻的窗口取平均</h3>
                </div>
                <CoverageScores
                  data={data}
                  model={view.model}
                  index={view.start + shownPoint}
                  activeStart={view.start}
                  onSelect={(next) => {
                    const index = view.start + shownPoint;
                    pendingExample.current = {
                      key: `${model.run}:${model.id}:${next}`,
                      point: index - next,
                    };
                    setStart(next);
                  }}
                />
              </li>
              <li>
                <div className="score-step-title">
                  <span>03</span>
                  <h3>
                    与阈值比较
                    <Footnote note="thresholds" reference="ref-detection-threshold" />
                  </h3>
                </div>
                <div className="score-judgement">
                  <p className="calculation-comparison">
                    <span data-testid={stale ? undefined : 'point-score'}>
                      {view.model.scores[view.start + shownPoint].toFixed(9)}
                    </span>{' '}
                    <b>
                      {view.model.scores[view.start + shownPoint] > view.model.threshold
                        ? '>'
                        : '≤'}
                    </b>{' '}
                    <span data-testid={stale ? undefined : 'point-threshold'}>
                      {view.model.threshold.toFixed(9)}
                    </span>
                  </p>
                  <dl>
                    <div>
                      <dt>模型判断</dt>
                      <dd>
                        {view.model.scores[view.start + shownPoint] > view.model.threshold
                          ? '异常'
                          : '正常'}
                      </dd>
                    </div>
                    <div>
                      <dt>实验标签</dt>
                      <dd>{data.labels[view.start + shownPoint] ? '异常' : '正常'}</dd>
                    </div>
                    <div>
                      <dt>结果</dt>
                      <dd>
                        <Outcome
                          label={data.labels[view.start + shownPoint]}
                          score={view.model.scores[view.start + shownPoint]}
                          model={view.model}
                        />
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            </ol>
          </section>
          {viewFeature >= 0 && labelAsset.error && (
            <p role="alert" className="inline-error">
              {labelAsset.error}
              <button onClick={labelAsset.retry}>重试标签</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One representative time point per outcome: the strongest alarm for detections and false
 * alarms, the first occurrence for misses and normal points. */
function typicalPoints(labels: ArrayLike<number>, scores: ArrayLike<number>, threshold: number) {
  const picks = new Map<string, number>();
  for (let i = 0; i < scores.length; i++) {
    const code = outcomeCode(labels[i], scores[i], threshold);
    const current = picks.get(code);
    if (current === undefined) picks.set(code, i);
    else if ((code === 'tp' || code === 'fp') && scores[i] > scores[current]) picks.set(code, i);
  }
  return (['tp', 'fp', 'fn', 'tn'] as const).flatMap((code) =>
    picks.has(code) ? [{ code, index: picks.get(code)! }] : [],
  );
}
