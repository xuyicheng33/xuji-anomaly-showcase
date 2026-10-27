import type { ConverterShowcaseData } from './types';

interface ModelBenchmarkProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function ModelBenchmark({ data, onBack }: ModelBenchmarkProps) {
  const models = Object.values(data.models);

  return (
    <div>
      <div className="page-header-row">
        <h1 className="page-headline">模型架构与评测指标</h1>
        <button className="back-btn" onClick={onBack}>
          ← 返回首页
        </button>
      </div>

      {/* 全量评测表 */}
      <div className="layered-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="editorial-table">
          <thead>
            <tr>
              <th>模型</th>
              <th>核心机制</th>
              <th>阈值 τ</th>
              <th>精确率 (P)</th>
              <th>召回率 (R)</th>
              <th>F1-Score</th>
              <th>ROC-AUC</th>
              <th>检出 (TP) / 误报 (FP)</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr key={m.key}>
                <td>
                  <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{m.name}</strong>
                </td>
                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {m.title}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {m.threshold.toFixed(5)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(m.metrics.precision * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(m.metrics.recall * 100).toFixed(2)}%</td>
                <td className="f1-highlight">{(m.metrics.f1 * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(m.metrics.auc * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--morandi-green)', fontWeight: 600 }}>{m.metrics.tp}</span> / <span style={{ color: 'var(--morandi-amber)' }}>{m.metrics.fp}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 技术消融卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="layered-card">
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            自适应掩码对比学习消融
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            引入时序自适应掩码与有界异常对比损失后，重构误差在真实异常区间明显增大，F1 指标由无掩码基线的 48.06% 提升至 89.78%。
          </div>
        </div>

        <div className="layered-card">
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            区间点调整（Point-Adjust）机理
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            电力换流设备故障表现为连续演化的时间段。只要算法在故障区间内首次触发阈值即可联锁继电保护，Point-Adjust 真实刻画了区间故障告警有效性。
          </div>
        </div>
      </div>
    </div>
  );
}
