import { useId, useState } from 'react';
import { DataTable, Flow, Formula, Icon, MetricsTable, Note, Outcomes } from './components';
import { LabelStrip } from './MethodPages';
import { pages, sourceIds, stepHash } from './model';
import type { ViewProps } from './PageView';
import { sourceDescriptions } from './content/copy';

function ErrorMatrix() {
  return <div className="error-layout"><Formula label="窗口内的平方误差">e<sub>w,t,c</sub> = (x<sub>t,c</sub> − x̂<sub>w,t,c</sub>)²</Formula><div className="symbolic-matrix" role="img" aria-label="窗口误差符号矩阵，行代表时间，列代表特征"><div className="matrix-column-label">变量 c</div>{Array.from({ length: 4 }, (_, i) => <div key={i}>{Array.from({ length: 7 }, (_, j) => <span key={j}>e<sub>{i + 1},{j + 1}</sub></span>)}</div>)}<p>时间 t</p></div></div>;
}

function Overlap() {
  const uid = useId();
  const [point, setPoint] = useState(4);
  const windows = [[0, 4], [1, 5], [2, 6], [3, 7]];
  const covered = windows.filter(([a, b]) => a <= point && b >= point).length;
  return <><div className="controls"><label htmlFor={uid}>查看覆盖位置</label><input id={uid} type="range" min={0} max={7} value={point} onChange={e => setPoint(Number(e.target.value))} /><output>t{point} · {covered} 次覆盖</output></div><div className="overlap-diagram">{windows.map(([a, b], i) => <div key={i}><span>窗口 {i + 1}</span>{Array.from({ length: 8 }, (_, j) => <i key={j} className={`${j >= a && j <= b ? 'covered' : ''} ${j === point ? 'target-point' : ''}`}>{j >= a && j <= b ? `t${j}` : ''}</i>)}</div>)}</div><Formula>ē<sub>t,c</sub> = Σ<sub>w∈Ω(t)</sub> e<sub>w,t,c</sub> / |Ω(t)|</Formula><Note>边界覆盖次数较少，仍按实际次数平均。</Note></>;
}

function FeatureScore() {
  return <><div className="aggregation"><div className="aggregation-features">{['ēt,1', 'ēt,2', 'ēt,3', '…', 'ēt,28'].map(s => <span key={s}>{s}</span>)}</div><Icon name="arrow" size={32} /><div className="aggregation-score"><strong>s<sub>t</sub></strong><span>单个时刻的异常分数</span></div></div><Formula>s<sub>t</sub> = (1 / C) · Σ<sub>c=1…C</sub> ē<sub>t,c</sub></Formula><Note>28 个变量的平均重建误差构成该时刻的异常分数。</Note></>;
}

function Threshold() {
  return <><Flow steps={[{ title: '训练分数', detail: '读取训练段的重建异常分数，确定分布尾部' }, { title: '尾部建模', detail: 'SPOT 拟合极值分布，计算对应阈值' }, { title: '阈值修正', detail: '阈值取平均后，乘以配置中的修正系数' }]} /><Formula>τ = mean(τ<sub>SPOT</sub>) × lm[1]</Formula></>;
}

function Decision() {
  return <><div className="decision-equation"><span>s<sub>t</sub> &gt; τ</span><Icon name="arrow" size={32} /><strong>ŷ<sub>t</sub> = 1</strong></div><div className="decision-paths"><section><h2>逐点判定</h2><p>分数超过阈值，标记该时刻异常。</p></section><section><h2>评价阶段点调整</h2><p>评价时利用真实标签区间，将已检出的异常段补齐。</p></section></div></>;
}

function LabelComparison({ data }: Pick<ViewProps, 'data'>) {
  const [start, setStart] = useState(0);
  return <><div className="section-heading"><h2>7 维实验测试标签</h2><span>任一变量异常，该时刻记为异常</span></div><LabelStrip labels={data.old.inserted_labels.slice(start, start + 160)} /><div className="range-control"><label htmlFor="compare-labels">标签片段</label><input id="compare-labels" type="range" min={0} max={1592} value={start} onChange={e => setStart(Number(e.target.value))} /><output>t{start}—t{start + 159}</output></div><div className="label-comparison"><div><strong>y<sub>t</sub></strong><span>异常标签 y</span></div><Icon name="arrow" size={28} /><div><strong>ŷ<sub>t</sub></strong><span>检测判定 ŷ</span></div><Icon name="arrow" size={28} /><div><strong>TP · FP · FN · TN</strong><span>逐点对照与统计</span></div></div><Note>橙色表示异常时刻。</Note></>;
}

function Confusion() {
  const [active, setActive] = useState('TP');
  const definitions: Record<string, string> = { TP: '真实异常，模型判为异常。', FN: '真实异常，模型判为正常。', FP: '真实正常，模型判为异常。', TN: '真实正常，模型判为正常。' };
  return <><div className="confusion-matrix"><div /><div>判为异常</div><div>判为正常</div><div>真实异常</div>{['TP', 'FN'].map(v => <button key={v} onClick={() => setActive(v)} aria-pressed={active === v}><strong>{v}</strong><span>{v === 'TP' ? '检出' : '漏检'}</span></button>)}<div>真实正常</div>{['FP', 'TN'].map(v => <button key={v} onClick={() => setActive(v)} aria-pressed={active === v}><strong>{v}</strong><span>{v === 'FP' ? '误报' : '正确正常'}</span></button>)}</div><p className="confusion-definition" aria-live="polite">{definitions[active]}</p></>;
}

function MetricDefinitions() {
  return <div className="metric-definitions"><section><h2>精确率（Precision）</h2><Formula>TP / (TP + FP)</Formula><p>判为异常的时刻中，有多少确为异常。</p></section><section><h2>召回率（Recall）</h2><Formula>TP / (TP + FN)</Formula><p>真实异常时刻中，有多少被检出。</p></section><section><h2>F1</h2><Formula>2PR / (P + R)</Formula><p>Precision 与 Recall 的调和平均。</p></section><section><h2>曲线下面积（AUC）</h2><Formula>ROC 曲线下面积</Formula><p>ROC 曲线下面积，衡量检测结果的区分能力。</p></section></div>;
}

function Sources({ provenance }: ViewProps) {
  const [query, setQuery] = useState('');
  const sources = provenance.sources.filter(s => `${s.title} ${s.file} ${s.version}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="materials-layout"><div className="version-rows"><div><strong>28 维数据集</strong><span>8,759 行 · 训练 6,131 行 / 测试 2,628 行</span><span>功率与气象数据</span></div><div><strong>28 维实验结果</strong><span>3 种模型 · 窗口 96</span><span>报告第 5.4 节</span></div><div><strong>7 维实验记录</strong><span>训练 7,007 行 / 测试 1,752 行 · 窗口 64</span><span>STMem-AD 参数与训练记录</span></div></div><div className="materials-browser"><div className="source-tools"><label htmlFor="source-query">查找材料</label><input id="source-query" type="search" placeholder="报告、数据或模型" value={query} onChange={e => setQuery(e.target.value)} /><span>{sources.length} 项</span></div><div className="source-inventory">{sources.length === 0 ? <p role="status">没有匹配材料。请更换关键词。</p> : sources.map(s => <details key={s.id}><summary><span>{s.title}</span><span>{s.version}</span></summary><div><p>{sourceDescriptions[s.id] || s.title}</p><code>{s.file}</code><div className="source-page-links">{pages.filter(p => sourceIds(p.id).includes(s.id)).map(p => <a key={p.id} href={stepHash(p.id)}>{String(p.id).padStart(2, '0')} {p.title}</a>)}</div></div></details>)}</div></div></div>;
}

export function ResultPages(props: ViewProps) {
  const { id, data } = props;
  if (id === 50) return <Flow steps={[{ title: '测试输入', detail: '2,628 行 × 28 维' }, { title: '固定窗口', detail: '按时间顺序读取' }, { title: '固定模型', detail: '参数保持不变' }, { title: '窗口重建', detail: '与输入逐位置对齐' }]} />;
  if (id === 51) return <ErrorMatrix />;
  if (id === 52) return <Overlap />;
  if (id === 53) return <FeatureScore />;
  if (id === 54) return <Threshold />;
  if (id === 55) return <Decision />;
  if (id === 56) return <LabelComparison data={data} />;
  if (id === 57) return <Outcomes {...props} />;
  if (id === 58) return <Confusion />;
  if (id === 59) return <MetricDefinitions />;
  if (id === 60) return <><MetricsTable data={data} full /><div className="ablation-results"><h2>报告中的维度消融</h2><DataTable columns={[{ key: 'model', label: '模型' }, { key: 'f7', label: '7 维 F1' }, { key: 'f28', label: '28 维 F1' }]} rows={[{ model: 'SMST-AD', f7: '0.6235', f28: '0.8347' }, { model: 'STMem-AD', f7: '0.5855', f28: '0.8237' }]} caption="报告 7 维与 28 维消融记录" /></div></>;
  if (id === 61) return <Sources {...props} />;
  throw new Error(`Unhandled result page ${id}`);
}
