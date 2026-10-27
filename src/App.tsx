import { useEffect, useState } from 'react';
import type { ConverterShowcaseData } from './types';
import { HomePortal } from './HomePortal';
import { DataOverview } from './DataOverview';
import { AnomalyStudio } from './AnomalyStudio';
import { ModelBenchmark } from './ModelBenchmark';
import { LiveDashboard } from './LiveDashboard';

type TabType = 'home' | 'data' | 'anomaly' | 'models' | 'playback';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const hash = window.location.hash.replace('#', '') as TabType;
    if (['home', 'data', 'anomaly', 'models', 'playback'].includes(hash)) {
      return hash;
    }
    return 'home';
  });

  const [data, setData] = useState<ConverterShowcaseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace('#', '') as TabType;
      if (['home', 'data', 'anomaly', 'models', 'playback'].includes(h)) {
        setActiveTab(h);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = (tab: TabType) => {
    setActiveTab(tab);
    window.location.hash = tab === 'home' ? '' : tab;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  useEffect(() => {
    fetch('./data/converter_showcase.json')
      .then(res => {
        if (!res.ok) throw new Error(`数据读取异常 (HTTP ${res.status})`);
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
    <div>
      {/* 顶部主导航栏 */}
      <header className="site-header">
        <button className="brand-wrapper" onClick={() => navigateTo('home')}>
          <span className="brand-title">许继电气 · 换流设备时序异常检测</span>
          <span className="brand-tag">2022 真机数据</span>
        </button>

        <nav className="nav-links" aria-label="全局导航">
          <button
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => navigateTo('home')}
          >
            首页目录
          </button>
          <button
            className={`nav-btn ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => navigateTo('data')}
          >
            01 数据与测点
          </button>
          <button
            className={`nav-btn ${activeTab === 'anomaly' ? 'active' : ''}`}
            onClick={() => navigateTo('anomaly')}
          >
            02 异常样本构造
          </button>
          <button
            className={`nav-btn ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => navigateTo('models')}
          >
            03 模型架构与指标
          </button>
          <button
            className={`nav-btn ${activeTab === 'playback' ? 'active' : ''}`}
            onClick={() => navigateTo('playback')}
          >
            04 时序检测回放
          </button>
        </nav>
      </header>

      {/* 主展示区域 */}
      <main className="layout-container">
        {loading && (
          <div style={{ padding: '120px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '8px' }}>
              正在加载特高压换流设备时序监测数据…
            </p>
            <span style={{ fontSize: '13px' }}>包含 125 维全测点与三模型推演基准</span>
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--state-alert-bg)', border: '1px solid var(--state-alert-border)', padding: '24px', borderRadius: '8px', color: 'var(--state-alert)', maxWidth: '640px', margin: '60px auto' }}>
            <strong style={{ display: 'block', marginBottom: '6px' }}>数据载入失败</strong>
            <p style={{ fontSize: '13px' }}>{error}。请核验 public/data/converter_showcase.json 数据文件。</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {activeTab === 'home' && <HomePortal data={data} onNavigate={navigateTo} />}
            {activeTab === 'data' && <DataOverview data={data} onBack={() => navigateTo('home')} />}
            {activeTab === 'anomaly' && <AnomalyStudio data={data} onBack={() => navigateTo('home')} />}
            {activeTab === 'models' && <ModelBenchmark data={data} onBack={() => navigateTo('home')} />}
            {activeTab === 'playback' && <LiveDashboard data={data} onBack={() => navigateTo('home')} />}
          </>
        )}
      </main>
    </div>
  );
}
