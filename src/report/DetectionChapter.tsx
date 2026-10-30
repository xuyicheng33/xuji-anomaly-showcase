import { useEffect, useMemo, useState } from 'react';
import { countMetrics, meanSeries, loadWindow, windowScores, pct } from '../journey';
import { Heading, Section, ModelSelect, FeatureSelect, Confusion, Rates, colors } from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useDataAsset } from './useDataAsset';
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
  const inputCurve = useCurveData(data.input, viewFeature);
  const [result, setResult] = useState<WindowResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [point, setPoint] = useState(24),
    [draftStart, setDraftStart] = useState<string | null>(null),
    [request, setRequest] = useState<{ key: string; attempt: number } | null>(null);
  const viewKey = `${model.run}:${model.id}:${start}`;
  const requestResult = () =>
    setRequest((previous) => ({ key: viewKey, attempt: (previous?.attempt ?? 0) + 1 }));
  useEffect(() => {
    const saved =
      presentationMemory.detection?.key === viewKey ? presentationMemory.detection : null;
    setResult(saved?.result ?? null);
    setError('');
    setBusy(false);
    const example = model.examples.find((item) => item.start === start);
    setPoint(saved?.point ?? (example ? example.index - start : 24));
  }, [viewKey]);
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
  }, [request, viewKey, start, model.id]);
  const inputAsset = useWindowInput(data.input, start, request?.key === viewKey || !!result),
    input = inputAsset.data;
  const ready = !!input && result?.start === start && result.modelId === model.id,
    resultScores = useMemo(
      () => (ready ? windowScores(input, result.recon, 0) : []),
      [ready, input, result],
    ),
    threshold = model.windowThreshold,
    labs = data.labels.slice(start, start + 64),
    stats = ready ? countMetrics(labs, resultScores, threshold) : null,
    index = start + point;
  const labelAsset = useDataAsset(ready && viewFeature >= 0 ? data.labelMatrix : null);
  useEffect(() => {
    if (ready && result) presentationMemory.detection = { key: viewKey, result, point };
  }, [ready, result, point, viewKey]);
  return (
    <div className="detection-page">
      <Heading title="数据片段检测">64 点窗口的重建结果、异常分数与检测判定。</Heading>
      <div className="toolbar">
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
        <span>典型片段</span>
        {model.examples.map((e) => (
          <button
            key={e.code}
            aria-pressed={start === e.start && feature === e.feature}
            onClick={() => {
              setPoint(e.index - e.start);
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
            max={data.times.length - 63}
            value={draftStart ?? start + 1}
            onChange={(e) => {
              setDraftStart(e.target.value);
              if (e.target.value && e.target.validity.valid) setStart(e.target.valueAsNumber - 1);
            }}
            onBlur={() => setDraftStart(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <input
          aria-label="选择64点片段"
          type="range"
          min="0"
          max={data.times.length - 64}
          value={start}
          onChange={(e) => setStart(+e.target.value)}
        />
        <span>
          第 {start + 1}—{start + 64} 点
        </span>
        <button className="primary" disabled={busy || !inputCurve.data} onClick={requestResult}>
          {busy ? '正在读取…' : ready ? '重新查看结果' : '查看模型结果'} →
        </button>
      </div>
      <p className="quiet time-range">
        {data.times[start]} — {data.times[start + 63]}，
        <span className="note-anchor">
          64个时刻 × 125个测点
          <Footnote note="score-calculation" reference="ref-detection-score-calculation" />
        </span>
      </p>
      {ready && stats && (
        <div className="detection-summary" aria-live="polite">
          <span>
            检出 <strong>{stats.tp}</strong>
          </span>
          <span>
            误报 <strong>{stats.fp}</strong>
          </span>
          <span>
            漏检 <strong>{stats.fn}</strong>
          </span>
          <span>
            逐点F1 <strong>{pct(stats.f1)}</strong>
          </span>
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
        </div>
      )}
      <p className="quiet chart-label-key">
        <i />
        真实异常区间
      </p>
      {inputCurve.data ? (
        <ReconstructionView
          aggregate={viewFeature < 0}
          input={Array.from(inputCurve.data.slice(start, start + 64))}
          recon={
            ready
              ? viewFeature < 0
                ? meanSeries(result.recon)
                : Array.from({ length: 64 }, (_, i) => result.recon[i * 125 + viewFeature])
              : undefined
          }
          labels={labs}
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
        <div role="alert">
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
            lines={[{ name: '125测点平均平方误差', values: resultScores, color: colors.score }]}
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
              max="63"
              value={point}
              onChange={(e) => setPoint(+e.target.value)}
            />
            <span>第 {index + 1} 点</span>
          </label>
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
            <p role="alert">
              {labelAsset.error}
              <button onClick={labelAsset.retry}>重试标签</button>
            </p>
          )}
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
                统计范围：第 {start + 1}—{start + 64} 点
              </p>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
