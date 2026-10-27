import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface LiveDashboardProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function LiveDashboard({ data, onBack }: LiveDashboardProps) {
  const [modelKey, setModelKey] = useState<'STAM-AD' | 'SMST-AD' | 'STMem-AD'>('STAM-AD');
  const [featureIdx, setFeatureIdx] = useState<number>(4);
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

  // 预计算前缀和，O(1) 瞬时查询实时指标
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

    const stepMs = Math.max(16, 110 / speed);
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

  const tp = prefixStats.tps[timeStep];
  const fp = prefixStats.fps[timeStep];
  const fn = prefixStats.fns[timeStep];
  const tn = prefixStats.tns[timeStep];

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // 判定状态
  const curActual = labels[timeStep] === 1;
  const curScore = scores[timeStep];
  const curPred = curScore > threshold;
  let statusBadge = { type: 'normal', text: '正常态 (TN)', desc: '模型判定正常，工况与标签一致' };
  if (curActual && curPred) {
    statusBadge = { type: 'alert-tp', text: '真实报警 (TP)', desc: '成功捕捉真实异常工况' };
  } else if (!curActual && curPred) {
    statusBadge = { type: 'alert-fp', text: '虚警 (FP)', desc: '模型超阈值判定，实际为正常工况' };
  } else if (curActual && !curPred) {
    statusBadge = { type: 'alert-fn', text: '漏检 (FN)', desc: '存在异常，但得分未达到自适应阈值' };
  }

  // 滑动窗口：前后各 120 个时间步
  const windowRadius = 120;
  const winStart = Math.max(0, Math.min(totalSteps - windowRadius * 2, timeStep - windowRadius));
  const winEnd = Math.min(totalSteps, winStart + windowRadius * 2);
  const winLen = winEnd - winStart;

  const rawSeries = data.testRaw[String(featureIdx)] || [];
  const reconSeries = model.recons[String(featureIdx)] || [];
  const curFeature = data.features.find(f => f.index === featureIdx) || data.features[0];

  const svgWidth = 960;
  const svgHeight = 180;
  const padLeft = 48, padRight = 20, padTop = 16, padBottom = 26;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getX = (idx: number) => padLeft + ((idx - winStart) / Math.max(1, winLen - 1)) * chartW;

  const visibleRaw = rawSeries.slice(winStart, winEnd);
  const visibleRecon = reconSeries.slice(winStart, winEnd);
  const getY1 = (v: number) => padTop + (1 - v) * chartH;

  const visibleScores = scores.slice(winStart, winEnd);
  const maxScore = Math.max(0.12, ...visibleScores, threshold * 1.25);
  const getY2 = (v: number) => padTop + (1 - v / maxScore) * chartH;

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

  let pathScore = '';
  visibleScores.forEach((s, i) => {
    const x = getX(winStart + i);
    const y = getY2(s);
    if (i === 0) pathScore = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    else pathScore += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const visibleSegments = data.anomalySegments.filter(
    seg => seg.end >= winStart && seg.start <= winEnd
  );

  return (
    <div>
      {/* 头部标题与返回 */}
      <div className="page-header-row">
        <div className="page-header-left">
          <div className="page-kicker">模块 04 · 动态推演</div>
          <h1 className="page-headline">检测过程时序回放与验证</h1>
          <p className="page-lead">
            模拟真实运行环境，逐时刻推进时间序列输入。系统对比真实观测与模型重构波形，计算多变量综合异常得分，
            依据 SPOT 极值分布自适应阈值触发告警，并在右侧动态累加混淆矩阵与评测指标。
          </p>
        </div>
        <button className="back-to-overview" onClick={onBack}>
          ← 返回首页目录
        </button>
      </div>

      {/* 播放控制栏 */}
      <div className="playback-bar">
        <div className="playback-buttons">
          <button
            className={`ctrl-btn ${isPlaying ? 'primary' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '暂停回放' : '开始回放'}
          </button>
          <button
            className="ctrl-btn"
            onClick={() => {
              setIsPlaying(false);
              setTimeStep(0);
            }}
          >
            重置起点
          </button>
          <button
            className="ctrl-btn"
            onClick={() => {
              const nextSeg = data.anomalySegments.find(s => s.start > timeStep);
              if (nextSeg) setTimeStep(nextSeg.start);
              else if (data.anomalySegments.length > 0) setTimeStep(data.anomalySegments[0].start);
            }}
          >
            定位至下个故障段
          </button>
          <button
            className="ctrl-btn"
            onClick={() => {
              setIsPlaying(false);
              setTimeStep(totalSteps - 1);
            }}
          >
            跳转至序列末尾
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 回放倍速 */}
          <div className="speed-selector">
            {[0.5, 1, 2, 5, 10].map(s => (
              <button
                key={s}
                className={`speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* 模型选择 */}
          <select
            className="ctrl-select"
            value={modelKey}
            onChange={e => setModelKey(e.target.value as any)}
            style={{ fontWeight: 600, color: 'var(--accent)' }}
          >
            <option value="STAM-AD">STAM-AD (自适应掩码双分支)</option>
            <option value="SMST-AD">SMST-AD (多尺度时空关联)</option>
            <option value="STMem-AD">STMem-AD (时空模式记忆)</option>
          </select>
        </div>
      </div>

      {/* 时间滑动进度条 */}
      <div className="progress-card">
        <div className="progress-header">
          <div>
            <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>时刻时间戳:</span>
            <span className="progress-time">{data.times[timeStep]}</span>
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            步数: <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{timeStep}</strong> / {totalSteps - 1} ({((timeStep / (totalSteps - 1)) * 100).toFixed(1)}%)
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

      {/* 通道 1: 时序波形与重构 */}
      <div className="waveform-section">
        <div className="waveform-header">
          <div className="waveform-title-group">
            <span className="waveform-title">测点输入波形与模型重构通道</span>
            <select
              className="ctrl-select"
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
          <div className="waveform-legend">
            <span><i className="legend-dot" style={{ background: '#1C1917' }} />真实输入观测值 x</span>
            <span><i className="legend-dot" style={{ background: 'var(--accent)' }} />模型重构波形 x̂</span>
            <span><i className="legend-dot" style={{ background: 'rgba(180, 83, 9, 0.25)' }} />重构残差阴影</span>
          </div>
        </div>

        <div className="svg-canvas-box">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
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
                  fill="rgba(185, 28, 28, 0.08)"
                />
              );
            })}

            {pathDiffArea && <path d={pathDiffArea} fill="rgba(180, 83, 9, 0.15)" />}
            {pathRaw && <path d={pathRaw} fill="none" stroke="#1C1917" strokeWidth="1.6" />}
            {pathRecon && <path d={pathRecon} fill="none" stroke="var(--accent)" strokeWidth="1.8" />}

            {/* 当前时刻扫描线 */}
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

            <text x={padLeft} y={svgHeight - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {data.times[winStart]?.slice(5, 16)}
            </text>
            <text x={svgWidth - padRight} y={svgHeight - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor="end">
              {data.times[winEnd - 1]?.slice(5, 16)}
            </text>
          </svg>
        </div>
      </div>

      {/* 通道 2: 综合异常得分与阈值判定 */}
      <div className="waveform-section">
        <div className="waveform-header">
          <div className="waveform-title-group">
            <span className="waveform-title">多测点综合异常得分与自适应阈值</span>
            <span className={`status-pill ${statusBadge.type}`}>
              {statusBadge.text}
            </span>
          </div>
          <div className="waveform-legend">
            <span><i className="legend-dot" style={{ background: '#2563EB' }} />单点异常分数 s_t</span>
            <span><i className="legend-dot" style={{ background: '#B91C1C' }} />SPOT 自适应阈值 τ ({threshold.toFixed(5)})</span>
            <span><i className="legend-dot" style={{ background: 'rgba(185, 28, 28, 0.15)' }} />真实异常区间</span>
          </div>
        </div>

        <div className="svg-canvas-box">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
            {/* 自适应阈值线 */}
            <line
              x1={padLeft}
              x2={svgWidth - padRight}
              y1={getY2(threshold)}
              y2={getY2(threshold)}
              stroke="#B91C1C"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={svgWidth - padRight - 6}
              y={getY2(threshold) - 5}
              fontSize="10"
              fill="#B91C1C"
              fontWeight="600"
              textAnchor="end"
              fontFamily="var(--font-mono)"
            >
              τ = {threshold.toFixed(4)}
            </text>

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
                  fill="rgba(185, 28, 28, 0.12)"
                />
              );
            })}

            {pathScore && <path d={pathScore} fill="none" stroke="#2563EB" strokeWidth="1.8" />}

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
              r="4.5"
              fill={curScore > threshold ? '#B91C1C' : '#2563EB'}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />

            <text x={padLeft - 8} y={getY2(0) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
              0.00
            </text>
            <text x={padLeft - 8} y={getY2(maxScore) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
              {maxScore.toFixed(2)}
            </text>
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          <span>状态判别：{statusBadge.desc}</span>
          <span>当前时刻综合重构误差：<strong style={{ fontFamily: 'var(--font-mono)', color: curScore > threshold ? 'var(--state-alert)' : 'var(--text-main)' }}>{curScore.toFixed(5)}</strong></span>
        </div>
      </div>

      {/* 实时统计与混淆矩阵 */}
      <div className="playback-stats-grid">
        <div className="stats-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>实时累加评测指标</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>已推进至第 {timeStep + 1} 时刻</span>
          </div>
          <div className="stats-row">
            <div className="stat-cell highlight">
              <div className="stat-cell-label">综合 F1 指标</div>
              <div className="stat-cell-value">{(f1 * 100).toFixed(2)}%</div>
            </div>
            <div className="stat-cell">
              <div className="stat-cell-label">精确率 Precision</div>
              <div className="stat-cell-value">{(precision * 100).toFixed(2)}%</div>
            </div>
            <div className="stat-cell">
              <div className="stat-cell-label">召回率 Recall</div>
              <div className="stat-cell-value">{(recall * 100).toFixed(2)}%</div>
            </div>
            <div className="stat-cell">
              <div className="stat-cell-label">全序列 AUC</div>
              <div className="stat-cell-value">{(model.metrics.auc * 100).toFixed(2)}%</div>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>混淆矩阵 (Confusion Matrix)</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>当前步累计</span>
          </div>

          <table className="cm-clean-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}></th>
                <th>判定异常</th>
                <th>判定正常</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>真实异常</th>
                <td style={{ backgroundColor: 'var(--state-alert-bg)' }}>
                  <strong style={{ color: 'var(--state-alert)' }}>{tp}</strong>
                  <span>检出 (TP)</span>
                </td>
                <td style={{ backgroundColor: '#F3F4F6' }}>
                  <strong>{fn}</strong>
                  <span>漏检 (FN)</span>
                </td>
              </tr>
              <tr>
                <th>真实正常</th>
                <td style={{ backgroundColor: 'var(--state-warn-bg)' }}>
                  <strong style={{ color: 'var(--state-warn)' }}>{fp}</strong>
                  <span>虚警 (FP)</span>
                </td>
                <td style={{ backgroundColor: 'var(--state-normal-bg)' }}>
                  <strong style={{ color: 'var(--state-normal)' }}>{tn}</strong>
                  <span>正确正常 (TN)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
