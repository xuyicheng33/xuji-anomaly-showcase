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

  const curActual = labels[timeStep] === 1;
  const curScore = scores[timeStep];
  const curPred = curScore > threshold;
  let statusBadge = { type: 'normal', text: '正常态 (TN)' };
  if (curActual && curPred) {
    statusBadge = { type: 'tp', text: '真实报警 (TP)' };
  } else if (!curActual && curPred) {
    statusBadge = { type: 'fp', text: '虚警 (FP)' };
  } else if (curActual && !curPred) {
    statusBadge = { type: 'fn', text: '漏检 (FN)' };
  }

  const windowRadius = 120;
  const winStart = Math.max(0, Math.min(totalSteps - windowRadius * 2, timeStep - windowRadius));
  const winEnd = Math.min(totalSteps, winStart + windowRadius * 2);
  const winLen = winEnd - winStart;

  const rawSeries = data.testRaw[String(featureIdx)] || [];
  const reconSeries = model.recons[String(featureIdx)] || [];

  const svgWidth = 960;
  const svgHeight = 170;
  const padLeft = 46, padRight = 20, padTop = 14, padBottom = 24;
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
      <div className="page-header-row">
        <h1 className="page-headline">时序检测回放</h1>
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      {/* 控制栏 */}
      <div className="playback-bar">
        <div className="playback-group">
          <button
            className={`btn-mora ${isPlaying ? 'primary' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button
            className="btn-mora"
            onClick={() => {
              setIsPlaying(false);
              setTimeStep(0);
            }}
          >
            重置
          </button>
          <button
            className="btn-mora"
            onClick={() => {
              const nextSeg = data.anomalySegments.find(s => s.start > timeStep);
              if (nextSeg) setTimeStep(nextSeg.start);
              else if (data.anomalySegments.length > 0) setTimeStep(data.anomalySegments[0].start);
            }}
          >
            下个异常段
          </button>
          <button
            className="btn-mora"
            onClick={() => {
              setIsPlaying(false);
              setTimeStep(totalSteps - 1);
            }}
          >
            序列末尾
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="speed-bar">
            {[0.5, 1, 2, 5, 10].map(s => (
              <button
                key={s}
                className={`speed-opt ${speed === s ? 'active' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <select
            className="select-mora"
            value={modelKey}
            onChange={e => setModelKey(e.target.value as any)}
            style={{ fontWeight: 600, color: 'var(--accent)' }}
          >
            <option value="STAM-AD">STAM-AD</option>
            <option value="SMST-AD">SMST-AD</option>
            <option value="STMem-AD">STMem-AD</option>
          </select>
        </div>
      </div>

      {/* 进度条 */}
      <div className="slider-card">
        <div className="slider-meta">
          <span className="slider-ts">{data.times[timeStep]}</span>
          <span style={{ color: 'var(--text-muted)' }}>
            时刻 {timeStep} / {totalSteps - 1}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={timeStep}
          onChange={e => setTimeStep(Number(e.target.value))}
        />
      </div>

      {/* 通道 1: 测点波形与重构 */}
      <div className="chart-panel">
        <div className="chart-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="chart-panel-title">观测输入与模型重构波形</span>
            <select
              className="select-mora"
              value={featureIdx}
              onChange={e => setFeatureIdx(Number(e.target.value))}
              style={{ fontSize: '12px', padding: '2px 8px' }}
            >
              {data.coreFeatures.map(f => (
                <option key={f.index} value={f.index}>
                  {f.group} · {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="chart-legend">
            <span><i className="legend-point" style={{ background: '#242220' }} />输入值 x</span>
            <span><i className="legend-point" style={{ background: 'var(--accent)' }} />重构值 x̂</span>
          </div>
        </div>

        <div className="canvas-box">
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
                  fill="var(--morandi-red-wash)"
                />
              );
            })}

            {pathDiffArea && <path d={pathDiffArea} fill="var(--accent-wash)" />}
            {pathRaw && <path d={pathRaw} fill="none" stroke="#242220" strokeWidth="1.5" />}
            {pathRecon && <path d={pathRecon} fill="none" stroke="var(--accent)" strokeWidth="1.6" />}

            <line
              x1={getX(timeStep)}
              x2={getX(timeStep)}
              y1={padTop - 4}
              y2={svgHeight - padBottom + 4}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <circle
              cx={getX(timeStep)}
              cy={getY1(rawSeries[timeStep] ?? 0.5)}
              r="3.5"
              fill="#242220"
            />
            <circle
              cx={getX(timeStep)}
              cy={getY1(reconSeries[timeStep] ?? 0.5)}
              r="3.5"
              fill="var(--accent)"
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

      {/* 通道 2: 异常分数与阈值 */}
      <div className="chart-panel">
        <div className="chart-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="chart-panel-title">单点综合异常得分与阈值</span>
            <span className={`status-badge ${statusBadge.type}`}>
              {statusBadge.text}
            </span>
          </div>
          <div className="chart-legend">
            <span><i className="legend-point" style={{ background: 'var(--morandi-blue)' }} />异常得分</span>
            <span><i className="legend-point" style={{ background: 'var(--morandi-red)' }} />阈值 τ ({threshold.toFixed(4)})</span>
          </div>
        </div>

        <div className="canvas-box">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
            <line
              x1={padLeft}
              x2={svgWidth - padRight}
              y1={getY2(threshold)}
              y2={getY2(threshold)}
              stroke="var(--morandi-red)"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />
            <text
              x={svgWidth - padRight - 6}
              y={getY2(threshold) - 5}
              fontSize="10"
              fill="var(--morandi-red)"
              fontFamily="var(--font-mono)"
              textAnchor="end"
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
                  fill="var(--morandi-red-wash)"
                />
              );
            })}

            {pathScore && <path d={pathScore} fill="none" stroke="var(--morandi-blue)" strokeWidth="1.6" />}

            <line
              x1={getX(timeStep)}
              x2={getX(timeStep)}
              y1={padTop - 4}
              y2={svgHeight - padBottom + 4}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <circle
              cx={getX(timeStep)}
              cy={getY2(curScore)}
              r="4"
              fill={curScore > threshold ? 'var(--morandi-red)' : 'var(--morandi-blue)'}
            />

            <text x={padLeft - 8} y={getY2(0) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
              0.00
            </text>
            <text x={padLeft - 8} y={getY2(maxScore) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">
              {maxScore.toFixed(2)}
            </text>
          </svg>
        </div>
      </div>

      {/* 底部指标与混淆矩阵 */}
      <div className="bottom-metrics-grid">
        <div className="kpi-row">
          <div className="kpi-block">
            <div className="kpi-label">F1-Score</div>
            <div className="kpi-value accent">{(f1 * 100).toFixed(2)}%</div>
          </div>
          <div className="kpi-block">
            <div className="kpi-label">Precision</div>
            <div className="kpi-value">{(precision * 100).toFixed(2)}%</div>
          </div>
          <div className="kpi-block">
            <div className="kpi-label">Recall</div>
            <div className="kpi-value">{(recall * 100).toFixed(2)}%</div>
          </div>
          <div className="kpi-block">
            <div className="kpi-label">AUC</div>
            <div className="kpi-value">{(model.metrics.auc * 100).toFixed(2)}%</div>
          </div>
        </div>

        <div className="matrix-card">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>混淆矩阵统计</div>
          <table className="matrix-table">
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
                <td style={{ background: 'var(--morandi-red-wash)' }}>
                  <strong style={{ color: 'var(--morandi-red)' }}>{tp}</strong>
                  <span>TP</span>
                </td>
                <td style={{ background: 'var(--bg-subtle)' }}>
                  <strong>{fn}</strong>
                  <span>FN</span>
                </td>
              </tr>
              <tr>
                <th>真实正常</th>
                <td style={{ background: 'var(--morandi-amber-wash)' }}>
                  <strong style={{ color: 'var(--morandi-amber)' }}>{fp}</strong>
                  <span>FP</span>
                </td>
                <td style={{ background: 'var(--morandi-green-wash)' }}>
                  <strong style={{ color: 'var(--morandi-green)' }}>{tn}</strong>
                  <span>TN</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
