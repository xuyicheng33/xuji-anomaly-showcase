import TableScrollHint from './TableScrollHint';
import { useEffect, useState } from 'react';
import {
  countMetrics,
  meanSeries,
  loadWindow,
  windowScores,
  pct,
  type Journey,
  type Model,
} from '../journey';
import {
  Heading,
  Section,
  ModelSelect,
  FeatureSelect,
  Confusion,
  Rates,
  Outcome,
  colors,
} from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useDataAsset } from './useDataAsset';
import { useCurveData, useWindowInput } from './useCurveData';
import { Footnote, usePauseOnNavigation } from './notes';
import { ScoreCalculation, PlaybackCalculation } from './ScoreCalculation';
import { presentationMemory } from './presentationMemory';
type Props = {
  data: Journey;
  model: Model;
  setModel: (id: string) => void;
  feature: number;
  setFeature: (i: number) => void;
  start: number;
  setStart: (i: number) => void;
  viewFeature: number;
  setViewFeature: (n: number) => void;
};
const names: Record<string, string> = {
  tp: '检出片段',
  fp: '误报片段',
  fn: '漏检片段',
  tn: '正常片段',
};
type WindowResult = Awaited<ReturnType<typeof loadWindow>>;
export function DetectionChapter(p: Props) {
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
    setPoint(saved?.point ?? 24);
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
    resultScores = ready ? windowScores(input, result.recon, 0) : [],
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
      <Heading number="05" title="数据片段检测">
        64 点窗口的重建结果、异常分数与检测判定。
      </Heading>
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
        {model.examples?.map((e) => (
          <button
            key={e.code}
            aria-pressed={start === e.start && feature === e.feature}
            onClick={() => {
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
            value={start + 1}
            onChange={(e) =>
              setStart(
                Math.max(
                  0,
                  Math.min(data.times.length - 64, Math.floor(Number(e.target.value) || 1) - 1),
                ),
              )
            }
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
export function PlaybackChapter(p: Props) {
  const { data, model, setModel, setFeature, start, viewFeature, setViewFeature } = p;
  const [scope, setScope] = useState('all'),
    [count, setCount] = useState(0),
    [playing, setPlaying] = useState(false),
    [scrubbing, setScrubbing] = useState(false),
    [speed, setSpeed] = useState(4);
  const from = scope === 'all' ? 0 : start,
    total = scope === 'all' ? data.times.length : 64,
    threshold = model.threshold,
    displayModel = { ...model, threshold };
  usePauseOnNavigation(() => setPlaying(false));
  const inputAsset = useCurveData(data.input, viewFeature),
    reconAsset = useCurveData(model.recon, viewFeature);
  const [focusTarget, setFocusTarget] = useState<{ index: number; modelId: string } | null>(null);
  const errorAsset = useDataAsset(focusTarget?.modelId === model.id ? model.errors : null);
  useEffect(() => {
    if (!focusTarget || focusTarget.modelId !== model.id || !errorAsset.data) return;
    let best = 0;
    for (let f = 1; f < 125; f++)
      if (
        errorAsset.data[focusTarget.index * 125 + f] >
        errorAsset.data[focusTarget.index * 125 + best]
      )
        best = f;
    setFeature(best);
    setViewFeature(best);
    setFocusTarget(null);
  }, [focusTarget, errorAsset.data, model.id]);
  useEffect(() => {
    setFocusTarget(null);
  }, [model.id, scope, start]);
  useEffect(() => {
    setCount(0);
    setPlaying(false);
  }, [scope, start]);
  useEffect(() => {
    setPlaying(false);
  }, [model.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setCount((c) => {
          if (c >= total - 1) {
            setPlaying(false);
            return total;
          }
          return c + 1;
        }),
      500 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, total]);
  const idx = from + Math.max(0, count - 1),
    len = 64,
    viewStart = scope === 'all' ? Math.max(0, Math.min(data.times.length - len, idx - 40)) : start,
    local = count ? idx - viewStart : -1,
    reveal = count ? Math.max(0, idx - viewStart + 1) : 0,
    scores = model.scores.slice(viewStart, viewStart + len),
    labs = data.labels.slice(viewStart, viewStart + len),
    stats = countMetrics(data.labels, model.scores, threshold, from, from + count),
    actual = data.labels[idx] > 0,
    pred = model.scores[idx] > threshold,
    active = count ? (actual ? (pred ? 'tp' : 'fn') : pred ? 'fp' : 'tn') : undefined;
  const seek = (n: number) => {
    setPlaying(false);
    setCount(n);
    setFocusTarget(null);
  };
  const nextOutcome = (code: string) => {
    const found = data.labels.findIndex(
      (l, i) =>
        i >= from + count &&
        i < from + total &&
        (l
          ? model.scores[i] > threshold
            ? 'tp'
            : 'fn'
          : model.scores[i] > threshold
            ? 'fp'
            : 'tn') === code,
    );
    seek(found >= 0 ? found - from + 1 : total);
    if (found >= 0 && viewFeature >= 0) setFocusTarget({ index: found, modelId: model.id });
  };
  const curvesReady = !!inputAsset.data && !!reconAsset.data;
  const scaleContext = `${model.id}:${scope}:${start}`;
  const holdScale = playing || scrubbing;
  return (
    <div className="playback-page">
      <div className="playback-heading">
        <div>
          <h1>检测结果回放</h1>
        </div>
      </div>
      <div className="toolbar">
        <ModelSelect data={data} value={model.id} onChange={setModel} />
        <FeatureSelect
          data={data}
          value={viewFeature}
          aggregate
          onChange={(n) => {
            setFocusTarget(null);
            setViewFeature(n);
            if (n >= 0) setFeature(n);
          }}
        />
      </div>
      <div className="playback-controls">
        <button
          className="primary"
          onClick={() => {
            if (count === total) setCount(0);
            setFocusTarget(null);
            setPlaying((v) => !v);
          }}
        >
          {playing ? '暂停' : count === total ? '重新播放' : '播放'}
        </button>
        <button onClick={() => seek(Math.min(total, count + 1))} disabled={count === total}>
          单步
        </button>
        <button onClick={() => seek(0)}>重置</button>
        <label>
          速度
          <select aria-label="播放速度" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
            {[1, 2, 4, 8, 16].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <label>
          范围
          <select aria-label="播放范围" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">完整测试集，2,397点</option>
            <option value="window">选定片段，64点</option>
          </select>
        </label>
        <button className="text-button" onClick={() => seek(total)}>
          查看末尾
        </button>
      </div>
      <div className="playback-status">
        <span>{count ? data.times[idx] : '准备开始'}</span>
        {count ? (
          <Outcome label={data.labels[idx]} score={model.scores[idx]} model={displayModel} />
        ) : (
          <span>播放后逐点显示判断</span>
        )}
        <span data-testid="played-count">
          已查看 {count} / {total} 点
        </span>
      </div>
      <input
        className="playhead"
        type="range"
        aria-label="播放进度"
        min="0"
        max={total}
        value={count}
        onChange={(e) => seek(+e.target.value)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrubbing(true);
        }}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
        onLostPointerCapture={() => setScrubbing(false)}
        onKeyDown={(e) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(e.key)
          )
            setScrubbing(true);
        }}
        onKeyUp={() => setScrubbing(false)}
        onBlur={() => setScrubbing(false)}
      />
      <p className="quiet playback-caption">
        橙色区域表示真实异常{viewFeature >= 0 ? '，下方分数综合全部 125 个测点' : ''}
      </p>
      <div className="replay-workspace">
        <div className="playback-plots">
          {curvesReady ? (
            <ReconstructionView
              compact
              playbackScale={{ key: `${scaleContext}:${viewFeature}`, hold: holdScale }}
              aggregate={viewFeature < 0}
              input={Array.from(inputAsset.data!.slice(viewStart, viewStart + len))}
              recon={Array.from(reconAsset.data!.slice(viewStart, viewStart + len))}
              selected={local}
              reveal={reveal}
              labels={labs}
              start={viewStart}
              onSelect={(i) => seek(Math.max(0, Math.min(total, viewStart + i - from + 1)))}
            />
          ) : (
            <div
              className="curve-loading compact"
              role={inputAsset.error || reconAsset.error ? 'alert' : 'status'}
            >
              {inputAsset.error || reconAsset.error ? (
                <>
                  <span>重建曲线读取失败。</span>
                  <button
                    onClick={() => {
                      if (inputAsset.error) inputAsset.retry();
                      if (reconAsset.error) reconAsset.retry();
                    }}
                  >
                    重试曲线
                  </button>
                </>
              ) : (
                '正在读取重建曲线…'
              )}
            </div>
          )}
          <Curve
            title="整体异常分数"
            playbackScale={{ key: scaleContext, hold: holdScale }}
            note="window-aggregation"
            reference="ref-playback-score-plot"
            lines={[{ name: '125 测点平均平方误差', values: scores, color: colors.score }]}
            selected={local}
            reveal={reveal}
            labels={labs}
            threshold={threshold}
            height={135}
            start={viewStart}
            onSelect={(i) => seek(Math.max(0, Math.min(total, viewStart + i - from + 1)))}
          />
        </div>
        <div className="statistics playback-statistics">
          <Confusion metrics={stats} active={active} />
          <div>
            <div className="current-score">
              <span>
                当前时刻分数 /{' '}
                <span className="note-anchor">
                  阈值
                  <Footnote note="thresholds" reference="ref-playback-threshold-value" />
                </span>
              </span>
              <strong>
                {count ? model.scores[idx].toFixed(5) : '—'}{' '}
                <small>
                  {count ? (pred ? '>' : '≤') : '/'} {threshold.toFixed(5)}
                </small>
              </strong>
            </div>
            <Rates metrics={stats} />
          </div>
        </div>
      </div>
      <div className="replay-links">
        <div>
          <button className="text-button" onClick={() => nextOutcome('tp')}>
            下一处检出
          </button>
          <button className="text-button" onClick={() => nextOutcome('fp')}>
            下一处误报
          </button>
          <button className="text-button" onClick={() => nextOutcome('fn')}>
            下一处漏检
          </button>
        </div>
      </div>
      {focusTarget && (
        <div className="feature-location" role={errorAsset.error ? 'alert' : 'status'}>
          {errorAsset.error ? (
            <>
              <span>测点定位数据读取失败。</span>
              <button onClick={errorAsset.retry}>重试定位</button>
            </>
          ) : (
            '正在定位主要误差测点…'
          )}
        </div>
      )}
      <PlaybackCalculation
        data={data}
        model={model}
        index={count ? idx : null}
        playing={playing}
        pause={() => setPlaying(false)}
      />
      <Section
        title={
          <>
            完整测试集评估结果
            <Footnote note="point-metrics" reference="ref-playback-point-metrics" />
          </>
        }
      >
        <TableScrollHint id="playback-table-hint">左右滑动查看全部指标。</TableScrollHint>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="完整测试集评估指标"
          aria-describedby="playback-table-hint"
        >
          <table>
            <thead>
              <tr>
                <th>方法</th>
                <th>检出</th>
                <th>误报</th>
                <th>漏检</th>
                <th>正确正常</th>
                <th>精确率</th>
                <th>召回率</th>
                <th>逐点F1</th>
                <th>区间点调整F1</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => {
                const v = m.metrics.point_wise;
                return (
                  <tr key={m.id}>
                    <th>{m.name}</th>
                    <td>{v.tp}</td>
                    <td>{v.fp}</td>
                    <td>{v.fn}</td>
                    <td>{v.tn}</td>
                    <td> {pct(v.precision)}</td>
                    <td> {pct(v.recall)}</td>
                    <td>{pct(v.f1)}</td>
                    <td>{pct(m.metrics.point_adjusted.f1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="quiet">
          2,397 个时刻，检出、误报与漏检按逐点统计。
          <Footnote note="thresholds" reference="ref-playback-thresholds" />
        </p>
      </Section>
    </div>
  );
}
