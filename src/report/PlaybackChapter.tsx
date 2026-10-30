import TableScrollHint from './TableScrollHint';
import { useEffect, useMemo, useState } from 'react';
import { metricPrefixes, outcomeCode, pct, type OutcomeCode } from '../journey';
import { Section, ModelSelect, FeatureSelect, Confusion, Rates, Outcome, colors } from './ReportUI';
import Curve from './Curve';
import ReconstructionView from './ReconstructionView';
import { useCurveData } from './useCurveData';
import { Footnote, usePauseOnNavigation } from './notes';
import { PlaybackCalculation } from './PlaybackCalculation';
import type { PlaybackProps } from './detectionTypes';

export function PlaybackChapter(p: PlaybackProps) {
  const { data, model, setModel, setFeature, start, viewFeature, setViewFeature } = p;
  const [scope, setScope] = useState('all'),
    [count, setCount] = useState(0),
    [playing, setPlaying] = useState(false),
    [scrubbing, setScrubbing] = useState(false),
    [speed, setSpeed] = useState(4);
  const from = scope === 'all' ? 0 : start,
    total = scope === 'all' ? data.times.length : 64,
    threshold = model.threshold;
  usePauseOnNavigation(() => setPlaying(false));
  const inputAsset = useCurveData(data.input, viewFeature),
    reconAsset = useCurveData(model.recon, viewFeature);
  useEffect(() => {
    setCount(0);
    setPlaying(false);
  }, [start]);
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
  const prefixes = useMemo(
    () =>
      metricPrefixes(
        data.labels.slice(from, from + total),
        model.scores.slice(from, from + total),
        threshold,
      ),
    [data, model, from, total, threshold],
  );
  const idx = from + Math.max(0, count - 1),
    len = 64,
    viewStart = scope === 'all' ? Math.max(0, Math.min(data.times.length - len, idx - 40)) : start,
    local = count ? idx - viewStart : -1,
    reveal = count ? Math.max(0, idx - viewStart + 1) : 0,
    scores = model.scores.slice(viewStart, viewStart + len),
    labs = data.labels.slice(viewStart, viewStart + len),
    stats = prefixes[count],
    pred = model.scores[idx] > threshold,
    active = count ? outcomeCode(data.labels[idx], model.scores[idx], threshold) : undefined;
  const seek = (n: number) => {
    setPlaying(false);
    setCount(n);
  };
  const nextPoints = useMemo(() => {
    const points: Partial<Record<OutcomeCode, number>> = {};
    for (let i = from + count; i < from + total; i++) {
      const code = outcomeCode(data.labels[i], model.scores[i], threshold);
      points[code] ??= i;
    }
    return points;
  }, [data.labels, model, threshold, from, count, total]);
  const nextOutcome = (found: number) => {
    seek(found - from + 1);
    if (viewFeature >= 0) {
      const best = model.focusFeatures[found];
      setFeature(best);
      setViewFeature(best);
    }
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
          <select
            aria-label="播放范围"
            value={scope}
            onChange={(e) => {
              seek(0);
              setScope(e.target.value);
            }}
          >
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
          <Outcome label={data.labels[idx]} score={model.scores[idx]} model={model} />
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
          <Confusion metrics={stats} active={active} caption="当前时刻累计结果" />
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
          {(['tp', 'fp', 'fn'] as const).map((code) => (
            <button
              key={code}
              className="text-button"
              disabled={nextPoints[code] === undefined}
              title={nextPoints[code] === undefined ? '后续没有此类结果' : undefined}
              onClick={() => nextOutcome(nextPoints[code]!)}
            >
              下一处{{ tp: '检出', fp: '误报', fn: '漏检' }[code]}
            </button>
          ))}
        </div>
      </div>
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
                <th>逐点F1</th>
                <th>区间点调整F1</th>
                <th>精确率</th>
                <th>召回率</th>
                <th>检出</th>
                <th>误报</th>
                <th>漏检</th>
                <th>正确正常</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => {
                const v = m.metrics.point_wise;
                return (
                  <tr key={m.id}>
                    <th>{m.name}</th>
                    <td>{pct(v.f1)}</td>
                    <td>{pct(m.metrics.point_adjusted.f1)}</td>
                    <td> {pct(v.precision)}</td>
                    <td> {pct(v.recall)}</td>
                    <td>{v.tp}</td>
                    <td>{v.fp}</td>
                    <td>{v.fn}</td>
                    <td>{v.tn}</td>
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
