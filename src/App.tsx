import { dataset, datasetHome } from './datasets';
import { lazy, Suspense, useLayoutEffect, useState, type ReactNode } from 'react';
import { useReportNavigation } from './report/useReportNavigation';
import { chapters, route } from './report/navigation';
import { useJourney } from './report/useJourney';
import DataFailure from './report/DataFailure';
import { pausePresentation, rememberNoteOrigin } from './report/notes';
const DataChapter = lazy(() => import('./report/DataChapter'));
const AnomalyChapter = lazy(() => import('./report/AnomalyChapter'));
const ModelsChapter = lazy(() =>
  import('./report/ModelsChapter').then((module) => ({ default: module.ModelsChapter })),
);
const TrainingChapter = lazy(() =>
  import('./report/TrainingChapter').then((module) => ({ default: module.TrainingChapter })),
);
const DetectionChapter = lazy(() =>
  import('./report/DetectionChapter').then((module) => ({ default: module.DetectionChapter })),
);
const PlaybackChapter = lazy(() =>
  import('./report/PlaybackChapter').then((module) => ({ default: module.PlaybackChapter })),
);
const ExplanationChapter = lazy(() => import('./report/ExplanationChapter'));

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
  const { data, error, retry } = useJourney(route() !== 'home');
  const { page, address, contentPage, menu, setMenu, menuButton, reveal } = useReportNavigation();
  const [modelId, setModel] = useState<string>(dataset.modelId);
  const [feature, setFeature] = useState(5);
  const [start, setStart] = useState(107);
  const [viewFeature, setViewFeature] = useState(-1);
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
        <a href="#/" className="brand">
          <strong>许继电气</strong>
          <span>{dataset.brandSubtitle}</span>
        </a>
        <button
          ref={menuButton}
          className="mobile-menu"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          aria-controls="chapter-navigation"
        >
          目录
        </button>
        <nav
          id="chapter-navigation"
          className={menu ? 'site-nav open' : 'site-nav'}
          aria-label="章节导航"
          onClick={() => setMenu(false)}
        >
          {chapters.map(([id, name]) => (
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
      <main
        id="main"
        tabIndex={-1}
        className={
          'site-main ' + (page === 'home' ? 'home-main' : page === 'playback' ? 'wide-main' : '')
        }
      >
        <div hidden={page === 'metrics'} key={contentPage}>
          <Suspense fallback={loading}>
            <ChapterReady
              active={page !== 'metrics' && (contentPage === 'home' || !!data || !!error)}
              reveal={reveal}
            >
              {contentPage === 'home' ? (
                <>
                  <section className="home-hero">
                    <h1>
                      {dataset.title}
                      <br />
                      异常检测研究
                    </h1>
                    <div className="hero-bottom">
                      <a
                        className="inline-link dataset-switch"
                        href={datasetHome(dataset.alternate)}
                      >
                        {dataset.alternateTitle} →
                      </a>
                      <a className="primary" href="#/data">
                        开始查看
                      </a>
                    </div>
                  </section>
                  <section className="chapter-list" aria-label="完整研究流程">
                    {chapters.map(([id, , title, desc], i) => (
                      <a href={'#/' + id} key={id}>
                        <span className="large-index">0{i + 1}</span>
                        <div>
                          <h2>{title}</h2>
                          <p>{desc}</p>
                        </div>
                      </a>
                    ))}
                  </section>
                </>
              ) : error ? (
                <DataFailure message={error} retry={retry} />
              ) : !data || !model ? (
                <div className="state-panel" role="status">
                  正在读取研究资料…
                </div>
              ) : contentPage === 'data' ? (
                <DataChapter data={data} feature={selectedFeature} setFeature={setFeature} />
              ) : contentPage === 'models' ? (
                <ModelsChapter data={data} model={model} setModel={setModel} />
              ) : contentPage === 'anomalies' ? (
                <AnomalyChapter data={data} model={model} setModel={setModel} />
              ) : contentPage === 'training' ? (
                <TrainingChapter
                  data={data}
                  model={model}
                  setModel={setModel}
                  feature={selectedFeature}
                  setFeature={setFeature}
                />
              ) : contentPage === 'detection' ? (
                <DetectionChapter
                  data={data}
                  model={model}
                  setModel={setModel}
                  feature={selectedFeature}
                  setFeature={setFeature}
                  start={selectedStart}
                  setStart={setStart}
                  viewFeature={selectedView}
                  setViewFeature={setViewFeature}
                />
              ) : contentPage === 'playback' ? (
                <PlaybackChapter
                  data={data}
                  model={model}
                  setModel={setModel}
                  setFeature={setFeature}
                  start={selectedStart}
                  viewFeature={selectedView}
                  setViewFeature={setViewFeature}
                />
              ) : null}
            </ChapterReady>
          </Suspense>
        </div>
        {page === 'metrics' && (
          <Suspense fallback={loading}>
            <ChapterReady active={!!data || !!error} reveal={reveal}>
              {error ? (
                <DataFailure message={error} retry={retry} />
              ) : data ? (
                <ExplanationChapter data={data} address={address} />
              ) : (
                <p role="status">正在读取说明资料…</p>
              )}
            </ChapterReady>
          </Suspense>
        )}
      </main>
    </>
  );
}
