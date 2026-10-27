import type { ConverterShowcaseData } from './types';

interface ModelBenchmarkProps {
  data: ConverterShowcaseData;
  onBack: () => void;
}

export function ModelBenchmark({ data, onBack }: ModelBenchmarkProps) {
  const models = Object.values(data.models);

  return (
    <div>
      {/* 头部标题与返回 */}
      <div className="page-header-row">
        <div className="page-header-left">
          <div className="page-kicker">模块 03 · 算法与评测</div>
          <h1 className="page-headline">模型架构演进与实验指标</h1>
          <p className="page-lead">
            针对换流站复杂多变量工况，构建并对比了三种异常检测网络架构。在 2,397 个连续测试步上完成全量推演，
            评测各模型在真实设备注入异常（490 个异常时刻，占比 20.44%）下的检测性能与抗误报能力。
          </p>
        </div>
        <button className="back-to-overview" onClick={onBack}>
          ← 返回首页目录
        </button>
      </div>

      {/* 全量评测对比表 */}
      <div className="clean-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)' }}>
          <h2 className="card-title">换流设备测试集全量评测指标</h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            测试集规模：2,397 时刻 · 125 维全测点 · 真实异常标签数：490
          </div>
        </div>

        <table className="table-editorial">
          <thead>
            <tr>
              <th>模型架构</th>
              <th>核心机制与损失设计</th>
              <th>判定阈值 τ</th>
              <th>精确率 (P)</th>
              <th>召回率 (R)</th>
              <th>F1-Score (PA)</th>
              <th>ROC-AUC</th>
              <th>检出 (TP) / 误报 (FP)</th>
            </tr>
          </thead>
          <tbody>
            {models.map(m => (
              <tr key={m.key}>
                <td>
                  <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{m.name}</strong>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.title}</div>
                </td>
                <td style={{ maxWidth: '300px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {m.key === 'STAM-AD' && '全局与局部因果 TCN 双分支，结合自适应时间掩码与有界异常对比损失'}
                  {m.key === 'SMST-AD' && '多尺度时间感受野分支配合多变量空间拓扑图，捕获电磁与温度物理强耦合'}
                  {m.key === 'STMem-AD' && '引入双记忆矩阵存储正常模式原型，利用记忆受限解码防范异常过拟合'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  {m.threshold.toFixed(5)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(m.metrics.precision * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(m.metrics.recall * 100).toFixed(2)}%</td>
                <td className="val-f1-best">{(m.metrics.f1 * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{(m.metrics.auc * 100).toFixed(2)}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--state-normal)', fontWeight: 600 }}>{m.metrics.tp}</span> / <span style={{ color: 'var(--state-warn)' }}>{m.metrics.fp}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 技术消融与工程分析 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
        <div className="clean-card">
          <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '12px' }}>
            模型演进与消融结论
          </h3>
          <div style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-main)' }}>基线模型缺陷：</strong> 传统无监督重构网络缺乏主动异常约束，易将平缓演化的异常时序一并平滑重建，导致检出灵敏度不足。
            </p>
            <p style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--accent)' }}>自适应掩码改进（STAM-AD）：</strong>
              引入动态遮蔽与有界对比损失后，迫使模型利用健康上下文强行重建被遮蔽区域，促使重构误差在真实异常区段显著拉大，F1 指标收敛至 <strong>89.78%</strong>。
            </p>
            <p>
              <strong style={{ color: 'var(--text-main)' }}>多尺度空间图增强（SMST-AD）：</strong>
              换流站各测点（如换流阀直流电压与网侧交流电压、顶层油温与绕组温度）具有明确的物理约束图拓扑。通过跨尺度关联建模，F1 达到最优的 <strong>90.61%</strong>，误报数（FP）从 49 点降低至 40 点。
            </p>
          </div>
        </div>

        <div className="clean-card">
          <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '12px' }}>
            区间点调整（Point-Adjust）机制
          </h3>
          <div style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>
              电力换流设备故障（如绕组温升过热、局放劣化、绝缘介损增大）具有连续时间区间演化特征。
            </p>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', padding: '12px 16px', borderRadius: '6px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>逐时刻判定 (Point-Wise):</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>F1 ≈ 48.06%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>区间调整判定 (Point-Adjust):</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)' }}>F1 ≈ 89.78%</span>
              </div>
            </div>
            <p>
              在特高压实际工程中，只要算法在连续故障区间内首次触发阈值告警，即可联锁站端巡检与专家保护系统。Point-Adjust 机制真实刻画了系统在连续故障区间的预警能力。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
