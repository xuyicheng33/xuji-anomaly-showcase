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
      title: '测点数据',
      desc: '125 维全测点监测序列与 7:3 正常工况建模划分。',
    },
    {
      id: 'anomaly' as const,
      num: '02',
      title: '异常构造',
      desc: '软替换、均匀替换、尖峰噪声与时间伸缩 8 组基准对比。',
    },
    {
      id: 'models' as const,
      num: '03',
      title: '模型评测',
      desc: 'STAM-AD、SMST-AD 与 STMem-AD 全量指标与消融分析。',
    },
    {
      id: 'playback' as const,
      num: '04',
      title: '时序回放',
      desc: '逐时刻推演、重构残差、自适应阈值判定与实时混淆矩阵。',
    }
  ];

  return (
    <div>
      <section className="home-hero">
        <h1 className="hero-heading">特高压换流设备异常检测</h1>
        <p className="hero-summary">
          基于 2022 年换流站真机监测数据，建立覆盖样本合成、自监督双分支重构与自适应极值阈值判定的全链路验证系统。
        </p>

        {/* 4 维核心数值横排卡片 */}
        <div className="stat-grid-pure">
          <div className="stat-item-pure">
            <div className="stat-val-pure">{meta.featuresCount}</div>
            <div className="stat-label-pure">监测测点维度</div>
          </div>
          <div className="stat-item-pure">
            <div className="stat-val-pure">{meta.testSamples.toLocaleString()}</div>
            <div className="stat-label-pure">测试时间序列 (步)</div>
          </div>
          <div className="stat-item-pure">
            <div className="stat-val-pure">8</div>
            <div className="stat-label-pure">异常构造形态</div>
          </div>
          <div className="stat-item-pure">
            <div className="stat-val-pure highlight">90.61%</div>
            <div className="stat-label-pure">SMST-AD 最佳 F1</div>
          </div>
        </div>
      </section>

      {/* 4 个模块导航卡片 */}
      <section className="portal-grid">
        {modules.map(m => (
          <button
            key={m.id}
            className="portal-card"
            onClick={() => onNavigate(m.id)}
          >
            <div>
              <div className="portal-card-top">
                <span className="portal-card-num">{m.num}</span>
              </div>
              <h2 className="portal-card-title">{m.title}</h2>
              <p className="portal-card-desc">{m.desc}</p>
            </div>
            <div className="portal-card-action">
              <span>进入模块</span>
              <span>→</span>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
