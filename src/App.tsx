import { useEffect, useState } from 'react';
import type { ConverterShowcaseData } from './types';
import { LiveDashboard } from './LiveDashboard';
import { AnomalyStudio } from './AnomalyStudio';
import { ModelBenchmark } from './ModelBenchmark';

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'studio' | 'benchmark'>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'studio' || hash === 'benchmark') return hash;
    return 'live';
  });

  const [data, setData] = useState<ConverterShowcaseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace('#', '');
      if (h === 'live' || h === 'studio' || h === 'benchmark') {
        setActiveTab(h);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const switchTab = (tab: 'live' | 'studio' | 'benchmark') => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    fetch('./data/converter_showcase.json')
      .then(res => {
        if (!res.ok) throw new Error(`数据加载失败 (HTTP ${res.status})`);
        return res.json();
      })
      .then((json: ConverterShowcaseData) => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || '未知错误');
        setLoading(false);
      });
  }, []);

  return (
    <div className="app-container">
      {/* 顶部主导航栏 */}
      <header className="top-header">
        <div className="brand-section">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="brand-title">许继电气 · 换流设备时序异常检测工作台</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              验收交付演示系统 · 特高压换流站 125 维真机监测资产
            </span>
          </div>
          <span className="brand-badge">2022 真机数据</span>
        </div>

        {/* 核心主功能导航 */}
        <nav className="nav-tabs" aria-label="核心功能区导航">
          <button
            className={`nav-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => switchTab('live')}
          >
            <span>⚡ 实时时序推演大厅</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => switchTab('studio')}
          >
            <span>🧪 8类异常构造工坊</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
            onClick={() => switchTab('benchmark')}
          >
            <span>📊 三模型基准与消融</span>
          </button>
        </nav>

        {/* 右侧数据规格摘要 */}
        <div className="header-meta">
          <span>测点: <strong>125 维</strong></span>
          <span>测试样本: <strong>2,397 时刻</strong></span>
          <span>故障点: <strong style={{ color: 'var(--status-alert)' }}>490 (20.4%)</strong></span>
          <span>正常训练比: <strong>70%</strong></span>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="main-content">
        {loading && (
          <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              正在初始化特高压换流设备时序资产…
            </div>
            <span>加载 2,397 测试时刻与三模型前向重构波形数据…</span>
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--status-alert-bg)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '24px', borderRadius: 'var(--radius-lg)', color: 'var(--status-alert)', maxWidth: '600px', margin: '40px auto' }}>
            <strong style={{ fontSize: '16px', display: 'block', marginBottom: '8px' }}>时序数据加载异常</strong>
            <p style={{ fontSize: '13px' }}>{error}。请检查 public/data/converter_showcase.json 是否正常构建。</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {activeTab === 'live' && <LiveDashboard data={data} />}
            {activeTab === 'studio' && <AnomalyStudio data={data} />}
            {activeTab === 'benchmark' && <ModelBenchmark data={data} />}
          </>
        )}
      </main>

      {/* 底部信息栏 */}
      <footer style={{ borderTop: '1px solid var(--border-light)', padding: '14px 24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
        许继电气换流设备异常检测展示系统 · 基于 TCN-Transformer 双分支、自适应掩码对比学习与正常模式时空记忆
      </footer>
    </div>
  );
}
