import { dataset } from './datasets';
import { lazyChapter } from './report/lazyChapter';
import { Suspense, useLayoutEffect, useState, type ReactNode } from 'react';
import { useReportNavigation } from './report/useReportNavigation';
import { chapters, route } from './report/navigation';
import { useJourney } from './report/useJourney';
import DataFailure from './report/DataFailure';
import ReportFailure from './report/ReportFailure';
import { pausePresentation, rememberNoteOrigin } from './report/notes';
import ChapterNavigation from './report/ChapterNavigation';
import DatasetSwitch from './report/DatasetSwitch';
import { SelectionIndicator } from './report/ReportUI';
import { useScrolledHeader } from './report/useScrolledHeader';
const DataChapter = lazyChapter(() => import('./report/DataChapter'));
const AnomalyChapter = lazyChapter(() => import('./report/AnomalyChapter'));
const ModelsChapter = lazyChapter(async () => {
  const module = await import('./report/ModelsChapter');
  return { default: module.ModelsChapter };
});
const TrainingChapter = lazyChapter(async () => {
  const module = await import('./report/TrainingChapter');
  return { default: module.TrainingChapter };
});
const DetectionChapter = lazyChapter(async () => {
  const module = await import('./report/DetectionChapter');
  return { default: module.DetectionChapter };
});
const PlaybackChapter = lazyChapter(async () => {
  const module = await import('./report/PlaybackChapter');
  return { default: module.PlaybackChapter };
});
const ExplanationChapter = lazyChapter(() => import('./report/ExplanationChapter'));

function ChapterReady({
  active,
  reveal,
  children,
}: {
  active: boolean;
  reveal: () => () => void;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (active) return reveal();
  }, [active, reveal]);
  return children;
}

const loading = (
  <div className="state-panel" role="status">
    正在读取研究资料…
  </div>
);

export default function App() {
  const [modelId, setModel] = useState<string>(dataset.modelId);
  const { data, error, retry } = useJourney(route() !== 'home', modelId);
  const { page, address, contentPage, menu, setMenu, menuButton, reveal } = useReportNavigation();
  const [feature, setFeature] = useState(5);
  const [start, setStart] = useState(107);
  const [viewFeature, setViewFeature] = useState(-1);
  useScrolledHeader();
  const model = data?.models.find((m) => m.id === modelId) ?? data?.models[0];
  const selectedFeature = data ? Math.min(feature, data.features.length - 1) : feature;
  const selectedStart = data ? Math.min(start, data.times.length - data.window) : start;
  const selectedView = data ? Math.min(viewFeature, data.features.length - 1) : viewFeature;
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        跳到正文
      </a>
      <header className="site-header">
        <div className="brand">
          <a href="#/" aria-label="许继电气首页">
            <strong>许继电气</strong>
          </a>
          <DatasetSwitch key={page} page={page} />
        </div>
        <button
          ref={menuButton}
          className="mobile-menu"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          aria-controls="chapter-navigation"
        >
          目录
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        </button>
        <nav
          id="chapter-navigation"
          className={menu ? 'site-nav open' : 'site-nav'}
          aria-label="章节导航"
          onClick={() => setMenu(false)}
        >
          <SelectionIndicator selector=":scope > a[aria-current=page]" className="nav-indicator" />
          {chapters.map(({ id, name }) => (
            <a key={id} href={'#/' + id} aria-current={page === id ? 'page' : undefined}>
              {name}
            </a>
          ))}
          <a
            href="#/metrics"
            aria-current={page === 'metrics' ? 'page' : undefined}
            onClick={() => {
              rememberNoteOrigin();
              pausePresentation();
            }}
          >
            数据与评估说明
          </a>
        </nav>
      </header>
      {menu && <div className="menu-scrim" aria-hidden="true" onClick={() => setMenu(false)} />}
      <main id="main" tabIndex={-1} className="site-main">
        <div className="chapter-stage" hidden={page === 'metrics'} key={contentPage}>
          <ReportFailure contained>
            <Suspense fallback={loading}>
              <ChapterReady
                active={page !== 'metrics' && (contentPage === 'home' || !!data || !!error)}
                reveal={reveal}
              >
                {contentPage === 'home' ? (
                  <>
                    <section className="home-hero">
                      <h1 aria-label={`${dataset.title} 异常检测研究`}>
                        <span className="hero-subject">{dataset.title}</span>
                        <span className="hero-title">
                          <span>异常</span>
                          <span>检测</span>
                          <span>研究</span>
                        </span>
                      </h1>
                      <div className="hero-bottom">
                        <a className="primary" href="#/data">
                          查看研究流程 <span aria-hidden="true">→</span>
                        </a>
                      </div>
                    </section>
                    <section className="chapter-list" aria-label="完整研究流程">
                      {chapters.map(({ id, title }, i) => (
                        <a href={'#/' + id} key={id}>
                          <span className="large-index">0{i + 1}</span>
                          <h2>{title}</h2>
                          <span className="chapter-entry-arrow" aria-hidden="true">
                            →
                          </span>
                        </a>
                      ))}
                    </section>
                  </>
                ) : error ? (
                  <DataFailure message={error} retry={retry} />
                ) : contentPage === 'data' ? (
                  <DataChapter
                    content={data ? { data, feature: selectedFeature, setFeature } : null}
                  />
                ) : contentPage === 'models' ? (
                  <ModelsChapter content={data && model ? { data, model, setModel } : null} />
                ) : contentPage === 'anomalies' ? (
                  <AnomalyChapter content={data && model ? { data, model, setModel } : null} />
                ) : contentPage === 'training' ? (
                  <TrainingChapter
                    content={
                      data && model
                        ? { data, model, setModel, feature: selectedFeature, setFeature }
                        : null
                    }
                  />
                ) : contentPage === 'detection' ? (
                  <DetectionChapter
                    content={
                      data && model
                        ? {
                            data,
                            model,
                            setModel,
                            feature: selectedFeature,
                            setFeature,
                            start: selectedStart,
                            setStart,
                            viewFeature: selectedView,
                            setViewFeature,
                          }
                        : null
                    }
                  />
                ) : contentPage === 'playback' ? (
                  <PlaybackChapter
                    content={
                      data && model
                        ? {
                            data,
                            model,
                            setModel,
                            setFeature,
                            start: selectedStart,
                            viewFeature: selectedView,
                            setViewFeature,
                          }
                        : null
                    }
                  />
                ) : null}
                {data && !error && contentPage && <ChapterNavigation page={contentPage} />}
              </ChapterReady>
            </Suspense>
          </ReportFailure>
        </div>
        {page === 'metrics' && (
          <ReportFailure contained>
            <Suspense fallback={loading}>
              <ChapterReady active={!!data || !!error} reveal={reveal}>
                {error ? (
                  <DataFailure message={error} retry={retry} />
                ) : (
                  <ExplanationChapter content={data ? { data, address } : null} />
                )}
              </ChapterReady>
            </Suspense>
          </ReportFailure>
        )}
      </main>
    </>
  );
}
