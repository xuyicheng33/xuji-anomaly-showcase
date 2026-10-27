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
  const svgH = 200;
  const pL = 40, pR = 20, pT = 20, pB = 26;
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
      <div className="page-header-row">
        <h1 className="page-headline">异常形态构造</h1>
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px' }}>
        {/* 左侧 8 组场景列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {data.anomalyStudio.map((s, idx) => {
            const isActive = s.id === selectedId;
            return (
              <button
                key={s.id}
                style={{
                  padding: '12px 14px',
                  background: isActive ? 'var(--accent-subtle)' : 'var(--bg-card)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-light)'}`,
                  borderRadius: '6px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  setSelectedId(s.id);
                  setIntensity(1.0);
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--text-main)', marginBottom: '2px' }}>
                  {String(idx + 1).padStart(2, '0')}. {s.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {s.injectionMode.slice(0, 4)}
                </div>
              </button>
            );
          })}
        </div>

        {/* 右侧展示卡片 */}
        <div className="layered-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>
                {current.name}
              </h2>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {current.physicsMeaning}
              </div>
            </div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)', background: 'var(--bg-subtle)', padding: '4px 10px', borderRadius: '4px' }}>
              {current.formula}
            </code>
          </div>

          {/* 波形画布 */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <span><i className="legend-point" style={{ background: '#78716C' }} />原始序列 x</span>
              <span><i className="legend-point" style={{ background: 'var(--accent)' }} />变异序列 x̃</span>
            </div>

            <div className="canvas-box" style={{ height: '200px' }}>
              <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
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
                        fill="var(--morandi-red-wash)"
                      />
                    );
                  }
                  return null;
                })}

                <path d={pathClean} fill="none" stroke="#78716C" strokeWidth="1.5" />
                <path d={pathAnom} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
              </svg>
            </div>

            {/* 标签掩码条带 */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', height: '6px', width: '100%', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                {current.labels.map((l, i) => (
                  <i
                    key={i}
                    style={{
                      flex: 1,
                      backgroundColor: l === 1 ? 'var(--morandi-red)' : 'var(--bg-subtle)'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 扰动强度滑块 */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>扰动强度调节:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                {intensity.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.05}
              value={intensity}
              onChange={e => setIntensity(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
