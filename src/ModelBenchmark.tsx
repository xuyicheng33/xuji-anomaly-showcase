import type { ConverterShowcaseData } from './types';

interface ModelBenchmarkProps {
  data: ConverterShowcaseData;
}

export function ModelBenchmark({ data }: ModelBenchmarkProps) {
  const models = Object.values(data.models);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 顶部三模型评测横向对照表 */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">三种模型在换流设备测试集全量评测结果</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              换流站测试集 2,397 时刻 · 125 维全测点 · 真实异常 490 时刻 (占比 20.44%)
            </div>
          </div>
          <span className="brand-badge" style={{ color: 'var(--accent)' }}>
            同源同基准评测
          </span>
        </div>

        <div className="panel-body" style={{ padding: '0' }}>
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>模型名称</th>
                <th>核心架构与改进机制</th>
                <th>自适应阈值 τ</th>
                <th>精确率 Precision</th>
                <th>召回率 Recall</th>
                <th>F1-Score (PA)</th>
                <th>ROC-AUC</th>
                <th>检出 (TP) / 误报 (FP)</th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.key}>
                  <td>
                    <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{m.name}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.title}</div>
                  </td>
                  <td style={{ maxWidth: '280px', fontSize: '12px' }}>
                    {m.key === 'STAM-AD' && '因果 TCN + Transformer 全局/局部双分支，引入自适应时间掩码与有界异常对比损失'}
                    {m.key === 'SMST-AD' && '扩展多尺度时间分支与特征变量间空间拓扑依赖图，增强跨测点强耦合关联捕获'}
                    {m.key === 'STMem-AD' && '引入时空正常模式外部双记忆矩阵，通过记忆项检索进行受限正常重构'}
                  </td>
                  <td className="text-mono" style={{ fontSize: '12px' }}>
                    {m.threshold.toFixed(5)}
                  </td>
                  <td className="text-mono">{(m.metrics.precision * 100).toFixed(2)}%</td>
                  <td className="text-mono">{(m.metrics.recall * 100).toFixed(2)}%</td>
                  <td className="metric-val-f1">{(m.metrics.f1 * 100).toFixed(2)}%</td>
                  <td className="text-mono" style={{ fontWeight: 600 }}>{(m.metrics.auc * 100).toFixed(2)}%</td>
                  <td className="text-mono" style={{ fontSize: '12px' }}>
                    <span style={{ color: 'var(--status-ok)', fontWeight: 600 }}>{m.metrics.tp}</span> / <span style={{ color: 'var(--status-warn)' }}>{m.metrics.fp}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 模型演进与技术消融剖析 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="panel-card">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '15px' }}>
              <span>从模型0到模型1的演进与消融结论</span>
            </h3>
          </div>
          <div className="panel-body" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>模型 0（学姐原版基线）：</strong> 采用传统 TCN-Transformer 双分支重构。在全正常换流数据测试中由于缺乏异常边界感知，重构过于平滑，容易将突发异常也一并平滑重构，导致高假阴性（漏检）或轻微漂移误报。
            </p>
            <p style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--accent)' }}>模型 1（STAM-AD 核心改进）：</strong>
              引入了<strong>动态自适应掩码（Adaptive Masking）</strong>与<strong>有界异常对比损失（Bounded Anomaly Loss）</strong>。在训练中主动对多维时序注入扰动，迫使模型只能通过未被污染的上下文重构真实信号，使重构误差在真实异常区间剧烈陡增，F1 指标跃升至 <strong>89.78%</strong>。
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>模型 2（SMST-AD 跨尺度关联）：</strong>
              换流站 125 维测点之间（如直流电压与网侧交流线电压、阀温与油温）存在高度物理强约束。通过多尺度变量关联建模，F1 达到全场最高的 <strong>90.61%</strong>，误报数（FP）从 49 点进一步压降至 40 点。
            </p>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <h3 className="panel-title" style={{ fontSize: '15px' }}>
              <span>点调整机制 (Point-Adjust) 与实际工程落地价值</span>
            </h3>
          </div>
          <div className="panel-body" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>
              <strong>工业异常的连续性特征：</strong> 电力换流设备绝大多数物理故障（如绝缘劣化局部放电、温升异常累积、接触阻抗增大）都是具有时间持续性的区间过程，而非孤立的单点噪声。
            </p>
            <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>逐点判定（Point-Wise）:</span>
                <strong className="text-mono">F1 ≈ 48.06%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>区间点调整（Point-Adjust）:</span>
                <strong className="text-mono" style={{ color: 'var(--accent)' }}>F1 ≈ 89.78%</strong>
              </div>
            </div>
            <p>
              只要算法在故障发生的第一时间（前几个采样点）成功报出超阈值，就足以联动站端继电保护或触发专家系统报警，后续整个故障段均会被运行人员确认为同一事故链。因此 Point-Adjust 真实反映了实际特高压换流工程的告警拦截能力。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
