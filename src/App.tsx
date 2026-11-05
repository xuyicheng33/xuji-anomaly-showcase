import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chapters, route } from './report/navigation';
import { useJourney } from './report/useJourney';
import DataChapter from './report/DataChapter';
import AnomalyChapter from './report/AnomalyChapter';
import { ModelsChapter } from './report/ModelsChapter';
import { TrainingChapter } from './report/TrainingChapter';
import { DetectionChapter } from './report/DetectionChapter';
import { PlaybackChapter } from './report/PlaybackChapter';
import ExplanationChapter from './report/ExplanationChapter';
import DataFailure from './report/DataFailure';
import { getNoteOrigin, pausePresentation, rememberNoteOrigin } from './report/notes';
export default function App() {
  const { data, error, retry } = useJourney();
  const [page, setPage] = useState(route),
    [address, setAddress] = useState(location.hash),
    [contentPage, setContentPage] = useState(() => (route() === 'metrics' ? null : route())),
    [modelId, setModel] = useState('model1'),
    [feature, setFeature] = useState(5),
    [start, setStart] = useState(107),
    [viewFeature, setViewFeature] = useState(-1),
    [menu, setMenu] = useState(false);
  const previousPage = useRef(page),
    menuButton = useRef<HTMLButtonElement>(null),
    returning = useRef(false),
    scrollPositions = useRef(new Map<string, number>());
  const loaded = data !== null;
  useEffect(() => {
    const f = () => {
      const next = route();
      scrollPositions.current.set(previousPage.current, window.scrollY);
      returning.current = previousPage.current === 'metrics' && next !== 'metrics';
      pausePresentation();
      setPage(next);
      setAddress(location.hash);
      if (next !== 'metrics') setContentPage(next);
      previousPage.current = next;
      setMenu(false);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useLayoutEffect(() => {
    document.title =
      (page === 'metrics'
        ? '数据与评估说明'
        : chapters.find((c) => c[0] === page)?.[1] || '从数据到异常判定') + '　许继电气';
    const frame = requestAnimationFrame(() => {
      const note = new URLSearchParams(address.split('?')[1] ?? '').get('note');
      const target = page === 'metrics' && note ? document.getElementById('note-' + note) : null;
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
      } else if (returning.current) {
        const origin = getNoteOrigin();
        window.scrollTo(0, scrollPositions.current.get(page) ?? origin?.y ?? 0);
        document.getElementById(origin?.reference ?? '')?.focus({ preventScroll: true });
        returning.current = false;
      } else {
        window.scrollTo(0, 0);
        document.getElementById('main')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [page, address, loaded]);
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
          <span>异常检测研究</span>
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
          {contentPage === 'home' ? (
            <>
              <section className="home-hero">
                <h1>
                  换流设备
                  <br />
                  异常检测研究
                </h1>
                <div className="hero-bottom">
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
        </div>
        {page === 'metrics' &&
          (error ? (
            <DataFailure message={error} retry={retry} />
          ) : data ? (
            <ExplanationChapter data={data} address={address} />
          ) : (
            <p role="status">正在读取说明资料…</p>
          ))}
      </main>
    </>
  );
}
