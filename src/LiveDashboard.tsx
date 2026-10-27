import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface LiveDashboardProps {
  data: ConverterShowcaseData;
}

export function LiveDashboard({ data }: LiveDashboardProps) {
  const [modelKey, setModelKey] = useState<'STAM-AD' | 'SMST-AD' | 'STMem-AD'>('STAM-AD');
  const [featureIdx, setFeatureIdx] = useState<number>(4); // 默认 21B12_R1_IDCH_a 高压侧直流电流
  const [timeStep, setTimeStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const model = data.models[modelKey];
  const scores = model.scores;
  const threshold = model.threshold;
  const labels = data.labels;
  const totalSteps = data.times.length;

  // 预计算前缀统计，实现 O(1) 瞬时查询累计指标
  const prefixStats = useMemo(() => {
    const tps = new Int32Array(totalSteps);
    const fps = new Int32Array(totalSteps);
    const fns = new Int32Array(totalSteps);
    const tns = new Int32Array(totalSteps);

    let curTP = 0, curFP = 0, curFN = 0, curTN = 0;
    for (let i = 0; i < totalSteps; i++) {
      const actual = labels[i] === 1;
      const pred = scores[i] > threshold;
      if (actual && pred) curTP++;
      else if (!actual && pred) curFP++;
      else if (actual && !pred) curFN++;
      else curTN++;

      tps[i] = curTP;
      fps[i] = curFP;
      fns[i] = curFN;
      tns[i] = curTN;
    }
    return { tps, fps, fns, tns };
  }, [modelKey, scores, threshold, labels, totalSteps]);

  // 播放驱动循环
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const stepMs = Math.max(16, 120 / speed);
    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed >= stepMs) {
        setTimeStep(prev => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
        lastTimeRef.current = timestamp;
      }
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, speed, totalSteps]);

  // 当前实时累计指标
  const tp = prefixStats.tps[timeStep];
  const fp = prefixStats.fps[timeStep];
  const fn = prefixStats.fns[timeStep];
  const tn = prefixStats.tns[timeStep];

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // 当前瞬时状态
  const curActual = labels[timeStep] === 1;
  const curScore = scores[timeStep];
  const curPred = curScore > threshold;
  let statusBadge = { type: 'ok', text: '正常态 (TN)', desc: '模型判定正常，实际工况正常' };
  if (curActual && curPred) {
    statusBadge = { type: 'tp', text: '真实报警 (TP)', desc: '成功检出真实异常故障！' };
  } else if (!curActual && curPred) {
    statusBadge = { type: 'fp', text: '虚警误报 (FP)', desc: '模型超限但实际为正常信号' };
  } else if (curActual && !curPred) {
    statusBadge = { type: 'fn', text: '漏检 (FN)', desc: '存在真实故障但得分未达阈值' };
  }

  // 动态视口范围：前后各 120 个时间步，共 240 点
  const windowRadius = 120;
  const winStart = Math.max(0, Math.min(totalSteps - windowRadius * 2, timeStep - windowRadius));
  const winEnd = Math.min(totalSteps, winStart + windowRadius * 2);
  const winLen = winEnd - winStart;

  // 原始输入波形 & 模型重构波形
  const rawSeries = data.testRaw[String(featureIdx)] || [];
  const reconSeries = model.recons[String(featureIdx)] || [];

  const curFeature = data.features.find(f => f.index === featureIdx) || data.features[0];

  // SVG 坐标映射 helper
  const svgWidth = 900;
  const svgHeight = 180;
  const padLeft = 46, padRight = 16, padTop = 16, padBottom = 26;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getX = (idx: number) => padLeft + ((idx - winStart) / Math.max(1, winLen - 1)) * chartW;

  // 通道 1 范围
  const visibleRaw = rawSeries.slice(winStart, winEnd);
  const visibleRecon = reconSeries.slice(winStart, winEnd);
  const minVal1 = 0;
  const maxVal1 = 1;
  const getY1 = (v: number) => padTop + (1 - (v - minVal1) / (maxVal1 - minVal1 || 1)) * chartH;

  // 通道 2 范围 (异常得分)
  const visibleScores = scores.slice(winStart, winEnd);
  const maxScore = Math.max(0.12, ...visibleScores, threshold * 1.25);
  const getY2 = (v: number) => padTop + (1 - v / maxScore) * chartH;

  // 生成通道 1 路径
  let pathRaw = '', pathRecon = '', pathDiffArea = '';
  visibleRaw.forEach((v, i) => {
    const x = getX(winStart + i);
    const yR = getY1(v);
    const yM = getY1(visibleRecon[i] ?? v);
    if (i === 0) {
      pathRaw = `M ${x.toFixed(1)} ${yR.toFixed(1)}`;
      pathRecon = `M ${x.toFixed(1)} ${yM.toFixed(1)}`;
    } else {
      pathRaw += ` L ${x.toFixed(1)} ${yR.toFixed(1)}`;
      pathRecon += ` L ${x.toFixed(1)} ${yM.toFixed(1)}`;
    }
  });

  // 残差闭合面
  if (visibleRaw.length > 0) {
    let forward = '', backward = '';
    visibleRaw.forEach((v, i) => {
      const x = getX(winStart + i);
      const yR = getY1(v);
      const yM = getY1(visibleRecon[i] ?? v);
      if (i === 0) {
        forward = `M ${x.toFixed(1)} ${yR.toFixed(1)}`;
        backward = `L ${x.toFixed(1)} ${yM.toFixed(1)}`;
      } else {
        forward += ` L ${x.toFixed(1)} ${yR.toFixed(1)}`;
        backward = ` L ${x.toFixed(1)} ${yM.toFixed(1)}` + backward;
      }
    });
    pathDiffArea = forward + ' ' + backward + ' Z';
  }

  // 生成通道 2 路径
  let pathScore = '';
  visibleScores.forEach((s, i) => {
    const x = getX(winStart + i);
    const y = getY2(s);
    if (i === 0) pathScore = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    else pathScore += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  // 计算视口内的真实异常条带
  const visibleSegments = data.anomalySegments.filter(
    seg => seg.end >= winStart && seg.start <= winEnd
  );

  return (
    <div className="engine-layout">
      {/* 左侧主图表推演视口 */}
      <div className="engine-main">
        {/* 控制中枢栏 */}
        <div className="engine-control-bar">
          <div className="playback-controls">
            <button
              className={`btn btn-primary ${isPlaying ? 'active' : ''}`}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸ 暂停推演' : '▶ 启动推演'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setIsPlaying(false);
                setTimeStep(0);
              }}
              title="重置到首个测试时刻"
            >
              ↺ 重置
            </button>
            <button
              className="btn"
              onClick={() => {
                const nextSeg = data.anomalySegments.find(s => s.start > timeStep);
                if (nextSeg) {
                  setTimeStep(nextSeg.start);
                } else if (data.anomalySegments.length > 0) {
                  setTimeStep(data.anomalySegments[0].start);
                }
              }}
              title="跳转至下一个真实故障发生时刻"
            >
              ⚡ 下个故障段
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setIsPlaying(false);
                setTimeStep(totalSteps - 1);
              }}
              title="直接呈现全量 2397 步评测结果"
            >
              ⏩ 全程结转
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* 播放倍速切换 */}
            <div className="playback-speed">
              {[0.5, 1, 2, 5, 10].map(s => (
                <button
                  key={s}
                  className={speed === s ? 'active' : ''}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* 模型切换器 */}
            <select
              value={modelKey}
              onChange={e => setModelKey(e.target.value as any)}
              style={{ fontWeight: 600, color: 'var(--accent)' }}
            >
              <option value="STAM-AD">STAM-AD (双分支自适应掩码)</option>
              <option value="SMST-AD">SMST-AD (多尺度时空建模)</option>
              <option value="STMem-AD">STMem-AD (时空模式记忆)</option>
            </select>
          </div>
        </div>

        {/* 时间进度滑块与信息条 */}
        <div className="time-scrubber">
          <div className="scrubber-header">
            <div>
              <span className="text-muted" style={{ marginRight: '8px' }}>时刻时间戳:</span>
              <span className="scrubber-time">{data.times[timeStep]}</span>
            </div>
            <div className="scrubber-step">
              步数: <strong className="text-mono" style={{ color: 'var(--text-primary)' }}>{timeStep}</strong> / {totalSteps - 1} ({((timeStep / (totalSteps - 1)) * 100).toFixed(1)}%)
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={totalSteps - 1}
            value={timeStep}
            onChange={e => setTimeStep(Number(e.target.value))}
            aria-label="时序推进滑动条"
          />
        </div>

        {/* 动态图表通道群 */}
        <div className="chart-container">
          {/* 通道 1: 测点时序波形与重构波形 */}
          <div className="channel-card">
            <div className="channel-header">
              <div className="channel-title">
                <span>测点时序波形通道</span>
                <select
                  value={featureIdx}
                  onChange={e => setFeatureIdx(Number(e.target.value))}
                  style={{ fontSize: '12px', padding: '3px 8px' }}
                >
                  {data.coreFeatures.map(f => (
                    <option key={f.index} value={f.index}>
                      [{f.group}] {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <i className="legend-color-box" style={{ background: '#1C1917' }} />
                  测试输入观测值 x
                </span>
                <span className="legend-item">
                  <i className="legend-color-box" style={{ background: 'var(--accent)' }} />
                  模型重构波形 x̂
                </span>
                <span className="legend-item">
                  <i className="legend-color-box" style={{ background: 'rgba(204, 90, 43, 0.25)' }} />
                  残差区域
                </span>
              </div>
            </div>

            <div className="chart-svg-wrap">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                {/* 标尺网格 */}
                {[0, 0.5, 1].map(v => (
                  <g key={v}>
                    <line
                      x1={padLeft}
                      x2={svgWidth - padRight}
                      y1={getY1(v)}
                      y2={getY1(v)}
                      stroke="var(--border-light)"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={getY1(v) + 4}
                      fontSize="10"
                      fill="var(--text-muted)"
                      textAnchor="end"
                      fontFamily="var(--font-mono)"
                    >
                      {v.toFixed(1)}
                    </text>
                  </g>
                ))}

                {/* 真实异常区间背景填充 */}
                {visibleSegments.map((seg, idx) => {
                  const x1 = Math.max(padLeft, getX(seg.start));
                  const x2 = Math.min(svgWidth - padRight, getX(seg.end));
                  return (
                    <rect
                      key={idx}
                      x={x1}
                      y={padTop}
                      width={Math.max(2, x2 - x1)}
                      height={chartH}
                      fill="rgba(220, 38, 38, 0.08)"
                      stroke="rgba(220, 38, 38, 0.2)"
                      strokeDasharray="2 2"
                    />
                  );
                })}

                {/* 残差填充 */}
                {pathDiffArea && (
                  <path d={pathDiffArea} fill="rgba(204, 90, 43, 0.16)" />
                )}

                {/* 曲线 */}
                {pathRaw && (
                  <path d={pathRaw} fill="none" stroke="#1C1917" strokeWidth="1.8" />
                )}
                {pathRecon && (
                  <path d={pathRecon} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
                )}

                {/* 当前扫描光标 */}
                <line
                  x1={getX(timeStep)}
                  x2={getX(timeStep)}
                  y1={padTop - 4}
                  y2={svgHeight - padBottom + 4}
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <circle
                  cx={getX(timeStep)}
                  cy={getY1(rawSeries[timeStep] ?? 0.5)}
                  r="4"
                  fill="#1C1917"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
                <circle
                  cx={getX(timeStep)}
                  cy={getY1(reconSeries[timeStep] ?? 0.5)}
                  r="4"
                  fill="var(--accent)"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />

                {/* X 轴刻度 */}
                <text
                  x={padLeft}
                  y={svgHeight - 8}
                  fontSize="11"
                  fill="var(--text-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {data.times[winStart]?.slice(5, 16)}
                </text>
                <text
                  x={svgWidth - padRight}
                  y={svgHeight - 8}
                  fontSize="11"
                  fill="var(--text-muted)"
                  fontFamily="var(--font-mono)"
                  textAnchor="end"
                >
                  {data.times[winEnd - 1]?.slice(5, 16)}
                </text>
              </svg>
            </div>
          </div>

          {/* 通道 2: 综合异常得分与自适应阈值线 */}
          <div className="channel-card">
            <div className="channel-header">
              <div className="channel-title">
                <span>综合异常分数与自适应判定通道</span>
                <span className={`channel-status-badge ${statusBadge.type}`}>
                  {statusBadge.text}
                </span>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <i className="legend-color-box" style={{ background: '#2563EB' }} />
                  单点异常得分 s_t
                </span>
                <span className="legend-item">
                  <i className="legend-color-box dashed" />
                  SPOT 自适应阈值 τ ({threshold.toFixed(5)})
                </span>
                <span className="legend-item">
                  <i className="legend-color-box" style={{ background: 'rgba(220, 38, 38, 0.2)' }} />
                  真实异常标注区 (Ground Truth)
                </span>
              </div>
            </div>

            <div className="chart-svg-wrap">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                {/* 阈值虚线 */}
                <line
                  x1={padLeft}
                  x2={svgWidth - padRight}
                  y1={getY2(threshold)}
                  y2={getY2(threshold)}
                  stroke="#DC2626"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
                <text
                  x={svgWidth - padRight - 6}
                  y={getY2(threshold) - 5}
                  fontSize="10"
                  fill="#DC2626"
                  fontWeight="600"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  阈值 τ = {threshold.toFixed(4)}
                </text>

                {/* 真实异常区间背景条带 */}
                {visibleSegments.map((seg, idx) => {
                  const x1 = Math.max(padLeft, getX(seg.start));
                  const x2 = Math.min(svgWidth - padRight, getX(seg.end));
                  return (
                    <rect
                      key={idx}
                      x={x1}
                      y={padTop}
                      width={Math.max(2, x2 - x1)}
                      height={chartH}
                      fill="rgba(220, 38, 38, 0.12)"
                    />
                  );
                })}

                {/* 得分曲线 */}
                {pathScore && (
                  <path d={pathScore} fill="none" stroke="#2563EB" strokeWidth="1.8" />
                )}

                {/* 当前扫描光标 */}
                <line
                  x1={getX(timeStep)}
                  x2={getX(timeStep)}
                  y1={padTop - 4}
                  y2={svgHeight - padBottom + 4}
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <circle
                  cx={getX(timeStep)}
                  cy={getY2(curScore)}
                  r="5"
                  fill={curScore > threshold ? '#DC2626' : '#2563EB'}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />

                {/* Y 轴刻度 */}
                <text
                  x={padLeft - 8}
                  y={getY2(0) + 4}
                  fontSize="10"
                  fill="var(--text-muted)"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  0.00
                </text>
                <text
                  x={padLeft - 8}
                  y={getY2(maxScore) + 4}
                  fontSize="10"
                  fill="var(--text-muted)"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {maxScore.toFixed(2)}
                </text>
              </svg>
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>状态说明: {statusBadge.desc}</span>
              <span>瞬时得分: <strong className="text-mono" style={{ color: curScore > threshold ? '#DC2626' : 'var(--text-primary)' }}>{curScore.toFixed(5)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧实时指标与异常事件侧边栏 */}
      <div className="metrics-sidebar">
        {/* 实时累计指标卡片 */}
        <div className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title">
              <span>动态累加评测指标</span>
            </h2>
            <span className="brand-badge" style={{ color: 'var(--accent)' }}>
              步数 0 ~ {timeStep}
            </span>
          </div>
          <div className="panel-body">
            <div className="metric-grid">
              <div className="metric-box highlight">
                <span className="metric-box-label">实时 F1 指标</span>
                <span className="metric-box-value">{(f1 * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-box">
                <span className="metric-box-label">全序列 AUC</span>
                <span className="metric-box-value">{(model.metrics.auc * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-box">
                <span className="metric-box-label">精确率 Precision</span>
                <span className="metric-box-value">{(precision * 100).toFixed(1)}%</span>
              </div>
              <div className="metric-box">
                <span className="metric-box-label">召回率 Recall</span>
                <span className="metric-box-value">{(recall * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 动态 2x2 混淆矩阵 */}
        <div className="confusion-matrix-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>实时混淆矩阵 (Confusion Matrix)</strong>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>累计 {timeStep + 1} 点</span>
          </div>

          <table className="cm-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}></th>
                <th>模型判为异常</th>
                <th>模型判为正常</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>真实异常</th>
                <td className="cm-cell-tp">
                  <strong>{tp}</strong>
                  <span>检出 (TP)</span>
                </td>
                <td className="cm-cell-fn">
                  <strong>{fn}</strong>
                  <span>漏检 (FN)</span>
                </td>
              </tr>
              <tr>
                <th>真实正常</th>
                <td className="cm-cell-fp">
                  <strong>{fp}</strong>
                  <span>虚警 (FP)</span>
                </td>
                <td className="cm-cell-tn">
                  <strong>{tn}</strong>
                  <span>正确正常 (TN)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 异常事件列表快速跃迁 */}
        <div className="panel-card">
          <div className="panel-header">
            <h2 className="panel-title" style={{ fontSize: '14px' }}>
              <span>真实故障段定位器</span>
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              共 {data.anomalySegments.length} 个事件
            </span>
          </div>
          <div className="panel-body" style={{ padding: '12px' }}>
            <div className="segment-list">
              {data.anomalySegments.map((seg, idx) => {
                const isActive = timeStep >= seg.start && timeStep <= seg.end;
                return (
                  <button
                    key={idx}
                    className={`segment-item-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setTimeStep(seg.start);
                      setIsPlaying(false);
                    }}
                  >
                    <div>
                      <strong>故障段 #{idx + 1}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {seg.startTime.slice(5, 16)} · 持续 {seg.length} 小时
                      </div>
                    </div>
                    <span className="text-mono" style={{ fontSize: '11px' }}>
                      t{seg.start}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
