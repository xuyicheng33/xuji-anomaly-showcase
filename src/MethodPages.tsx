import { useId, useState } from 'react';
import { DataTable, Flow, Formula, Icon, LineChart, ModelOverview, Note } from './components';
import { number } from './model';
import type { Research } from './types';
import type { ViewProps } from './PageView';

export function LabelStrip({ labels, field = -1 }: { labels: number[][]; field?: number }) {
  return <div className="label-strip" role="img" aria-label="异常标签，橙色表示标签为 1">{labels.map((row, i) => <i key={i} className={(field < 0 ? row.some(Boolean) : row[field] > 0) ? 'anomalous' : ''} />)}</div>;
}

export function SavedAnomalies({ data }: { data: Research }) {
  const [field, setField] = useState(0), [start, setStart] = useState(0);
  const uid = useId();
  const values = data.old.inserted_values.slice(start, start + 160);
  const labels = data.old.inserted_labels.slice(start, start + 160);
  return <><div className="controls"><label htmlFor={uid}>7 维实验变量</label><select id={uid} value={field} onChange={e => setField(Number(e.target.value))}>{data.old.features.map((f, i) => <option key={f} value={i}>{data.features.find(v => v.key === f)?.label}</option>)}</select><span className="control-tail">7 维实验 · 测试集 1,752 行</span></div><LineChart compact series={[{ name: '插入异常后的序列', values: values.map(row => row[field]) }]} labels={values.map((_, i) => `t${i + start}`)} /><LabelStrip labels={labels} field={field} /><div className="range-control"><label htmlFor={`${uid}-range`}>时间片段</label><input id={`${uid}-range`} type="range" min={0} max={data.old.inserted_values.length - 160} value={start} onChange={e => setStart(Number(e.target.value))} /><output>t{start}—t{start + 159}</output></div><Note>橙色表示异常标签。全测试集含 {data.old.positiveTimes} 个异常时刻、{data.old.positiveCells} 个异常变量位置。</Note></>;
}

function AnomalyFigure({ id }: { id: number }) {
  const keys = ['soft', 'uniform', 'peak', 'length'];
  const introductions = ['将原片段与另一片段加权融合，改变局部变化模式。', '用同一个常数替换选中区间，形成持续不变的数值段。', '在局部位置加入突增或突降，并标记对应邻域。', '对局部片段重采样，改变该片段的时间变化速度。'];
  const formulas = ['x̃ = (1 − α) · x + α · x′', 'x̃[t₀:t₁, c] = k', '局部数值扰动 → patch 邻域标签', '片段重采样 → 时间伸缩'];
  return <><p className="dataset-intro">{introductions[id - 32]}</p><div className="anomaly-pair"><figure><img src="./assets/anomaly-original.png" alt="原报告中的原始时间窗口" /><figcaption>原始窗口</figcaption></figure><span><Icon name="arrow" size={30} /></span><figure><img src={`./assets/anomaly-${keys[id - 32]}.png`} alt={`原报告中的${['软替换', '均匀替换', '峰值噪声', '长度调整'][id - 32]}示例`} /><figcaption>{formulas[id - 32]}</figcaption></figure></div><Note>红色标记异常位置 · 报告图 3-2</Note></>;
}

function Blocks() {
  return <><DataTable columns={[{ key: 'item', label: '处理内容' }, { key: 'rule', label: '规则' }]} rows={[{ item: '块内取样', rule: '选择异常起点、变量、持续长度与替换类型' }, { item: '边界补齐', rule: '末块不足指定长度时重复末值，拼接后裁回原长' }, { item: '序列拼接', rule: '按原时间顺序连接各块，保持数值与标签位置一致' }, { item: '标签合并', rule: '原有标签或新增标签为 1，该位置的最终标签即为 1' }]} caption="不重叠块的异常处理规则" /><Formula>Y<sub>final</sub> = Y<sub>saved</sub> ∨ Y<sub>inserted</sub></Formula></>;
}

function WindowReader({ data, field, onField }: ViewProps) {
  const [position, setPosition] = useState(96);
  const uid = useId();
  const times = data.times.slice(0, 192);
  const feature = data.features[field];
  return <><div className="controls"><label htmlFor={uid}>窗口位置</label><input id={uid} type="range" min={96} max={191} value={position} onChange={e => setPosition(Number(e.target.value))} /><output>t{position - 95}—t{position}</output></div><div className="window-chart"><LineChart series={[{ name: feature.label, values: data.values.slice(0, 192).map(row => row[field]) }]} labels={times} unit={feature.unit} compact selection={[position - 95, position]} /></div><div className="window-summary"><strong>96 × 28</strong><span>{times[position - 95]} — {times[position]}</span><select aria-label="滑窗变量" value={field} onChange={e => onField(Number(e.target.value))}>{data.features.map((f, i) => <option key={f.key} value={i}>{f.group} · {f.label}</option>)}</select></div></>;
}

function Padding() {
  return <div className="padding-view"><section><h2>前缀滑动窗口</h2><div className="token-sequence"><span className="repeated">x₀</span><span className="repeated">x₀</span><span>…</span><span>x₀</span><span>x₁</span><span>x₂</span></div><p>历史不足时重复首个观测值</p></section><section><h2>不重叠分块</h2><div className="token-sequence"><span>x<sub>N−2</sub></span><span>x<sub>N−1</sub></span><span className="repeated">x<sub>N−1</sub></span><span className="repeated">…</span><span className="repeated">x<sub>N−1</sub></span></div><p>末块重复末值；合并后裁回原长</p></section><Note>TCN 因果卷积在左侧补零，以保持时间方向。</Note></div>;
}

function Tensor({ output = false }: { output?: boolean }) {
  return <div className="tensor-view"><div className="tensor-stack" aria-label="批次、窗口长度、特征数三个轴">{[2, 1, 0].map(i => <div key={i} style={{ transform: `translate(${i * 16}px, ${-i * 16}px)` }}>{Array.from({ length: 48 }, (_, j) => <i key={j} />)}</div>)}<span className="tensor-axis-b">B · 批次</span><span className="tensor-axis-w">W · 时间窗口</span><span className="tensor-axis-c">C · 特征</span></div><div className="tensor-spec"><Formula>{output ? 'X̂' : 'X'} ∈ ℝ<sup>B × W × C</sup></Formula><div><span>28 维实验</span><strong>B × 96 × 28</strong></div><div><span>7 维实验</span><strong>B × 64 × 7</strong></div></div></div>;
}

function Reconstruction() {
  return <div className="reconstruction"><div className="shape-node"><strong>X</strong><span>B × W × C</span><p>输入窗口</p></div><Icon name="arrow" size={30} /><div className="model-function"><strong>f<sub>θ</sub></strong><span>编码 · 依赖建模 · 解码</span></div><Icon name="arrow" size={30} /><div className="shape-node"><strong>X̂</strong><span>B × W × C</span><p>重建窗口</p></div><div className="reconstruction-caption">逐窗口、逐时间点、逐特征对齐</div></div>;
}

function Losses() {
  return <><Formula label="重建目标">L<sub>recon</sub> = mean((X − X̂)²)</Formula><div className="loss-list">{[['STAM-AD', '重建目标', '自适应掩码与有界异常损失'], ['SMST-AD', '重建目标', '多尺度时空关系与空间约束'], ['STMem-AD', '重建目标', '正常模式记忆与记忆约束']].map(([model, main, extra]) => <div key={model}><strong>{model}</strong><span>{main}</span><Icon name="arrow" /><span>{extra}</span></div>)}</div></>;
}

function History({ data }: { data: Research }) {
  const [image, setImage] = useState(false);
  return <><div className="section-heading"><h2>STMem-AD · 7 维实验</h2><button className="text-button" onClick={() => setImage(!image)} aria-expanded={image}>{image ? '收起原图' : '训练原图'}</button></div>{image ? <figure className="report-figure"><img src="./assets/old7-training.png" alt="服务器保存的旧版 7 维风电训练图" /><figcaption>STMem-AD · 7 维实验</figcaption></figure> : <div className="history-layout"><LineChart compact series={[{ name: '训练损失', values: data.old.history.map(row => row[0]) }]} labels={data.old.history.map((_, i) => `第 ${i + 1} 轮`)} /><DataTable columns={[{ key: 'epoch', label: '轮次（Epoch）' }, { key: 'loss', label: '训练损失' }, { key: 'lr', label: '学习率' }]} rows={data.old.history.map((row, i) => ({ epoch: i + 1, loss: row[0].toFixed(8), lr: row[1].toExponential(1) }))} caption="7 维实验训练记录" /></div>}</>;
}

function Checkpoint({ data }: { data: Research }) {
  return <div className="checkpoint-view"><div className="checkpoint-file"><svg width="70" height="86" viewBox="0 0 70 86" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 2h32l20 20v60H9zM41 2v21h20M22 43h26M22 53h26M22 63h17" /></svg><h2>model.ckpt</h2><p>STMem-AD · 7 维风电实验</p><span>7 维 · 窗口 64</span></div><dl className="checkpoint-fields">{data.old.checkpoint.keys.map(key => <div key={key}><dt>{key}（{{ epoch: '训练轮次', model_state_dict: '模型参数', optimizer_state_dict: '优化器状态', scheduler_state_dict: '学习率调度状态', accuracy_list: '训练记录' }[key] || '保存状态'}）</dt><dd>{key === 'epoch' ? data.old.checkpoint.epoch : key === 'accuracy_list' ? '5 轮损失与学习率' : key === 'model_state_dict' ? `${number(data.old.checkpoint.state_entries)} 个参数与状态项` : key === 'optimizer_state_dict' ? '优化器状态' : '学习率调度状态'}</dd></div>)}</dl></div>;
}

export function MethodPages(props: ViewProps) {
  const { id, data } = props;
  if (id === 30) return <div className="replacement-types"><section><h2>直接替换</h2><Formula>x̃[t₀:t₁, c] = r</Formula><p>选中片段由替换值覆盖</p></section><section><h2>软混合</h2><Formula>x̃ = (1 − α)x + αx′</Formula><p>原片段与替换片段逐点加权</p></section><Note>α 控制替换片段在混合结果中的权重。</Note></div>;
  if (id === 31) return <Blocks />;
  if (id >= 32 && id <= 35) return <AnomalyFigure id={id} />;
  if (id === 36) return <SavedAnomalies data={data} />;
  if (id === 37) return <><Flow steps={[{ title: '本轮开始', detail: '读取当前训练序列' }, { title: '重新插入', detail: '选择块、位置、变量与类型' }, { title: '读取窗口', detail: '同步使用本轮标签' }, { title: '参数更新', detail: '进入下一轮' }]} /></>;
  if (id === 38) return <SavedAnomalies data={data} />;
  if (id === 39) return <><DataTable columns={[{ key: 'type', label: '异常类型' }, { key: 'train', label: '训练阶段' }, { key: 'test', label: '测试阶段' }]} rows={['软替换', '均匀替换', '峰值噪声', '长度调整'].map(type => ({ type, train: '每轮训练前刷新', test: '测试前固定一次' }))} caption="四类异常与两种插入时机" /></>;
  if (id === 40) return <WindowReader {...props} />;
  if (id === 41) return <Padding />;
  if (id === 42) return <Tensor />;
  if (id === 43) return <ModelOverview />;
  if (id === 44) return <><Flow steps={[{ title: '窗口 X', detail: 'B × W × C' }, { title: '标签 Y', detail: '与窗口逐位置对齐' }, { title: '自适应掩码', detail: '选择参与重建的位置' }, { title: '模型输入', detail: '带掩码的训练批次' }]} /><Formula label="训练输入结构">窗口值 + 异常标签 + 掩码</Formula></>;
  if (id === 45) return <Reconstruction />;
  if (id === 46) return <Losses />;
  if (id === 47) return <><Flow steps={[{ title: '前向计算', detail: 'X → fθ(X)' }, { title: '计算损失', detail: '重建目标与模型约束' }, { title: '反向传播', detail: 'loss.backward()' }, { title: '更新参数', detail: 'optimizer.step()' }]} /><div className="update-equation">θ → θ′<span>根据损失梯度更新模型参数</span></div></>;
  if (id === 48) return <History data={data} />;
  if (id === 49) return <Checkpoint data={data} />;
  throw new Error(`Unhandled method page ${id}`);
}
