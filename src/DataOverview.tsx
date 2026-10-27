import { useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface DataOverviewProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function DataOverview({ data, onBack }: DataOverviewProps) {
  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState<number>(4);

  const series = data.testRaw[String(selectedFeatureIdx)] || [];
  const groups: Record<string, number> = {};
  data.features.forEach(f => {
    groups[f.group] = (groups[f.group] || 0) + 1;
  });

  const svgW = 1000;
  const svgH = 260;
  const pL = 46, pR = 20, pT = 20, pB = 30;
  const cW = svgW - pL - pR;
  const cH = svgH - pT - pB;

  let pathData = '';
  if (series.length > 0) {
    series.forEach((val, i) => {
      const x = pL + (i / (series.length - 1)) * cW;
      const y = pT + (1 - val) * cH;
      if (i === 0) pathData = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      else pathData += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
  }

  return (
    <div>
      <div className="page-header-row">
        <h1 className="page-headline">换流设备测点数据</h1>
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      {/* 测点系统分布卡片 */}
      <div className="layered-card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {Object.entries(groups).map(([groupName, count]) => (
            <div key={groupName} style={{ background: 'var(--bg-subtle)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{groupName}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 600, color: 'var(--text-main)' }}>
                {count} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>通道</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 连续时序波形卡片 */}
      <div className="layered-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
            2,397 测试时刻连续波形
          </span>
          <select
            className="select-mora"
            value={selectedFeatureIdx}
            onChange={e => setSelectedFeatureIdx(Number(e.target.value))}
          >
            {data.coreFeatures.map(f => (
              <option key={f.index} value={f.index}>
                {f.group} · {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="canvas-box" style={{ height: '240px' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
            {[0, 0.5, 1].map(v => (
              <g key={v}>
                <line
                  x1={pL}
                  x2={svgW - pR}
                  y1={pT + (1 - v) * cH}
                  y2={pT + (1 - v) * cH}
                  stroke="var(--border-light)"
                  strokeWidth="1"
                />
                <text
                  x={pL - 8}
                  y={pT + (1 - v) * cH + 4}
                  fontSize="10"
                  fill="var(--text-muted)"
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                >
                  {v.toFixed(1)}
                </text>
              </g>
            ))}

            {data.anomalySegments.map((seg, idx) => {
              const x1 = pL + (seg.start / (series.length - 1)) * cW;
              const x2 = pL + (seg.end / (series.length - 1)) * cW;
              return (
                <rect
                  key={idx}
                  x={x1}
                  y={pT}
                  width={Math.max(2, x2 - x1)}
                  height={cH}
                  fill="var(--morandi-red-wash)"
                />
              );
            })}

            {pathData && (
              <path d={pathData} fill="none" stroke="#242220" strokeWidth="1.5" />
            )}

            <text x={pL} y={svgH - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {data.times[0]}
            </text>
            <text x={svgW - pR} y={svgH - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor="end">
              {data.times[data.times.length - 1]}
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
