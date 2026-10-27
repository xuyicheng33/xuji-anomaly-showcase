import type { ConverterShowcaseData } from './types';

interface HomePortalProps {
  data: ConverterShowcaseData;
  onNavigate: (module: 'data' | 'anomaly' | 'models' | 'playback') => void;
}

export function HomePortal({ data, onNavigate }: HomePortalProps) {
  const meta = data.datasetMeta;

  const modules = [
    {
      id: 'data' as const,
      num: '01',
      tag: '数据集与测点',
      title: '换流设备时序数据',
      desc: '介绍换流站 125 维时序监测测点分布、采样时间序列及前 70% 正常数据建模划分。',
      action: '查看数据与测点分布'
    },
    {
      id: 'anomaly' as const,
      num: '02',
      tag: '样本生成机制',
      title: '异常样本构造方法',
      desc: '阐述软替换、均匀替换、峰值噪声与长度调整四类形态在不同阶段的 8 组插入对比与物理映射。',
      action: '浏览 8 类构造场景'
    },
    {
      id: 'models' as const,
      num: '03',
      tag: '算法与对比',
      title: '模型架构与评测指标',
      desc: '对比 STAM-AD、SMST-AD 与 STMem-AD 的网络演进机制，查阅 2,397 测试步全量实验指标。',
      action: '查阅全量评测结果'
    },
    {
      id: 'playback' as const,
      num: '04',
      tag: '动态验证',
      title: '检测过程时序回放',
      desc: '逐时刻推进检测判定流程，观察双通道时序重构、自适应阈值告警与混淆矩阵动态收敛。',
      action: '进入时序回放演示'
    }
  ];

  return (
    <div>
      {/* 首页导言区域 */}
      <section className="home-hero">
        <div className="hero-category">许继电气 · 工业时序异常检测课题</div>
        <h1 className="hero-heading">特高压换流设备异常检测展示系统</h1>
        <p className="hero-summary">
          针对特高压换流站现场历史故障样本匮乏、多维变量强耦合的实际工况，基于 2022 年真机运行监测数据，
          建立涵盖样本合成、双分支自监督重构与自适应极值阈值判定的全流程检测验证体系。
        </p>

        {/* 关键统计横排指标 */}
        <div className="meta-strip">
          <div className="meta-item">
            <span className="meta-item-label">监测通道规模</span>
            <span className="meta-item-value">{meta.featuresCount} <small style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--text-muted)' }}>维</small></span>
            <span className="meta-item-desc">涵盖电压、电流、绕组及油温</span>
          </div>
          <div className="meta-item">
            <span className="meta-item-label">测试序列规模</span>
            <span className="meta-item-value">{meta.testSamples.toLocaleString()} <small style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--text-muted)' }}>时刻</small></span>
            <span className="meta-item-desc">2022-08-22 至 2022-11-29</span>
          </div>
          <div className="meta-item">
            <span className="meta-item-label">异常样本形态</span>
            <span className="meta-item-value">8 <small style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--text-muted)' }}>组</small></span>
            <span className="meta-item-desc">4 类形态 × 2 种注入时机</span>
          </div>
          <div className="meta-item">
            <span className="meta-item-label">最佳综合 F1</span>
            <span className="meta-item-value" style={{ color: 'var(--accent)' }}>90.61%</span>
            <span className="meta-item-desc">SMST-AD 多尺度时空模型</span>
          </div>
        </div>
      </section>

      {/* 四大模块大卡片导航 */}
      <section>
        <div style={{ marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          展示模块索引
        </div>
        <div className="portal-grid">
          {modules.map(m => (
            <button
              key={m.id}
              className="portal-card"
              onClick={() => onNavigate(m.id)}
            >
              <div>
                <div className="portal-card-top">
                  <span className="portal-card-num">{m.num}</span>
                  <span className="portal-card-tag">{m.tag}</span>
                </div>
                <h2 className="portal-card-title">{m.title}</h2>
                <p className="portal-card-desc">{m.desc}</p>
              </div>
              <div className="portal-card-action">
                <span>{m.action}</span>
                <span>→</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
