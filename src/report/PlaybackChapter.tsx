import { usePlayback } from './usePlayback';
import { useRef } from 'react';
import { usePlaybackControls } from './usePlaybackControls';
import ContributionView from './ContributionView';
import TableScrollHint from './TableScrollHint';
import { pct } from '../journey';
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
import { useCurveData } from './useCurveData';
import { Footnote } from './notes';
import { PlaybackCalculation } from './PlaybackCalculation';
import type { PlaybackProps } from './detectionTypes';
import { modelName } from './modelNames';
import { chapterContent } from './navigation';

export function PlaybackChapter(p: PlaybackProps) {
  const controls = usePlaybackControls();
  const { data, model, setModel, setFeature, start, viewFeature, setViewFeature } = p;
  const {
    scope,
    setScope,
    count,
    setCount,
    playing,
    setPlaying,
    scrubbing,
    setScrubbing,
    speed,
    setSpeed,
    from,
    total,
    threshold,
    idx,
    len,
    viewStart,
    local,
    reveal,
    scores,
    labs,
    stats,
    pred,
    active,
    seek,
    nextPoints,
    nextOutcome,
  } = usePlayback(p);
  const inputAsset = useCurveData(data.input, viewFeature),
    reconAsset = useCurveData(model.recon, viewFeature);
  const curvesReady = !!inputAsset.data && !!reconAsset.data;
  const scaleContext = `${model.id}:${scope}:${start}`;
  const holdScale = playing || scrubbing;
  const overview = useRef<HTMLDivElement>(null);
  const jumpToOutcome = (index: number) => {
    nextOutcome(index);
    requestAnimationFrame(() => {
      const status = overview.current;
      const toolbar = controls.current;
      if (!status || !toolbar) return;
      const top =
        getComputedStyle(toolbar).position === 'sticky'
          ? toolbar.getBoundingClientRect().bottom
          : (document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0);
      if (status.getBoundingClientRect().top < top)
        status.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    });
  };
  return (
    <div className="playback-page" data-curves-ready={curvesReady} data-started={count > 0}>
      <div className="playback-heading">
        <Heading title={chapterContent.playback.title} />
        <button
          className="inline-link"
          aria-label="查看完整测试集评估"
          onClick={() => {
            setPlaying(false);
            document.getElementById('full-evaluation')?.scrollIntoView({
              block: 'start',
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            });
          }}
        >
          完整评估 ↓
        </button>
      </div>
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
      <div className="playback-command-bar">
        <div className="playback-settings">
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
              <option value="all">完整测试集</option>
              <option value="window">选定片段</option>
            </select>
          </label>
          <button className="text-button" onClick={() => seek(total)}>
            查看末尾
          </button>
        </div>
        <div className="playback-controls" ref={controls}>
          <div className="playback-transport" role="group" aria-label="播放控制">
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
          </div>
        </div>
      </div>
      {scope === 'window' && (
        <p className="playback-scope quiet" aria-live="polite">
          <span>
            选定片段 · 第 {from + 1}—{from + total} 点
          </span>
          <span>
            {data.times[from]} — {data.times[from + total - 1]}
          </span>
        </p>
      )}
      <div className="playback-status" ref={overview}>
        <span>{count ? data.times[idx] : data.times[from]}</span>
        {count ? (
          <Outcome label={data.labels[idx]} score={model.scores[idx]} model={model} />
        ) : null}
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
      {!count && (
        <div className="replay-intro">
          {inputAsset.data && (
            <Curve
              title={viewFeature < 0 ? `${data.features.length} 测点平均输入` : '测点输入'}
              lines={[
                {
                  name: '待回放输入',
                  values: Array.from(inputAsset.data.slice(from, from + len)),
                  color: colors.input,
                },
              ]}
              start={from}
              height={220}
            />
          )}
        </div>
      )}
      <div className="replay-workspace" hidden={!count && !inputAsset.error && !reconAsset.error}>
        <div className="playback-plots">
          {curvesReady ? (
            <ReconstructionView
              features={data.features.length}
              compact
              height={180}
              playbackScale={{ key: `${scaleContext}:${viewFeature}`, hold: holdScale }}
              aggregate={viewFeature < 0}
              input={Array.from(inputAsset.data!.slice(viewStart, viewStart + len))}
              recon={Array.from(reconAsset.data!.slice(viewStart, viewStart + len))}
              selected={local}
              reveal={reveal}
              labels={labs}
              labelKey={data.dataset?.id === 'wind' ? '保留异常标签' : '实验异常标签'}
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
            lines={[
              {
                name: `${data.features.length} 测点平均平方误差`,
                values: scores,
                color: colors.score,
              },
            ]}
            selected={local}
            reveal={reveal}
            labels={labs}
            threshold={threshold}
            height={160}
            start={viewStart}
            onSelect={(i) => seek(Math.max(0, Math.min(total, viewStart + i - from + 1)))}
          />
        </div>
        <div className="statistics playback-statistics">
          <p className="playback-statistics-context" data-testid="statistics-context">
            {count ? `累计评估 · 统计第 ${from + 1}—${idx + 1} 点` : '尚未开始统计'}
          </p>
          <Confusion metrics={stats} active={active} caption="逐点判定" />
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
              className="secondary"
              disabled={nextPoints[code] === undefined}
              title={nextPoints[code] === undefined ? '后续没有此类结果' : undefined}
              onClick={() => jumpToOutcome(nextPoints[code]!)}
            >
              下一处{{ tp: '检出', fp: '误报', fn: '漏检' }[code]}
            </button>
          ))}
        </div>
      </div>
      <div hidden={!count}>
        <ContributionView
          data={data}
          model={model}
          index={count ? idx : null}
          playing={playing}
          pause={() => setPlaying(false)}
        />
        <PlaybackCalculation
          data={data}
          model={model}
          index={count ? idx : null}
          playing={playing}
          pause={() => setPlaying(false)}
        />
      </div>
      <div id="full-evaluation">
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
                      <th>{modelName(m)}</th>
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
            {data.times.length.toLocaleString('en-US')} 个时刻，检出、误报与漏检按逐点统计。
            <Footnote note="thresholds" reference="ref-playback-thresholds" />
          </p>
        </Section>
      </div>
    </div>
  );
}
