import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Journey } from './journey';
import DataChapter from './report/DataChapter';
import AnomalyChapter from './report/AnomalyChapter';
import { ModelsChapter, TrainingChapter } from './report/MethodChapters';
import { DetectionChapter, PlaybackChapter } from './report/DetectionChapters';
import ExplanationChapter from './report/ExplanationChapter';
import { getNoteOrigin, pausePresentation, rememberNoteOrigin } from './report/notes';
const chapters = [
  ['data', '数据整理', '监测数据预处理', '无效记录剔除、缺失填补与归一化'],
  ['anomalies', '异常构造', '异常样本构造', '四类异常的构造过程与标签'],
  ['models', '两种方法', '两种异常检测模型', '双分支结构与多尺度时空建模'],
  ['training', '模型训练', '模型训练过程', '训练窗口、参数更新与损失变化'],
  ['detection', '片段检测', '数据片段检测', '窗口重建、异常评分与阈值判定'],
  ['playback', '连续回放', '连续检测结果回放', '逐时刻检测与累计评估指标'],
];
function route() {
  const path = location.hash.replace('#/', '').split('?')[0];
  if (chapters.some((c) => c[0] === path) || path === 'metrics') return path;
  const old = path.startsWith('step/') ? [path, path.split('/')[1]] : null;
  if (old) {
    const n = +old[1];
    return n <= 9
      ? 'data'
      : n <= 18
        ? 'anomalies'
        : n <= 25
          ? 'models'
          : n <= 30
            ? 'training'
            : n <= 37
              ? 'detection'
              : 'playback';
  }
  return 'home';
}
export default function App() {
  const [page, setPage] = useState(route),
    [address, setAddress] = useState(location.hash),
    [contentPage, setContentPage] = useState(() => (route() === 'metrics' ? null : route())),
    [data, setData] = useState<Journey | null>(null),
    [modelId, setModel] = useState('model1'),
    [feature, setFeature] = useState(5),
    [start, setStart] = useState(107),
    [viewFeature, setViewFeature] = useState(-1),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [menu, setMenu] = useState(false);
  const previousPage = useRef(page),
    returning = useRef(false),
    scrollPositions = useRef(new Map<string, number>());
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
    let active = true;
    setError('');
    fetch(import.meta.env.BASE_URL + 'data/journey/manifest.json')
      .then((r) => {
        if (!r.ok) throw Error('资料读取失败');
        return r.json();
      })
      .then((d: Journey) => {
        if (d.schemaVersion !== 2 || d.features.length !== 125) throw Error('资料版本不匹配');
        d.models = d.models.filter((m) => ['model1', 'model2'].includes(m.id));
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
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
  }, [page, address, !!data]);
  const model = data?.models.find((m) => m.id === modelId),
    props =
      data && model
        ? {
            data,
            model,
            setModel,
            feature,
            setFeature,
            start,
            setStart,
            viewFeature,
            setViewFeature,
          }
        : null;
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
        <button className="mobile-menu" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
          目录
        </button>
        <nav className={menu ? 'site-nav open' : 'site-nav'} aria-label="章节导航">
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
                  <p>
                    7,992 个时刻，125 个测点
                    <br />
                    数据处理、模型训练与检测评估
                  </p>
                  <a className="primary" href="#/data">
                    开始查看
                  </a>
                </div>
              </section>
              <section className="chapter-list" aria-label="完整研究流程">
                {chapters.map(([id, name, title, desc], i) => (
                  <a href={'#/' + id} key={id}>
                    <span className="large-index">0{i + 1}</span>
                    <div>
                      <span className="chapter-name">{name}</span>
                      <h2>{title}</h2>
                      <p>{desc}</p>
                    </div>
                  </a>
                ))}
              </section>
            </>
          ) : error ? (
            <div className="state-panel" role="alert">
              <h2>{error}</h2>
              <button className="primary" onClick={() => setAttempt((n) => n + 1)}>
                重新读取
              </button>
            </div>
          ) : !data || !model ? (
            <div className="state-panel" role="status">
              正在读取研究资料…
            </div>
          ) : contentPage === 'data' ? (
            <DataChapter data={data} feature={feature} setFeature={setFeature} />
          ) : contentPage === 'models' ? (
            <ModelsChapter data={data} model={model} setModel={setModel} />
          ) : contentPage === 'anomalies' ? (
            <AnomalyChapter data={data} model={model} setModel={setModel} />
          ) : !props ? (
            <div className="state-panel" role="status">
              正在读取模型结果…
            </div>
          ) : contentPage === 'training' ? (
            <TrainingChapter {...props} />
          ) : contentPage === 'detection' ? (
            <DetectionChapter {...props} />
          ) : contentPage === 'playback' ? (
            <PlaybackChapter {...props} />
          ) : null}
        </div>
        {page === 'metrics' &&
          (data ? (
            <ExplanationChapter data={data} address={address} feature={feature} />
          ) : (
            <p role="status">正在读取说明资料…</p>
          ))}
      </main>
    </>
  );
}
