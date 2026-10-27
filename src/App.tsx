import { useEffect, useRef, useState } from 'react';
import { Icon } from './components';
import { PageView } from './PageView';
import { pageFromHash, pages, sourceIds, stages, stepHash } from './model';
import type { Provenance, Research } from './types';

export default function App() {
  const [id, setId] = useState(() => pageFromHash(window.location.hash));
  const [data, setData] = useState<Research | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [contents, setContents] = useState(false);
  const [details, setDetails] = useState(false);
  const [field, setField] = useState(0);
  const [start, setStart] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const page = pages[id - 1];
  const go = (next: number) => { if (next >= 1 && next <= 61) { window.location.hash = stepHash(next); setContents(false); } };

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['research', 'provenance'].map(async name => {
      const response = await fetch(`./data/${name}.json`, { signal: controller.signal });
      if (!response.ok) throw new Error(`数据文件读取失败（${response.status}）`);
      return response.json();
    })).then(([research, provenance]) => {
      if (research.schemaVersion !== 1 || provenance.schemaVersion !== 1 || research.features.length !== 28 || research.values.length !== 8759) throw new Error('数据版本不匹配');
      setData(research); setProvenance(provenance); setError('');
    }).catch(reason => { if (reason.name !== 'AbortError') setError(reason.message); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const hash = () => { setId(pageFromHash(window.location.hash)); setDetails(false); };
    window.addEventListener('hashchange', hash);
    if (window.location.hash !== stepHash(id)) history.replaceState(null, '', stepHash(id));
    return () => window.removeEventListener('hashchange', hash);
  }, []);
  useEffect(() => {
    document.title = `${page.title} · 许继电气异常检测`;
    if (firstRender.current) firstRender.current = false;
    else { heading.current?.focus({ preventScroll: true }); main.current?.scrollTo({ top: 0, behavior: 'instant' }); }
  }, [id, page.title]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Escape') { setContents(false); setDetails(false); menuButton.current?.focus(); return; }
      if (contents || /INPUT|SELECT|TEXTAREA/.test(target.tagName) || target.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); go(id + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(id - 1); }
      if (event.key === 'Home') { event.preventDefault(); go(1); }
      if (event.key === 'End') { event.preventDefault(); go(61); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [id, contents]);
  useEffect(() => { if (details) detailsRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); }, [details]);

  return <><a className="skip-link" href="#main" onClick={event => { event.preventDefault(); heading.current?.focus(); }}>跳到页面内容</a><header className="site-header"><div className="header-inner"><a className="brand" href={stepHash(1)}><span>许继电气</span><span>异常检测</span></a><button className="menu-button" ref={menuButton} onClick={() => setContents(!contents)} aria-expanded={contents} aria-controls="contents"><Icon name={contents ? 'close' : 'menu'} />{contents ? '收起目录' : '全部页面'}</button></div></header>
    {contents && <nav id="contents" className="contents" aria-label="全部 61 页"><div className="contents-inner">{stages.map((stage, index) => <section key={stage}><h2>{stage}</h2><ol>{pages.filter(p => p.stage === index).map(p => <li key={p.id}><a href={stepHash(p.id)} aria-current={p.id === id ? 'page' : undefined} onClick={() => setContents(false)}><span>{String(p.id).padStart(2, '0')}</span>{p.title}</a></li>)}</ol></section>)}</div></nav>}
    <nav className="stage-nav" aria-label="展示阶段">{stages.map((stage, i) => <a key={stage} href={stepHash(pages.find(p => p.stage === i)!.id)} aria-current={page.stage === i ? 'step' : undefined}>{stage}</a>)}</nav>
    <main id="main" className="main" ref={main}><div className="page-heading"><h1 ref={heading} tabIndex={-1}>{page.title}</h1><button className="source-button" onClick={() => setDetails(!details)} aria-expanded={details} aria-controls="source-details">{details ? '收起来源' : '查看来源'}<span aria-hidden="true">{details ? '−' : '+'}</span></button></div>
      {error ? <section className="error-state" role="alert"><h2>展示数据未能载入</h2><p>{error}。请检查本地服务后重试。</p><button onClick={() => { setError(''); setAttempt(attempt + 1); }}>重新载入</button></section> : data && provenance ? <section className={`canvas page-${id}`} aria-label={page.title}><PageView key={id} id={id} data={data} provenance={provenance} field={field} onField={setField} start={start} onStart={setStart} /></section> : <div className="loading-state" role="status">正在读取保存的展示数据…</div>}
      {details && provenance && <section id="source-details" ref={detailsRef} className="source-details"><h2>本页来源</h2><p>{page.description}</p>{provenance.sources.filter(s => sourceIds(id).includes(s.id)).map(s => <details key={s.id}><summary><span>{s.title}</span><span>{s.version}</span></summary><div className="source-body"><code>{s.path}</code>{s.note && <p>{s.note}</p>}<p className="hash">SHA-256 · {s.sha256}</p>{s.excerpt && <pre>{s.excerpt}</pre>}</div></details>)}</section>}
    </main><footer className="site-footer"><div className="footer-inner"><button className="previous-button" disabled={id === 1} onClick={() => go(id - 1)}><Icon name="left" /><span>上一页</span></button><div className="page-position"><span aria-live="polite">{String(id).padStart(2, '0')}<span> / 61</span></span><div className="progress-track"><div style={{ width: `${id / 61 * 100}%` }} /></div></div><button className="next-button" disabled={id === 61} onClick={() => go(id + 1)}><span>{id === 1 ? '开始展示' : '下一页'}</span><Icon name="right" /></button></div></footer></>;
}
