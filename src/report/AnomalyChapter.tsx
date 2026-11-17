import { useEffect, useRef, type CSSProperties } from 'react';
import AnomalyResult from './AnomalyResult';
import InfoTip from './InfoTip';
import type { Journey, Model } from '../journey';
import { Heading, SelectionIndicator, colors } from './ReportUI';
import Curve from './Curve';
import { Footnote } from './notes';
import LengthConstruction from './LengthConstruction';
import ReferenceConstruction from './ReferenceConstruction';
import FeaturePicker from './FeaturePicker';
import { useCaseConstruction } from './useCaseConstruction';
import CaseNavigation from './CaseNavigation';
import { kinds, steps } from './caseContent';
import { usePlotGeometry } from './usePlotGeometry';
import { chapterContent } from './navigation';

export default function AnomalyChapter({
  data,
  model,
  setModel,
}: {
  data: Journey;
  model: Model;
  setModel: (id: string) => void;
}) {
  const state = useCaseConstruction(data, model);
  usePhaseFade(state.stageRef, state.phase);
  const { container: labelsRef, width, left, right } = usePlotGeometry();
  const {
    insertion,
    kind,
    error,
    retry,
    progress,
    setProgress,
    playing,
    setPlaying,
    point,
    setPoint,
    showResult,
    setShowResult,
    setSelectedFeature,
    resultRef,
    stageRef,
    selected,
    cm,
    arrays,
    reconstruction,
    construction,
    feature,
    phase,
    blend,
    material,
    materialProgress,
    base,
    after,
    labels,
    visibleLabels,
    weights,
    activePoints,
    writtenCount,
    written,
    visible,
    shownCandidate,
    animatedWeight,
    stableRange,
    startPlaying,
    jump,
  } = state;
  const begin = selected?.begin ?? 0,
    end = selected?.end ?? data.window;
  const span = end - begin,
    scale = selected?.source.scale ?? 3;
  const peak = selected?.source.peak ?? 30,
    patch = selected?.source.patchSize ?? 4;
  return (
    <div className="anomaly-page case-page">
      <Heading title={chapterContent.anomalies.title} />
      <div className="case-layout">
        <CaseNavigation state={state} />
        <div className="case-content">
          <div className="case-title">
            <div>
              <h2>
                {kind === 'reference'
                  ? '局部形态的改变'
                  : kind === 'uniform'
                    ? '持续平台的形成'
                    : kind === 'peak'
                      ? '单点突变与邻域标签'
                      : '局部变化的放慢'}
              </h2>
            </div>
            <span className="case-count">
              {insertion === 'replace'
                ? kinds.findIndex((k) => k.id === kind) + 1
                : kinds.findIndex((k) => k.id === kind) + 5}{' '}
              / 8
            </span>
          </div>
          {error ? (
            <div role="alert" className="state-panel">
              <p>{error}</p>
              <button onClick={() => retry()}>重新读取案例</button>
            </div>
          ) : !selected || !arrays || !cm ? (
            <div role="status" className="state-panel">
              正在读取案例…
            </div>
          ) : (
            <>
              <div
                className="case-stage"
                ref={stageRef}
                data-case={selected.id}
                data-phase={phase}
                data-written={writtenCount}
              >
                <div className="case-stage-toolbar">
                  <div
                    className="segmented case-steps"
                    role="group"
                    aria-label="构造步骤"
                    data-playing={playing || undefined}
                  >
                    <SelectionIndicator />
                    {steps.map((s, i) => (
                      <button
                        key={s}
                        aria-pressed={phase === i}
                        onClick={() => jump(i)}
                        style={{ '--fill': stepFill(progress, i) } as CSSProperties}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button className="primary" onClick={startPlaying}>
                    {playing ? '暂停' : progress >= 1 ? '重播构造' : '播放构造'}
                  </button>
                </div>
                <div className="case-context">
                  <FeaturePicker
                    features={selected.features.map((index) => data.features[index])}
                    value={feature}
                    onChange={setSelectedFeature}
                    name="案例测点"
                  />
                  <span>
                    {selected.times[0]} — {selected.times[selected.times.length - 1]}
                  </span>
                </div>
                {kind === 'reference' && phase === 1 ? (
                  <ReferenceConstruction
                    values={material.slice(selected.begin, selected.end)}
                    progress={materialProgress}
                    range={stableRange}
                    sourceStart={selected.source.referenceStart ?? 175}
                    sourceTime={data.times[selected.source.referenceStart ?? 175]}
                    onStep={(step) => {
                      setPlaying(false);
                      setProgress([0.16, 0.16 + 0.42 * 0.65, 0.58][step]);
                    }}
                  />
                ) : (
                  <Curve
                    title="片段构造"
                    lines={[
                      { name: '原始片段', values: base, color: colors.muted, dash: true },
                      ...(phase >= 1
                        ? [
                            {
                              name: '异常素材',
                              values: shownCandidate.map((v, i) =>
                                weights[i] > 0 || labels[i] ? v : null,
                              ),
                              color: colors.ink,
                              dash: true,
                              opacity: phase === 1 ? 1 : 0.65,
                            },
                          ]
                        : []),
                      { name: '插入结果', values: visible, color: colors.input },
                    ]}
                    labels={visibleLabels}
                    selection={
                      kind === 'peak'
                        ? {
                            start: Math.max(0, peak - patch),
                            end: Math.min(data.window - 1, peak + patch),
                          }
                        : { start: selected.begin, end: selected.end - 1 }
                    }
                    selected={point}
                    onSelect={setPoint}
                    height={260}
                    range={stableRange}
                  />
                )}
                <div className="case-material-strip">
                  <span>{phase === 0 ? '目标区间' : '素材构造'}</span>
                  <p>
                    {phase === 0
                      ? kind === 'peak'
                        ? `第 ${peak + 1} 点改变数值，第 ${Math.max(0, peak - patch) + 1}—${Math.min(data.window - 1, peak + patch) + 1} 点生成标签`
                        : `第 ${begin + 1}—${end} 点，${span} 个时刻`
                      : kind === 'reference'
                        ? `真实参考 ${span} 点 → 时间反转 → 1 − 数值`
                        : kind === 'uniform'
                          ? `固定构造值 → 填充 ${span} 个时刻`
                          : kind === 'peak'
                            ? '当前值 → 相反方向极值'
                            : `原片段 ${span / scale} 点 → 每点重复 ${scale} 次 → ${span} 点`}
                  </p>
                  <InfoTip label="当前构造步骤说明">
                    {phase === 0
                      ? '观察清洁片段与目标时刻。'
                      : phase === 1
                        ? construction.detail
                        : phase === 2
                          ? insertion === 'replace'
                            ? '沿时间顺序写入素材，经过的位置取对应素材值。'
                            : '按保存的权重将素材融入原片段，中央权重为 0.7。'
                          : kind === 'peak'
                            ? `极值改变一个时刻，标签覆盖该点及前后各 ${patch} 个时刻。`
                            : '选定测点的目标区间标记为 1，其余位置保持为 0。'}
                  </InfoTip>
                </div>
                <div className="case-labels" ref={labelsRef}>
                  <div>
                    <span>
                      所选测点标签
                      <Footnote note="anomaly-labels" reference="ref-anomalies-point-labels" />
                    </span>
                    <small>0 正常，1 异常</small>
                  </div>
                  <div
                    className="case-label-cells"
                    role="group"
                    aria-label="所选测点逐点标签"
                    style={{
                      marginLeft: `${(left / width) * 100}%`,
                      marginRight: `${(right / width) * 100}%`,
                    }}
                  >
                    {visibleLabels.map((v, i) => (
                      <button
                        key={i}
                        aria-label={`第 ${i + 1} 点，标签 ${v}`}
                        aria-pressed={point === i}
                        tabIndex={point === i ? 0 : -1}
                        className={v ? 'marked' : ''}
                        style={{
                          left: `${(i / (visibleLabels.length - 1)) * 100}%`,
                          width: `max(1px, calc(100% / ${visibleLabels.length - 1} - 1px))`,
                        }}
                        onClick={() => setPoint(i)}
                        onKeyDown={(event) => {
                          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                            return;
                          event.preventDefault();
                          const next =
                            event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? visibleLabels.length - 1
                                : Math.max(
                                    0,
                                    Math.min(
                                      visibleLabels.length - 1,
                                      i + (event.key === 'ArrowRight' ? 1 : -1),
                                    ),
                                  );
                          setPoint(next);
                          const buttons =
                            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                              'button',
                            );
                          buttons?.[next]?.focus();
                        }}
                      />
                    ))}
                  </div>
                  <input
                    className="case-point-slider"
                    style={{
                      marginLeft: `calc(${(left / width) * 100}% - 8px)`,
                      width: `calc(${((width - left - right) / width) * 100}% + 16px)`,
                    }}
                    type="range"
                    aria-label="案例查看时刻"
                    min="0"
                    max={visibleLabels.length - 1}
                    value={point}
                    onChange={(event) => setPoint(Number(event.target.value))}
                  />
                </div>
                <div className="case-point" aria-live="polite">
                  <span className="case-point-navigation">
                    <span>第 {point + 1} 点</span>
                    <span className="case-point-actions" role="group" aria-label="选择案例时刻">
                      <button
                        type="button"
                        onClick={() => setPoint((value) => Math.max(0, value - 1))}
                        disabled={point === 0}
                      >
                        前一点
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPoint((value) => Math.min(selected.times.length - 1, value + 1))
                        }
                        disabled={point === selected.times.length - 1}
                      >
                        后一点
                      </button>
                    </span>
                  </span>
                  <div>
                    <span>原始值</span>
                    <strong>{base[point]?.toFixed(4)}</strong>
                  </div>
                  <span className="case-arrow">→</span>
                  <div>
                    <span>插入结果</span>
                    <strong data-testid="case-after">{visible[point]?.toFixed(4)}</strong>
                  </div>
                  <div>
                    <span>标签</span>
                    <strong data-testid="case-label">{visibleLabels[point]}</strong>
                  </div>
                </div>
                {phase >= 1 && !(kind === 'reference' && phase === 1) && (
                  <div className="case-composition">
                    <span>
                      素材值 <strong>{shownCandidate[point]?.toFixed(4)}</strong>
                    </span>
                    <span>
                      {insertion === 'replace' ? '写入时刻' : phase === 3 ? '插入权重' : '混合进度'}{' '}
                      <strong>
                        {insertion === 'replace'
                          ? `${writtenCount} / ${activePoints.length}`
                          : phase === 3
                            ? weights[point]?.toFixed(2)
                            : Math.round(blend * 100) + '%'}
                      </strong>
                    </span>
                    <span>
                      {phase < 2
                        ? '构造素材，准备写入目标区间。'
                        : insertion === 'replace'
                          ? written.has(point)
                            ? '当前时刻已写入素材值'
                            : '当前时刻保留原始值'
                          : '原始值 × ' +
                            (1 - animatedWeight).toFixed(2) +
                            ' + 素材 × ' +
                            animatedWeight.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              {kind === 'length' && (
                <LengthConstruction
                  key={selected.id + ':' + feature}
                  values={base.slice(
                    selected.source.sourceBegin ?? begin,
                    selected.source.sourceEnd ?? begin + span / scale,
                  )}
                  insertion={insertion}
                  begin={begin}
                  end={end}
                  length={selected.times.length}
                  scale={scale}
                />
              )}
              <div className="case-result-action">
                <button
                  className="secondary"
                  onClick={() => {
                    setPlaying(false);
                    setProgress(1);
                    setShowResult(true);
                    requestAnimationFrame(() =>
                      resultRef.current?.scrollIntoView({
                        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                          ? 'instant'
                          : 'smooth',
                        block: 'start',
                      }),
                    );
                  }}
                >
                  查看该片段检测 →
                </button>
              </div>
              {showResult && (
                <AnomalyResult
                  data={data}
                  selected={selected}
                  cm={cm}
                  arrays={arrays}
                  reconstruction={reconstruction}
                  feature={feature}
                  point={point}
                  after={after}
                  labels={labels}
                  setPoint={setPoint}
                  resultRef={resultRef}
                  setModel={setModel}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Share of each construction step already played, for the step progress rule. */
const stepBounds = [0, 0.16, 0.58, 0.9, 1];
function stepFill(progress: number, step: number) {
  const [from, to] = [stepBounds[step], stepBounds[step + 1]];
  return Math.max(0, Math.min(1, (progress - from) / (to - from)));
}

/** New step content fades in where the stage swaps one view for another. */
function usePhaseFade(stage: React.RefObject<HTMLDivElement | null>, phase: number) {
  const previous = useRef(phase);
  useEffect(() => {
    if (previous.current === phase) return;
    previous.current = phase;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const child of stage.current?.children ?? []) {
      if (child.classList.contains('case-stage-toolbar')) continue;
      child.animate([{ opacity: 0.25 }, { opacity: 1 }], {
        duration: 280,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
  }, [stage, phase]);
}
