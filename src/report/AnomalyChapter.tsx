import AnomalyResult from './AnomalyResult';
import { useEffect, useRef, useState } from 'react';
import { series, type Journey, type Model } from '../journey';
import {
  loadCases,
  loadCaseArrays,
  type AnomalyCase,
  type CaseArrays,
  type Insertion,
  type Construction,
} from '../anomalyCases';
import { Heading, colors } from './ReportUI';
import Curve from './Curve';
import { curveDomain } from './curveScale';
import { Footnote, usePauseOnNavigation } from './notes';
import LengthConstruction from './LengthConstruction';
import ReferenceConstruction from './ReferenceConstruction';
import { useDataAsset } from './useDataAsset';

const methods = [
  {
    id: 'replace' as const,
    name: '替换',
    copy: '用异常素材替代局部原值。',
    formula: '结果 = 异常素材',
  },
  {
    id: 'blend' as const,
    name: '混合',
    copy: '保留原始变化，按权重融入异常素材。',
    formula: '结果 = 原始值 × (1 − 权重) + 素材 × 权重',
  },
];
const kinds = [
  {
    id: 'reference' as const,
    name: '参考片段',
    copy: '从真实记录中取出一段序列，翻转时间顺序与数值方向，形成不同的变化形态。',
    detail: '参考片段取自同一清洁测试集。先沿时间反转，再以 1 − 数值翻转幅值。',
  },
  {
    id: 'uniform' as const,
    name: '均匀值',
    copy: '为选定测点构造一个固定值，使局部波动形成持续平台。',
    detail: '区间内使用同一个构造值；替换形成平台，混合保留原曲线的部分波动。',
  },
  {
    id: 'peak' as const,
    name: '峰值噪声',
    copy: '在一个时刻构造方向相反的极值，并为相邻时刻生成异常标签。',
    detail: '原值较高时取接近 0 的值，原值较低时取接近 1 的值；前后各 4 点一并标记。',
  },
  {
    id: 'length' as const,
    name: '长度调整',
    copy: '将 8 个采样点各重复 3 次，形成 24 点素材，写入固定区间。',
    detail:
      '来源为第 19—26 点，重复采样后写入第 19—42 点，覆盖或混合该区间原值；第 43—64 点保留原来的位置与数值。',
  },
];
const steps = ['原始片段', '异常素材', '插入过程', '标签结果'];
export default function AnomalyChapter({
  data,
  model,
  setModel,
}: {
  data: Journey;
  model: Model;
  setModel: (id: string) => void;
}) {
  const [cases, setCases] = useState<AnomalyCase[]>([]),
    [insertion, setInsertion] = useState<Insertion>('replace'),
    [kind, setKind] = useState<Construction>('reference');
  const [bundle, setBundle] = useState<{ key: string; arrays: CaseArrays } | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false),
    [point, setPoint] = useState(30),
    [showResult, setShowResult] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  usePauseOnNavigation(() => setPlaying(false));
  const resultRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const selected = cases.find((c) => c.insertion === insertion && c.kind === kind),
    cm = selected?.models.find((m) => m.id === model.id),
    key = selected?.id ?? '';
  const arrays = bundle?.key === key ? bundle.arrays : null;
  const reconstruction = useDataAsset(cm?.recon ?? null);
  useEffect(() => {
    let active = true;
    setError('');
    loadCases()
      .then((d) => {
        if (active) setCases(d.cases);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setError('');
    loadCaseArrays(selected)
      .then((arrays) => {
        if (active) setBundle({ key, arrays });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [key, selected, attempt]);
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
    setShowResult(false);
    setPoint(30);
    setSelectedFeature(null);
  }, [selected?.id]);
  useEffect(() => {
    setPlaying(false);
  }, [model.id]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last: number | undefined;
    const tick = (now: number) => {
      if (last !== undefined && !document.hidden) {
        const delta = now - last;
        setProgress((p) => Math.min(1, p + delta / (kind === 'reference' ? 12000 : 8000)));
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, kind]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);
  const method = methods.find((m) => m.id === insertion)!,
    construction = kinds.find((k) => k.id === kind)!;
  const feature = selectedFeature ?? selected?.feature ?? 4;
  const phase = progress < 0.16 ? 0 : progress <= 0.58 ? 1 : progress < 0.9 ? 2 : 3;
  const blend = Math.max(0, Math.min(1, (progress - 0.58) / 0.32));
  const material = arrays
    ? series(
        arrays.material,
        feature,
        0,
        selected?.times.length ?? data.window,
        data.features.length,
      )
    : [];
  const materialProgress = Math.max(0, Math.min(1, (progress - 0.16) / 0.42));
  const base = arrays
      ? series(
          arrays.original,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    candidate = arrays
      ? series(
          arrays.candidate,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    after = arrays
      ? series(
          arrays.input,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [];
  const labels = arrays
      ? series(
          arrays.labels,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    visibleLabels = labels.map((v) => (phase === 3 ? v : 0));
  const weights = arrays
    ? series(
        arrays.weights,
        feature,
        0,
        selected?.times.length ?? data.window,
        data.features.length,
      )
    : [];
  const activePoints = weights.flatMap((weight, index) => (weight > 0 ? [index] : []));
  const writtenCount = Math.ceil(activePoints.length * blend - 1e-9);
  const written = new Set(activePoints.slice(0, writtenCount));
  const visible = base.map((value, index) =>
    insertion === 'replace'
      ? written.has(index)
        ? after[index]
        : value
      : value + (after[index] - value) * blend,
  );
  const shownCandidate = candidate.map(
    (v, i) => material[i] + (v - material[i]) * materialProgress,
  );
  const animatedWeight = (weights[point] ?? 0) * blend;
  const stableRange = curveDomain([...base, ...candidate, ...material, ...after]);
  const startPlaying = () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!playing && matchMedia('(max-width: 820px)').matches)
      stageRef.current?.scrollIntoView({
        behavior: reduced ? 'instant' : 'smooth',
        block: 'start',
      });
    if (reduced) {
      setProgress(1);
      setPlaying(false);
      return;
    }
    if (progress >= 1) setProgress(0);
    setPlaying((v) => !v);
  };
  const jump = (n: number) => {
    setPlaying(false);
    setProgress([0, 0.58, 0.74, 1][n]);
  };
  return (
    <div className="anomaly-page case-page">
      <Heading title="异常样本构造" />
      <div className="case-layout">
        <aside className="case-navigation" aria-label="异常案例导航">
          <button
            className="case-selection-summary"
            aria-expanded={pickerOpen}
            aria-controls="case-navigation-options"
            onClick={() => {
              setPlaying(false);
              setPickerOpen((open) => !open);
            }}
          >
            <strong>
              {method.name} · {construction.name}
            </strong>
            <span>{pickerOpen ? '收起选择' : '更换方式'}</span>
          </button>
          <div
            id="case-navigation-options"
            className={'case-navigation-options' + (pickerOpen ? ' is-open' : '')}
          >
            <div className="case-nav-group">
              <h2>
                插入方式
                <Footnote note="anomaly-cases" />
              </h2>
              <div className="case-methods">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    aria-pressed={insertion === m.id}
                    onClick={() => {
                      setInsertion(m.id);
                      setPickerOpen(false);
                    }}
                  >
                    <strong>{m.name}</strong>
                    <span>{m.copy}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="case-nav-group">
              <h2>构造方法</h2>
              <div className="case-kinds">
                {kinds.map((k, i) => (
                  <button
                    key={k.id}
                    aria-pressed={kind === k.id}
                    onClick={() => {
                      setKind(k.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span>0{i + 1}</span>
                    <strong>{k.name}</strong>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
              <p className="case-kind-copy">{construction.copy}</p>
            </div>
            <p className="case-formula">{method.formula}</p>
            <details className="case-mobile-explanation">
              <summary>查看构造说明与公式</summary>
              <p>{method.copy}</p>
              <p>{construction.copy}</p>
              <p>{method.formula}</p>
            </details>
          </div>
        </aside>
        <div className="case-content">
          <div className="case-title">
            <div>
              <p>
                {method.name}：{construction.name}
              </p>
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
              <button onClick={() => setAttempt((v) => v + 1)}>重新读取案例</button>
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
                  <div className="case-steps" role="group" aria-label="构造步骤">
                    {steps.map((s, i) => (
                      <button key={s} aria-pressed={phase === i} onClick={() => jump(i)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <button className="primary" onClick={startPlaying}>
                    {playing ? '暂停' : progress >= 1 ? '重播构造' : '播放构造'}
                  </button>
                </div>
                <div className="case-context">
                  <label>
                    测点
                    <select
                      aria-label="案例测点"
                      value={feature}
                      onChange={(e) => setSelectedFeature(+e.target.value)}
                    >
                      {selected.features.map((f) => (
                        <option key={f} value={f}>
                          {data.features[f].label}（{data.features[f].key}）
                        </option>
                      ))}
                    </select>
                  </label>
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
                        ? { start: 26, end: 34 }
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
                        ? '第 31 点改变数值，第 27—35 点生成标签'
                        : '第 19—42 点，24 个时刻'
                      : kind === 'reference'
                        ? '真实参考 24 点 → 时间反转 → 1 − 数值'
                        : kind === 'uniform'
                          ? '固定构造值 → 填充 24 个时刻'
                          : kind === 'peak'
                            ? '当前值 → 相反方向极值'
                            : '原片段 8 点 → 每点重复 3 次 → 24 点'}
                  </p>
                </div>
                <div className="case-labels">
                  <div>
                    <span>
                      所选测点标签
                      <Footnote note="anomaly-labels" reference="ref-anomalies-point-labels" />
                    </span>
                    <small>0 正常，1 异常</small>
                  </div>
                  <div className="case-label-cells">
                    {visibleLabels.map((v, i) => (
                      <button
                        key={i}
                        aria-label={`第 ${i + 1} 点，标签 ${v}`}
                        aria-pressed={point === i}
                        className={v ? 'marked' : ''}
                        onClick={() => setPoint(i)}
                      />
                    ))}
                  </div>
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
                <p className="case-stage-copy" aria-live="polite">
                  {phase === 0
                    ? '观察清洁片段与目标时刻。'
                    : phase === 1
                      ? construction.detail
                      : phase === 2
                        ? insertion === 'replace'
                          ? '沿时间顺序写入素材，经过的位置取对应素材值。'
                          : '按保存的权重将素材融入原片段，中央权重为 0.7。'
                        : kind === 'peak'
                          ? '极值改变一个时刻，标签覆盖该点及前后各 4 个时刻。'
                          : '选定测点的目标区间标记为 1，其余位置保持为 0。'}
                </p>
              </div>
              {kind === 'length' && (
                <LengthConstruction
                  key={selected.id + ':' + feature}
                  values={base.slice(18, 26)}
                  insertion={insertion}
                />
              )}
              <div className="case-result-action">
                <p>
                  同一片段，{selected.times.length} 个时刻，{data.features.length} 个测点
                </p>
                <button
                  className="inline-link"
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
