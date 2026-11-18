import { useEffect, useMemo, useRef, useState } from 'react';
import { countMetrics, meanSeries, loadWindow, windowScores } from '../journey';
import {
  Heading,
  Section,
  ModelSelect,
  FeatureSelect,
  Confusion,
  Rates,
  SelectionIndicator,
  colors,
} from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useCurveData, useWindowInput } from './useCurveData';
import { Footnote } from './notes';
import { ScoreCalculation } from './ScoreCalculation';
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
    feature,
    setFeature,
    start,
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
    [draftStart, setDraftStart] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const viewKey = `${model.run}:${model.id}:${start}`;
  const maximumStart = data.times.length - window + 1;
  const invalidStart =
    draftStart !== null &&
    (!draftStart.trim() ||
      !Number.isInteger(Number(draftStart)) ||
      Number(draftStart) < 1 ||
      Number(draftStart) > maximumStart);
  const [validateStart, setValidateStart] = useState(false);
  const pendingExample = useRef<{ key: string; point: number } | null>(null);
  const retry = () => setAttempt((value) => value + 1);
  useEffect(() => {
    const saved =
      presentationMemory.detection?.key === viewKey ? presentationMemory.detection : null;
    // Keep the previous window on screen until the next one arrives.
    if (saved) setResult(saved.result);
    setError('');
    const example = model.examples.find((item) => item.start === start);
    const selectedPoint =
      pendingExample.current?.key === viewKey ? pendingExample.current.point : null;
    pendingExample.current = null;
    setPoint(
      Math.min(window - 1, selectedPoint ?? saved?.point ?? (example ? example.index - start : 24)),
    );
  }, [viewKey, model.examples, start, window]);
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
    resultScores = useMemo(
      () => (ready ? windowScores(input, result.recon, 0, window, features) : []),
      [ready, input, result, window, features],
    ),
    threshold = model.windowThreshold,
    labs = data.labels.slice(start, start + window),
    stats = ready ? countMetrics(labs, resultScores, threshold) : null;
  const labelAsset = useCurveData(ready && viewFeature >= 0 ? data.labelMatrix : null, viewFeature);
  useEffect(() => {
    if (ready && result) presentationMemory.detection = { key: viewKey, result, point };
  }, [ready, result, point, viewKey]);
  // The evaluation stays in place while the next window loads, then updates where it stands.
  const currentView =
    ready && stats
      ? { model, input, recon: result.recon, start, labs, scores: resultScores, stats }
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
          {model.examples.map((e) => (
            <button
              key={e.code}
              aria-pressed={
                start === e.start && feature === e.feature && point === e.index - e.start
              }
              onClick={() => {
                pendingExample.current =
                  start === e.start
                    ? null
                    : {
                        key: `${model.run}:${model.id}:${e.start}`,
                        point: e.index - e.start,
                      };
                setPoint(e.index - e.start);
                setDraftStart(null);
                setValidateStart(false);
                setStart(e.start);
                setFeature(e.feature);
                setViewFeature(e.feature);
              }}
            >
              {names[e.code]}
            </button>
          ))}
        </div>
      </div>
      <div className="selection-panel">
        <label className="field">
          起始位置
          <input
            aria-label="片段起点"
            type="number"
            min="1"
            max={data.times.length - window + 1}
            aria-invalid={(validateStart && invalidStart) || undefined}
            aria-describedby="start-input-hint"
            value={draftStart ?? start + 1}
            onChange={(e) => {
              setDraftStart(e.target.value);
              if (e.target.value && e.target.validity.valid) setStart(e.target.valueAsNumber - 1);
            }}
            onBlur={() => {
              setValidateStart(true);
              if (!invalidStart) setDraftStart(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <input
          aria-label={`选择 ${window} 点片段`}
          type="range"
          min="0"
          max={data.times.length - window}
          value={start}
          onChange={(e) => {
            setDraftStart(null);
            setValidateStart(false);
            setStart(+e.target.value);
          }}
        />
        <span className="window-range">
          第 {(start + 1).toLocaleString('en-US')}—{(start + window).toLocaleString('en-US')} 点
          <small>
            {data.times[start]} — {data.times[start + window - 1]}
          </small>
        </span>
      </div>
      <p
        id="start-input-hint"
        className={validateStart && invalidStart ? 'input-hint invalid' : 'sr-only'}
        role={validateStart && invalidStart ? 'alert' : undefined}
      >
        {validateStart && invalidStart
          ? `输入 1—${maximumStart} 之间的整数，当前仍显示第 ${start + 1} 点起的片段。`
          : `可选起点：1—${maximumStart}`}
      </p>
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
            title="窗口异常分数"
            lines={[
              { name: `${features} 测点平均平方误差`, values: view.scores, color: colors.score },
            ]}
            labels={view.labs}
            threshold={view.model.windowThreshold}
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
          <div id="window-evaluation">
            <Section
              title={
                <>
                  片段评估结果
                  <Footnote note="point-metrics" />
                </>
              }
            >
              <div className="statistics">
                <Confusion metrics={view.stats} />
                <div className="matrix-section">
                  <div className="matrix-caption">
                    <h3>评估指标</h3>
                  </div>
                  <Rates metrics={view.stats} />
                </div>
              </div>
            </Section>
          </div>
          <ScoreCalculation
            data={data}
            model={view.model}
            input={view.input!}
            recon={view.recon}
            start={view.start}
            point={shownPoint}
            stale={stale}
            focusFeature={viewFeature}
            labels={labelAsset.data}
          />
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
