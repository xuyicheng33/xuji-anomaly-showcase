import { useState } from 'react';
import type { ConverterShowcaseData } from './types';

interface DataOverviewProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function DataOverview({ data, onBack }: DataOverviewProps) {
  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState<number>(4);
  const meta = data.datasetMeta;

  const currentFeature = data.features.find(f => f.index === selectedFeatureIdx) || data.features[0];
  const series = data.testRaw[String(selectedFeatureIdx)] || [];

  // 系统分类统计
  const groups: Record<string, number> = {};
  data.features.forEach(f => {
    groups[f.group] = (groups[f.group] || 0) + 1;
  });

  // SVG 绘制全景时序
  const svgW = 1000;
  const svgH = 260;
  const pL = 50, pR = 20, pT = 20, pB = 30;
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
      {/* 模块头部导航 */}
      <div className="page-header-row">
        <div className="page-header-left">
          <div className="page-kicker">模块 01 · 数据集与测点</div>
          <h1 className="page-headline">换流设备时序数据全景</h1>
          <p className="page-lead">
            数据集采集自 2022 年特高压换流站现场监测系统，采样间隔为 1 小时，包含换流变与换流阀组 125 维全特征。
            前 70%（5,593 点）为无故障正常运行数据用于无监督建模，后 30%（2,397 点）用于检测性能评测。
          </p>
        </div>
        <button className="back-to-overview" onClick={onBack}>
          ← 返回首页目录
        </button>
      </div>

      {/* 测点分类统计卡片 */}
      <div className="clean-card">
        <div className="card-title-row">
          <h2 className="card-title">125 维换流测点系统分类</h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            覆盖一二次回路电量与设备热力学状态
          </span>
        </div>
        <div className="features-grid">
          {Object.entries(groups).map(([groupName, count]) => (
            <div key={groupName} className="feature-summary-card">
              <div className="feature-summary-title">{groupName}</div>
              <div className="feature-summary-count">{count} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>个测点</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* 典型测点连续波形浏览 */}
      <div className="clean-card">
        <div className="card-title-row">
          <div>
            <h2 className="card-title">测试集连续时序波形观察</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              时间跨度：{meta.timeRange} · 共计 2,397 个测试时刻
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="feature-selector" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              选择监测测点:
            </label>
            <select
              id="feature-selector"
              className="ctrl-select"
              value={selectedFeatureIdx}
              onChange={e => setSelectedFeatureIdx(Number(e.target.value))}
            >
              {data.coreFeatures.map(f => (
                <option key={f.index} value={f.index}>
                  [{f.group}] {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="svg-canvas-box" style={{ height: '260px' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
            {/* 网格水平基线 */}
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
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
                  {v.toFixed(2)}
                </text>
              </g>
            ))}

            {/* 真实异常区间浅红底色 */}
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
                  fill="rgba(185, 28, 28, 0.08)"
                />
              );
            })}

            {/* 观测波形曲线 */}
            {pathData && (
              <path d={pathData} fill="none" stroke="#1C1917" strokeWidth="1.6" />
            )}

            {/* X 轴时间刻度 */}
            <text x={pL} y={svgH - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {data.times[0]}
            </text>
            <text x={svgW - pR} y={svgH - 8} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor="end">
              {data.times[data.times.length - 1]}
            </text>
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
          <span>当前显示测点：<strong style={{ color: 'var(--text-main)' }}>{currentFeature.key}</strong>（{currentFeature.label}）</span>
          <span>浅红阴影区域表示测试集中已标记的人工构造异常区间（共 {data.anomalySegments.length} 段）</span>
        </div>
      </div>
    </div>
  );
}
