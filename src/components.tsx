import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chartWindow, number } from './model';
import type { Cell, Research } from './types';

export function Icon({ name, size = 20 }: { name: 'left' | 'right' | 'menu' | 'close' | 'check' | 'arrow'; size?: number }) {
  const paths = { left: 'm14 5-7 7 7 7', right: 'm10 5 7 7-7 7', menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6', arrow: 'M4 12h16m-6-6 6 6-6 6' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function Flow({ steps, active = -1, vertical = false }: { steps: { title: string; detail?: string }[]; active?: number; vertical?: boolean }) {
  return <ol className={`process-list ${vertical ? 'process-vertical' : ''}`}>{steps.map((step, i) => <li key={step.title} className={active === i ? 'active' : ''}><strong>{step.title}</strong>{step.detail && <p>{step.detail}</p>}</li>)}</ol>;
}

export function DataTable({ columns, rows, highlight = [], caption, pageSize = 6 }: { columns: { key: string; label: string }[]; rows: Record<string, Cell>[]; highlight?: string[]; caption?: string; pageSize?: number }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const from = current * pageSize;
  return <div className="data-table"><div className="table-scroll" tabIndex={0} role="region" aria-label={caption || '数据表'}><table><caption className="sr-only">{caption || '数据表'}</caption><thead><tr>{columns.map(col => <th key={col.key} className={highlight.includes(col.key) ? 'highlight' : ''} scope="col">{col.label}</th>)}</tr></thead><tbody>{rows.slice(from, from + pageSize).map((row, i) => <tr key={i}>{columns.map(col => <td key={col.key} className={highlight.includes(col.key) ? 'highlight' : ''}>{typeof row[col.key] === 'number' ? number(row[col.key] as number, Number.isInteger(row[col.key]) ? 0 : 3) : row[col.key] === '' || row[col.key] == null ? <span className="empty-value">空值</span> : row[col.key]}</td>)}</tr>)}</tbody></table></div>{rows.length > pageSize && <div className="table-pagination"><span aria-live="polite">{from + 1}–{Math.min(from + pageSize, rows.length)} / {rows.length} 条</span><button aria-label="上一组记录" disabled={current === 0} onClick={() => setPage(current - 1)}><Icon name="left" size={16} /></button><button aria-label="下一组记录" disabled={from + pageSize >= rows.length} onClick={() => setPage(current + 1)}><Icon name="right" size={16} /></button></div>}</div>;
}

export function Formula({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="formula">{label && <span>{label}</span>}<div>{children}</div></div>;
}

export function Note({ children }: { children: ReactNode }) { return <p className="source-note">{children}</p>; }

export function LineChart({ series, labels, unit = '', compact = false, axis = true, selection }: { series: { name: string; values: number[]; color?: string; dashed?: boolean }[]; labels: string[]; unit?: string; compact?: boolean; axis?: boolean; selection?: [number, number] }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(Math.max(260, entries[0].contentRect.width))); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const height = compact ? 220 : 310, left = 58, right = 22, top = 20, bottom = 42;
  const flat = series.flatMap(s => s.values).filter(Number.isFinite);
  if (!flat.length) return <p role="status">此范围没有保存数值。</p>;
  let min = Math.min(...flat), max = Math.max(...flat);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * .08; min -= pad; max += pad;
  const x = (i: number, n: number) => left + i / Math.max(1, n - 1) * (width - left - right);
  const y = (n: number) => top + (max - n) / (max - min) * (height - top - bottom);
  const ticks = [0, 1, 2, 3];
  return <div className="chart" ref={ref}><div className="chart-legend">{series.map((s, i) => <span key={s.name}><i style={{ background: s.color || (i ? 'var(--forecast)' : 'var(--accent)') }} className={s.dashed ? 'dashed' : ''} />{s.name}</span>)}<span className="chart-unit">{unit}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}><title id={id}>{series.map(s => s.name).join('、')}，{labels[0]} 至 {labels.at(-1)}</title>
      {axis && ticks.map(t => { const value = min + (max - min) * t / 3; return <g key={t}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="grid-line" /><text x={left - 12} y={y(value) + 5} textAnchor="end">{number(value, max - min < .1 ? 4 : max - min < 2 ? 2 : 0)}</text></g>; })}
      {selection && <rect x={x(selection[0], labels.length)} y={top} width={x(selection[1], labels.length) - x(selection[0], labels.length)} height={height - top - bottom} fill="#0066cc" fillOpacity=".07" stroke="#0066cc" strokeOpacity=".5" />}
      {series.map((s, i) => <path key={s.name} d={s.values.map((v, n) => `${n ? 'L' : 'M'}${x(n, s.values.length).toFixed(2)},${y(v).toFixed(2)}`).join(' ')} stroke={s.color || (i ? 'var(--forecast)' : 'var(--accent)')} strokeWidth={2.3} strokeDasharray={s.dashed ? '6 5' : undefined} fill="none" vectorEffect="non-scaling-stroke" />)}
      {(width < 600 ? [0, labels.length - 1] : [0, Math.floor((labels.length - 1) / 2), labels.length - 1]).filter((v, i, a) => a.indexOf(v) === i).map(i => <text key={i} x={x(i, labels.length)} y={height - 10} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{labels[i]?.replace('2025-', '')}</text>)}
    </svg></div>;
}

export function DataChart({ data, field, onField, start, onStart, compact = false, controls = true, splitOnly = false }: { data: Research; field: number; onField: (n: number) => void; start: number; onStart: (n: number) => void; compact?: boolean; controls?: boolean; splitOnly?: boolean }) {
  const fieldId = useId(), rangeId = useId();
  const count = 192;
  const slice = chartWindow(data, splitOnly ? data.split : start, count, field);
  const feature = data.features[field];
  const series = [{ name: (field >= 2 ? feature.group + ' · ' : '') + feature.label, values: slice.values }, ...(field === 0 ? [{ name: '短期功率预测', values: data.values.slice(slice.from, slice.from + count).map(row => row[1]), dashed: true }] : [])];
  return <div className="data-chart">{controls && <div className="controls"><label htmlFor={fieldId}>变量</label><select id={fieldId} value={field} onChange={e => onField(Number(e.target.value))}>{data.features.map((f, i) => <option value={i} key={f.key}>{f.group} · {f.label}</option>)}</select></div>}
    <LineChart series={series} labels={slice.times} unit={feature.unit} compact={compact} />
    {controls && <div className="range-control"><label htmlFor={rangeId}>时间范围</label><input id={rangeId} type="range" min={0} max={data.times.length - count} step={1} value={start} onChange={e => onStart(Number(e.target.value))} /><output htmlFor={rangeId}>{data.times[slice.from].slice(5, 10)}—{data.times[slice.from + count - 1].slice(5, 10)}</output></div>}
  </div>;
}

export function StreamOverview({ data }: { data: Research }) {
  const maxRows = Math.max(...data.streams.map(s => s.rawRows));
  return <div className="stream-overview"><div className="stream-columns"><span>数据类别</span><span>文件数</span><span>原始记录数</span></div>{data.streams.map(s => <div className="stream-row" key={s.id}><div className="stream-name"><strong>{s.name}</strong></div><span className="stream-files">{number(s.files)} 份</span><div className="stream-volume"><div className="stream-track" role="img" aria-label={`${s.name}，${number(s.rawRows)} 条原始记录`}><div style={{ width: `${s.rawRows / maxRows * 100}%` }} /></div><span>{number(s.rawRows)} 条</span></div></div>)}</div>;
}

export function FeatureMap({ data, field, onField }: { data: Research; field: number; onField: (n: number) => void }) {
  return <div className="feature-map"><div className="feature-groups">{['功率', '实测气象', '预报气象'].map(group => <section key={group}><h2>{group}<span>{data.features.filter(f => f.group === group).length}</span></h2><div>{data.features.map((f, i) => f.group === group && <button key={f.key} className={`feature-button ${i === field ? 'selected' : ''}`} aria-pressed={i === field} onClick={() => onField(i)}><span>{f.label}</span>{f.unit && <span>{f.unit}</span>}</button>)}</div></section>)}</div><div className="feature-selected"><code>{data.features[field].key}（{data.features[field].label}）</code><span>训练段范围 {number(data.features[field].min, 3)} — {number(data.features[field].max, 3)} {data.features[field].unit}</span></div></div>;
}

export function ModelOverview() {
  const models = [{ name: 'STAM-AD', focus: '自适应掩码', pieces: ['全局时间分支', '局部时间分支', '有界异常损失'], image: 'stam' }, { name: 'SMST-AD', focus: '多尺度时空依赖', pieces: ['多尺度时间分支', '变量关系建模', '空间约束'], image: 'smst' }, { name: 'STMem-AD', focus: '正常模式记忆', pieces: ['时间特征编码', '正常模式检索', '记忆辅助重建'], image: 'stmem' }];
  const [open, setOpen] = useState<string | null>(null);
  return <><div className="model-rows">{models.map(m => <section key={m.name} className="model-row"><div><h2>{m.name}</h2><p>{m.focus}</p></div><div className="model-pieces">{m.pieces.map((piece, i) => <span key={piece}>{i > 0 && <Icon name="arrow" size={18} />}{piece}</span>)}</div><button className="text-button" aria-expanded={open === m.image} onClick={() => setOpen(open === m.image ? null : m.image)}>{open === m.image ? '收起原图' : '报告原图'}</button></section>)}</div>{open && <figure className="report-figure"><img src={`./assets/${open}.png`} alt={`${models.find(m => m.image === open)?.name} 报告原始架构图`} /><figcaption>原报告 · 第四章</figcaption></figure>}</>;
}

export function MetricsTable({ data, full = false }: { data: Research; full?: boolean }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="三模型报告指标"><table className="metrics-table"><caption className="sr-only">报告第 5.4 节，28 维风电结果</caption><thead><tr><th scope="col">模型</th>{full && <><th scope="col">维度 / 窗口</th><th scope="col">注入比例</th></>}<th scope="col">精确率</th><th scope="col">召回率</th><th scope="col">F1</th><th scope="col">AUC</th></tr></thead><tbody>{data.metrics.map(m => <tr key={m.model}><th scope="row">{m.model}</th>{full && <><td>{m.features} / {m.window}</td><td>{m.rate.toFixed(2)}</td></>}<td>{m.precision.toFixed(4)}</td><td>{m.recall.toFixed(4)}</td><td className="f1-value">{m.f1.toFixed(4)}</td><td>{m.auc.toFixed(4)}</td></tr>)}</tbody></table></div>;
}

export function Outcomes({ data, field, onField, start, onStart }: { data: Research; field: number; onField: (n: number) => void; start: number; onStart: (n: number) => void }) {
  return <div className="outcomes"><DataChart data={data} field={field} onField={onField} start={start} onStart={onStart} compact /><div className="outcomes-results"><div className="section-heading"><h2>三模型检测结果</h2><span>28 维 · 窗口 96</span></div><MetricsTable data={data} /></div><Note>风电实验 · 28 维输入 · 报告第 5.4 节</Note></div>;
}
