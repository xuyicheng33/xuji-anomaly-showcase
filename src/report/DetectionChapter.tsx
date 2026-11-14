import { useEffect, useMemo, useRef, useState } from 'react';
import { countMetrics, meanSeries, loadWindow, windowScores } from '../journey';
import {
  Heading,
  Section,
  ModelSelect,
  FeatureSelect,
  Confusion,
  Rates,
  ResultSummary,
  colors,
} from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useCurveData, useWindowInput } from './useCurveData';
import { Footnote } from './notes';
import { ScoreCalculation } from './ScoreCalculation';
import { presentationMemory } from './presentationMemory';
import type { DetectionProps } from './detectionTypes';
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [point, setPoint] = useState(Math.min(24, window - 1)),
    [draftStart, setDraftStart] = useState<string | null>(null),
    [request, setRequest] = useState<{ key: string; attempt: number } | null>(null);
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
  const resultSummary = useRef<HTMLDivElement>(null);
  const revealRequested = useRef(false);
  const requestResult = () => {
    revealRequested.current = true;
    setRequest((previous) => ({ key: viewKey, attempt: (previous?.attempt ?? 0) + 1 }));
  };
  useEffect(() => {
    const saved =
      presentationMemory.detection?.key === viewKey ? presentationMemory.detection : null;
    setResult(saved?.result ?? null);
    setError('');
    setBusy(false);
    const example = model.examples.find((item) => item.start === start);
    const selectedPoint =
      pendingExample.current?.key === viewKey ? pendingExample.current.point : null;
    pendingExample.current = null;
    setPoint(
      Math.min(window - 1, selectedPoint ?? saved?.point ?? (example ? example.index - start : 24)),
    );
  }, [viewKey, model.examples, start, window]);
  // Bind each request to its model and window; ignore responses after the selection changes.
  useEffect(() => {
    if (request?.key !== viewKey) {
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    setError('');
    loadWindow(model, start)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [request, viewKey, start, model]);
  const inputAsset = useWindowInput(data, start, request?.key === viewKey || !!result),
    input = inputAsset.data;
  const ready = !!input && result?.start === start && result.modelId === model.id,
    resultScores = useMemo(
      () => (ready ? windowScores(input, result.recon, 0, window, features) : []),
      [ready, input, result, window, features],
    ),
    threshold = model.windowThreshold,
    labs = data.labels.slice(start, start + window),
    stats = ready ? countMetrics(labs, resultScores, threshold) : null,
    index = start + point;
  const labelAsset = useCurveData(ready && viewFeature >= 0 ? data.labelMatrix : null, viewFeature);
  useEffect(() => {
    if (ready && result) presentationMemory.detection = { key: viewKey, result, point };
  }, [ready, result, point, viewKey]);
  useEffect(() => {
    if (!ready || !revealRequested.current) return;
    revealRequested.current = false;
    if (!matchMedia('(max-width: 680px)').matches) return;
    const frame = requestAnimationFrame(() =>
      resultSummary.current?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [ready, request]);
  return (
    <div className="detection-page">
      <Heading title="数据片段检测" />
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
      <div className="example-picker" role="group" aria-label="典型片段">
        {model.examples.map((e) => (
          <button
            key={e.code}
            aria-pressed={start === e.start && feature === e.feature && point === e.index - e.start}
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
          aria-label={`选择${window}点片段`}
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
        <span>
          第 {start + 1}—{start + window} 点
        </span>
        <button
          className="primary"
          disabled={busy || !inputCurve.data || invalidStart}
          onClick={requestResult}
        >
          {busy ? '正在读取…' : ready ? '重新查看结果' : '查看模型结果'} →
        </button>
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
      <p className="quiet time-range">
        <span>
          {data.times[start]} — {data.times[start + window - 1]}
        </span>
      </p>
      {ready && stats && (
        <div className="detection-summary" ref={resultSummary} aria-live="polite">
          <ResultSummary metrics={stats} scope={`独立窗口 · 第 ${start + 1}—${start + window} 点`}>
            <button
              className="inline-link"
              onClick={() =>
                document.getElementById('window-evaluation')?.scrollIntoView({
                  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'instant'
                    : 'smooth',
                  block: 'start',
                })
              }
            >
              查看评估结果 ↓
            </button>
          </ResultSummary>
        </div>
      )}
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
          <button onClick={requestResult}>重试</button>
        </div>
      )}
      {ready && stats && (
        <div className="result-reveal">
          <div className="evaluation-context">
            <span>独立窗口评估</span>
            <p>
              判定阈值{' '}
              <span className="note-anchor">
                <strong data-testid="window-threshold">{threshold.toFixed(6)}</strong>
                <Footnote note="thresholds" />
              </span>
            </p>
          </div>
          <Curve
            title="窗口异常分数"
            note="score-calculation"
            reference="ref-detection-score-plot"
            lines={[
              { name: `${features}测点平均平方误差`, values: resultScores, color: colors.score },
            ]}
            labels={labs}
            threshold={threshold}
            selected={point}
            height={190}
            start={start}
            onSelect={setPoint}
          />
          <label className="slider-label">
            查看时刻
            <input
              aria-label="片段查看时刻"
              type="range"
              min="0"
              max={window - 1}
              value={point}
              onChange={(e) => setPoint(+e.target.value)}
            />
            <span>第 {index + 1} 点</span>
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
                <Confusion metrics={stats} />
                <Rates metrics={stats} />
              </div>
              <p className="quiet">
                统计范围：第 {start + 1}—{start + window} 点
              </p>
            </Section>
          </div>
          <ScoreCalculation
            data={data}
            model={model}
            input={input!}
            recon={result.recon}
            start={start}
            point={point}
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
