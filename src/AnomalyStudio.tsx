import { useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface AnomalyStudioProps {
  data: ConverterShowcaseData;
}

export function AnomalyStudio({ data }: AnomalyStudioProps) {
  const [selectedId, setSelectedId] = useState<string>(data.anomalyStudio[0]?.id || 'soft_train');
  const [intensity, setIntensity] = useState<number>(1.0); // 扰动强度系数滑块

  const current = data.anomalyStudio.find(s => s.id === selectedId) || data.anomalyStudio[0];

  // 动态根据强度调节波形
  const dynamicAnomWave = current.anomWave.map((val, i) => {
    const clean = current.cleanWave[i];
    const diff = val - clean;
    return Number((clean + diff * intensity).toFixed(4));
  });

  // SVG 绘图
  const svgW = 760;
  const svgH = 200;
  const pL = 40, pR = 20, pT = 20, pB = 30;
  const cW = svgW - pL - pR;
  const cH = svgH - pT - pB;

  const minV = Math.min(...current.cleanWave, ...dynamicAnomWave) - 0.05;
  const maxV = Math.max(...current.cleanWave, ...dynamicAnomWave) + 0.05;
  const rangeV = maxV - minV || 1;

  const getX = (i: number) => pL + (i / (current.cleanWave.length - 1)) * cW;
  const getY = (v: number) => pT + (1 - (v - minV) / rangeV) * cH;

  let pathClean = '', pathAnom = '';
  current.cleanWave.forEach((v, i) => {
    const x = getX(i);
    const yC = getY(v);
    const yA = getY(dynamicAnomWave[i]);
    if (i === 0) {
      pathClean = `M ${x.toFixed(1)} ${yC.toFixed(1)}`;
      pathAnom = `M ${x.toFixed(1)} ${yA.toFixed(1)}`;
    } else {
      pathClean += ` L ${x.toFixed(1)} ${yC.toFixed(1)}`;
      pathAnom += ` L ${x.toFixed(1)} ${yA.toFixed(1)}`;
    }
  });

  return (
    <div className="studio-layout">
      {/* 左侧 8 种异常组合导航 */}
      <div className="studio-scenario-nav">
        <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          8 类标准异常构造组合 (4类形态 × 2种时机)
        </div>

        {data.anomalyStudio.map(s => {
          const isActive = s.id === selectedId;
          return (
            <button
              key={s.id}
              className={`scenario-card-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSelectedId(s.id);
                setIntensity(1.0);
              }}
            >
              <div className="scenario-card-title">{s.name}</div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <span className="scenario-card-badge">{s.anomalyType}</span>
                <span className="scenario-card-badge">{s.injectionMode.slice(0, 4)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 右侧工坊详情与交互仿真画布 */}
      <div className="studio-detail-panel">
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{current.name}</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {current.injectionMode} · 针对特高压换流设备工况仿真
              </div>
            </div>
            <span className="brand-badge" style={{ color: 'var(--accent)' }}>
              {current.anomalyType}
            </span>
          </div>

          <div className="panel-body">
            {/* 原理与设备故障映射 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>算法注入机理</strong>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{current.description}</p>
              </div>
              <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>特高压换流设备物理映射</strong>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{current.physicsMeaning}</p>
              </div>
            </div>

            {/* 数学公式 */}
            <div className="formula-card">
              <span>生成变换公式:</span>
              <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{current.formula}</strong>
            </div>

            {/* 波形对比图 */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  时序波形对比与异常标签掩码 (片段 48 个时刻)
                </span>
                <div className="chart-legend">
                  <span className="legend-item">
                    <i className="legend-color-box" style={{ background: '#78716C' }} />
                    原始正常波形 x
                  </span>
                  <span className="legend-item">
                    <i className="legend-color-box" style={{ background: 'var(--accent)' }} />
                    注入后变异波形 x̃
                  </span>
                  <span className="legend-item">
                    <i className="legend-color-box" style={{ background: '#DC2626' }} />
                    异常标签掩码 (1 = 异常)
                  </span>
                </div>
              </div>

              <div className="chart-svg-wrap" style={{ height: '200px' }}>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
                  {/* 背景虚线 */}
                  {[minV, (minV + maxV) / 2, maxV].map((v, idx) => (
                    <line
                      key={idx}
                      x1={pL}
                      x2={svgW - pR}
                      y1={getY(v)}
                      y2={getY(v)}
                      stroke="var(--border-light)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* 异常区域高亮底色 */}
                  {current.labels.map((lbl, i) => {
                    if (lbl === 1) {
                      const x1 = getX(Math.max(0, i - 0.5));
                      const x2 = getX(Math.min(current.labels.length - 1, i + 0.5));
                      return (
                        <rect
                          key={i}
                          x={x1}
                          y={pT}
                          width={Math.max(2, x2 - x1)}
                          height={cH}
                          fill="rgba(220, 38, 38, 0.08)"
                        />
                      );
                    }
                    return null;
                  })}

                  {/* 曲线 */}
                  <path d={pathClean} fill="none" stroke="#78716C" strokeWidth="1.8" />
                  <path d={pathAnom} fill="none" stroke="var(--accent)" strokeWidth="2.2" />

                  {/* 标签刻度 */}
                  <text x={pL} y={svgH - 8} fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                    t0 (起始点)
                  </text>
                  <text x={svgW - pR} y={svgH - 8} fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor="end">
                    t47 (片段末)
                  </text>
                </svg>
              </div>

              {/* 标签条状掩码预览 */}
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>对应的窗口掩码张量 Y ∈ &#123;0, 1&#125;</span>
                  <span>{current.labels.filter(x => x === 1).length} 点标记为故障</span>
                </div>
                <div className="mask-strip-preview">
                  {current.labels.map((l, i) => (
                    <i key={i} className={l === 1 ? 'anom' : ''} title={`t${i}: ${l === 1 ? '异常 (1)' : '正常 (0)'}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* 互动强度滑块 */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="intensity-slider" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  交互式扰动强度系数调节 (Simulation Intensity):
                </label>
                <span className="text-mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                  {intensity.toFixed(2)}x
                </span>
              </div>
              <input
                id="intensity-slider"
                type="range"
                min={0.2}
                max={2.5}
                step={0.05}
                value={intensity}
                onChange={e => setIntensity(Number(e.target.value))}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                拖拽滑块可实时查看算法在不同扰动烈度下对波形的侵染程度，演示特高压现场不同严重级别的故障表现。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
