import { useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface AnomalyStudioProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function AnomalyStudio({ data, onBack }: AnomalyStudioProps) {
  const [selectedId, setSelectedId] = useState<string>(data.anomalyStudio[0]?.id || 'soft_train');
  const [intensity, setIntensity] = useState<number>(1.0);

  const current = data.anomalyStudio.find(s => s.id === selectedId) || data.anomalyStudio[0];

  const dynamicAnomWave = current.anomWave.map((val, i) => {
    const clean = current.cleanWave[i];
    const diff = val - clean;
    return Number((clean + diff * intensity).toFixed(4));
  });

  const svgW = 760;
  const svgH = 210;
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
    <div>
      {/* 头部标题与返回 */}
      <div className="page-header-row">
        <div className="page-header-left">
          <div className="page-kicker">模块 02 · 样本生成机制</div>
          <h1 className="page-headline">异常样本构造方法与机理</h1>
          <p className="page-lead">
            针对换流站历史故障样本匮乏的局限，通过在不重叠时序分块内应用软替换、均匀替换、峰值噪声与长度调整四类变换，
            分别在训练阶段（动态自监督增强）与测试阶段（固定基准注入）建立 8 组可复现的评测场景。
          </p>
        </div>
        <button className="back-to-overview" onClick={onBack}>
          ← 返回首页目录
        </button>
      </div>

      <div className="studio-container">
        {/* 左侧 8 组场景列表 */}
        <div className="scenario-list">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.04em' }}>
            8 组构造场景 (4类形态 × 2类时机)
          </div>
          {data.anomalyStudio.map((s, idx) => {
            const isActive = s.id === selectedId;
            return (
              <button
                key={s.id}
                className={`scenario-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(s.id);
                  setIntensity(1.0);
                }}
              >
                <div className="scenario-nav-title">
                  {String(idx + 1).padStart(2, '0')}. {s.name}
                </div>
                <div className="scenario-nav-meta">
                  {s.anomalyType} · {s.injectionMode.slice(0, 4)}
                </div>
              </button>
            );
          })}
        </div>

        {/* 右侧波形与机理详情 */}
        <div>
          <div className="clean-card" style={{ marginBottom: '20px' }}>
            <div className="card-title-row">
              <div>
                <h2 className="card-title">{current.name}</h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {current.injectionMode} · 针对特高压换流设备工况仿真
                </div>
              </div>
              <span className="brand-tag">{current.anomalyType}</span>
            </div>

            {/* 机理阐述 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: 'var(--bg-subtle)', padding: '14px 16px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  算法扰动机理
                </strong>
                <p style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6' }}>
                  {current.description}
                </p>
              </div>
              <div style={{ background: 'var(--bg-subtle)', padding: '14px 16px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                <strong style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  电力设备物理映射
                </strong>
                <p style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: '1.6' }}>
                  {current.physicsMeaning}
                </p>
              </div>
            </div>

            {/* 数学公式 */}
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>变换公式:</span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent)', fontWeight: 600 }}>
                {current.formula}
              </code>
            </div>

            {/* 波形对比图 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                  时序波形对比 (48 个采样时刻片段)
                </span>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span><i className="legend-dot" style={{ background: '#78716C' }} />原始观测序列 x</span>
                  <span><i className="legend-dot" style={{ background: 'var(--accent)' }} />注入后变异序列 x̃</span>
                  <span><i className="legend-dot" style={{ background: 'var(--state-alert)' }} />异常标签掩码 (Y=1)</span>
                </div>
              </div>

              <div className="svg-canvas-box" style={{ height: '210px' }}>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
                  {/* 基准网格 */}
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

                  {/* 异常区域浅红底色 */}
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
                          fill="rgba(185, 28, 28, 0.08)"
                        />
                      );
                    }
                    return null;
                  })}

                  <path d={pathClean} fill="none" stroke="#78716C" strokeWidth="1.6" />
                  <path d={pathAnom} fill="none" stroke="var(--accent)" strokeWidth="2" />

                  <text x={pL} y={svgH - 8} fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                    t0
                  </text>
                  <text x={svgW - pR} y={svgH - 8} fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor="end">
                    t47
                  </text>
                </svg>
              </div>

              {/* 掩码张量预览条 */}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <span>时间步标签掩码 Y ∈ &#123;0, 1&#125;</span>
                  <span>共 {current.labels.filter(x => x === 1).length} 个时刻标定为故障状态</span>
                </div>
                <div style={{ display: 'flex', height: '10px', width: '100%', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                  {current.labels.map((l, i) => (
                    <i
                      key={i}
                      style={{
                        flex: 1,
                        backgroundColor: l === 1 ? 'var(--state-alert)' : 'var(--bg-subtle)'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 扰动强度滑块 */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="intensity-input" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>
                  扰动强度调节系数:
                </label>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                  {intensity.toFixed(2)}x
                </span>
              </div>
              <input
                id="intensity-input"
                type="range"
                min={0.2}
                max={2.5}
                step={0.05}
                value={intensity}
                onChange={e => setIntensity(Number(e.target.value))}
              />
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                拖动滑块可微调扰动幅度，观察算法在不同烈度故障冲击下的时序畸变特征。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
