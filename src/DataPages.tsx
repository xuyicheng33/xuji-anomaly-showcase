import { useId, useState } from 'react';
import { DataChart, DataTable, FeatureMap, Flow, Formula, Icon, LineChart, Note, StreamOverview } from './components';
import { number } from './model';
import type { Cell, Research } from './types';
import type { ViewProps } from './PageView';
import { datasetIntroductions } from './content/copy';

const col = (key: string, label = key) => ({ key, label });
const sampledRows = (data: Research, indices: number[], fields: number[]) => indices.map(i => Object.fromEntries([['time', data.times[i]], ...fields.map(f => [data.features[f].key, data.values[i][f]])])) as Record<string, Cell>[];

function Overview() {
  return <div className="journey"><div className="journey-sources"><h2>五类原始数据</h2>{['实测气象', '气象预报', '功率统计', '短期功率预测', '超短期功率预测'].map(v => <div key={v}>{v}</div>)}</div><Icon name="arrow" size={30} /><div className="journey-dataset"><h2>合并后的数据集</h2><p>41 号电站，共 <strong>8,759 条记录</strong>，每 15 分钟一条。</p><p>包含实际功率、预测功率、13 项实测气象和 13 项气象预报，共 <strong>28 个变量</strong>。</p><p className="dataset-period">2025 年 4 月 2 日至 7 月 2 日</p></div><Icon name="arrow" size={30} /><div className="journey-models"><h2>三种异常检测模型</h2><div>STAM-AD</div><div>SMST-AD</div><div>STMem-AD</div><p>重建时间窗口，计算重建误差，依据异常分数与阈值识别异常。</p></div></div>;
}

function RawTable({ data, id }: { data: Research; id: number }) {
  const stream = data.streams[id - 3];
  const choices: Record<string, ReturnType<typeof col>[]> = {
    weather: [col('datatime', '实测时间'), col('stationid', '电站'), col('temperature', '温度'), col('humidity', '湿度'), col('pressure', '气压'), col('ws_10', '10 米风速'), col('ws_hub', '轮毂风速')],
    forecast: [col('forecast_fromtime', '预报批次'), col('datatime', '目标时间'), col('temperature', '温度'), col('humidity', '湿度'), col('ws_10', '10 米风速'), col('ws_hub', '轮毂风速')],
    powerstat: [col('statistictime', '统计时间'), col('stationid', '电站'), col('forecasttype', '预测类别'), col('actualpower', '实际功率'), col('forecastpower', '预测功率'), col('pointnum', '点数')],
    short: [col('forecast_fromtime', '预报批次'), col('forecastvaluetime', '目标时间'), col('actualvaluetime', '实际时间'), col('forecastvalue', '预测功率'), col('actualvalue', '实际功率')],
    ultrashort: [col('forecast_fromtime', '预报起点'), col('forecast_totime', '预报终点'), col('forecastvalue_01', '第 1 点'), col('forecastvalue_02', '第 2 点'), col('actualvalue', '实际功率')],
  };
  return <><p className="dataset-intro">{datasetIntroductions[stream.id]}</p><div className="data-heading"><span>{number(stream.files)} 份文件</span><span>{number(stream.platformRows)} 条汇总记录{stream.id === 'powerstat' ? ' · 各电站' : ' · 41 号电站'}</span></div><DataTable columns={choices[stream.id]} rows={stream.sample.slice(0, 6)} highlight={[stream.timeColumn]} caption={stream.name + '数据样例'} /><Note>{stream.start.slice(0, 10)} — {stream.end.slice(0, 10)}</Note></>;
}

function SourceUse() {
  return <div className="merge-map"><div className="merge-branches">{[{ name: '短期功率预测', fields: '实际功率、预测功率', count: '2 个变量' }, { name: '实测气象', fields: '温度、湿度、气压、5 个高度的风速与风向', count: '13 个变量' }, { name: '气象预报', fields: '对应 13 项气象指标的预报值', count: '13 个变量' }].map(s => <div key={s.name}><h2>{s.name}<span>{s.count}</span></h2><p>{s.fields}</p></div>)}</div><div className="merge-connector"><Icon name="arrow" size={34} /></div><div className="merge-destination"><strong>28 个变量</strong><span>同一目标时刻，合并为一行</span></div></div>;
}

function TimeBands({ data, candidates = false }: { data: Research; candidates?: boolean }) {
  const rows = candidates ? data.candidates.map((c, i) => ({ name: `区间 ${i + 1}`, ...c, detail: `${number(c.rows)} 条原始样本` })) : data.streams.filter(s => s.used).map(s => ({ name: s.name, start: s.start, end: s.end, detail: `${s.start.slice(0, 10)} — ${s.end.slice(0, 10)}` }));
  const asTime = (s: string) => new Date(s.replace(' ', 'T')).getTime();
  const min = Math.min(...rows.map(r => asTime(r.start))), max = Math.max(...rows.map(r => asTime(r.end)));
  return <div className="time-bands">{rows.map((r, i) => <div className="time-band-row" key={r.name}><div><strong>{r.name}</strong><span>{r.start.slice(0, 16)} — {r.end.slice(0, 16)}</span></div><div className="time-band-track"><div className={candidates && i === 3 ? 'selected-band' : ''} style={{ left: `${(asTime(r.start) - min) / (max - min) * 100}%`, width: `${(asTime(r.end) - asTime(r.start)) / (max - min) * 100}%` }} /></div><span>{candidates ? r.detail : ''}</span></div>)}{!candidates && <div className="intersection"><span>最终共同使用范围</span><strong>{data.times[0]} — {data.times.at(-1)}</strong></div>}{candidates && <Note>第四段覆盖时间最长，按 15 分钟网格整理后得到 8,759 条记录。</Note>}</div>;
}

function TimeGrid({ data, continuous = false }: { data: Research; continuous?: boolean }) {
  return <><div className="grid-timeline">{data.times.slice(0, 12).map((t, i) => <div key={t}><span>{t.slice(11)}</span><i /><small>{continuous && i ? '+15 min' : i === 0 ? '起点' : '15 min'}</small></div>)}</div><div className="grid-matching">{continuous ? <><strong>8,759 个时刻连续</strong><span>缺失网格点 0 · 重复时间 0</span></> : <><strong>short.forecastvaluetime</strong><span>功率目标时刻 → 匹配实测气象与预报气象</span></>}</div><DataTable columns={[col('time', '目标时刻'), col('weather', '实测气象时刻'), col('forecast', '预报目标时刻')]} rows={data.rawSample.slice(0, 4).map(row => ({ time: row.forecastvaluetime, weather: row.weather_datatime, forecast: row.forecast_datatime }))} highlight={['time']} caption="三类数据的对齐时刻" /></>;
}

function ChangeRecords({ data }: { data: Research }) {
  const [field, setField] = useState('weather_pressure');
  const rows = data.changes.filter(row => row['字段'] === field);
  return <><div className="controls"><label htmlFor="changed-field">变量</label><select id="changed-field" value={field} onChange={e => setField(e.target.value)}><option value="weather_pressure">气压 · 4 处</option><option value="weather_ws_hub">轮毂风速 · 58 处</option></select><span className="control-tail">62 处数值调整</span></div><DataTable columns={[col('目标时间'), col('原值', '调整前'), col('复现值', '调整后')]} rows={rows.slice(0, 7)} highlight={['复现值']} caption="气象数值调整对照" /><Note>{rows.length > 7 ? `前 7 处修改，共 ${rows.length} 处。` : '气压下界调整为 950.81。'}</Note></>;
}

function Split({ data }: { data: Research }) {
  return <div className="split-view"><div className="split-top"><div><strong>训练集</strong><span>6,131 行</span></div><div><strong>测试集</strong><span>2,628 行</span></div></div><div className="split-band"><div style={{ flex: data.split }}>70%</div><div style={{ flex: data.times.length - data.split }}>30%</div></div><div className="split-dates"><span>{data.times[0]}</span><span>{data.times[data.split - 1]}<br />{data.times[data.split]}</span><span>{data.times.at(-1)}</span></div><div className="split-principle">保留时间顺序<span>训练段先于测试段</span></div></div>;
}

function Statistics({ data, field, onField }: ViewProps) {
  const uid = useId();
  const f = data.features[field];
  return <><div className="controls"><label htmlFor={uid}>变量</label><select id={uid} value={field} onChange={e => onField(Number(e.target.value))}>{data.features.map((f, i) => <option key={f.key} value={i}>{f.group} · {f.label}</option>)}</select><span className="control-tail">仅使用前 6,131 行</span></div><div className="minmax"><div><span>训练段最小值</span><strong>{number(f.min, 3)}{f.unit && <small>{f.unit}</small>}</strong></div><div className="minmax-line" /><div><span>训练段最大值</span><strong>{number(f.max, 3)}{f.unit && <small>{f.unit}</small>}</strong></div></div><div className="statistics-table"><DataTable columns={[col('group', '分组'), col('field', '变量'), col('min', '训练最小值'), col('max', '训练最大值')]} rows={data.features.filter(v => v.group === f.group).map(v => ({ group: v.group, field: v.label, min: v.min, max: v.max }))} caption="训练段变量统计" /></div></>;
}

function Normalization({ data }: { data: Research }) {
  const [field, setField] = useState(0);
  const labels = data.old.data.map((_, i) => String(i));
  return <><div className="controls"><label htmlFor="normalization-field">7 维实验变量</label><select id="normalization-field" value={field} onChange={e => setField(Number(e.target.value))}>{data.old.features.map((key, i) => <option value={i} key={key}>{data.features.find(f => f.key === key)?.label}</option>)}</select></div><div className="normalization-charts"><LineChart compact series={[{ name: '原始数值', values: data.old.data.map(row => row[field]) }]} labels={labels} /><LineChart compact series={[{ name: '处理后数值', values: data.old.processed.map(row => row[field]) }]} labels={labels} /></div><Formula label="训练段统计量用于统一数值尺度">x′ = (x − min<sub>train</sub>) / (max<sub>train</sub> − min<sub>train</sub>)</Formula><Note>7 维实验 · 前 160 个训练点</Note></>;
}

function Labels({ data, field, onField, values = false }: { data: Research; field: number; onField: (n: number) => void; values?: boolean }) {
  return <><div className="controls"><label htmlFor="label-field">变量</label><select id="label-field" value={field} onChange={e => onField(Number(e.target.value))}>{data.features.map((f, i) => <option key={f.key} value={i}>{f.group} · {f.label}</option>)}</select><span className="control-tail">测试标签 2,628 × 28 · 初始全 0</span></div>{values ? <DataTable columns={[col('time', '测试时刻'), col('value', data.features[field].label), col('label', '初始标签')]} rows={data.times.slice(data.split, data.split + 6).map((time, i) => ({ time, value: data.values[data.split + i][field], label: 0 }))} highlight={['label']} caption="输入值与初始标签对应" /> : <><div className="label-matrix" role="img" aria-label="测试输入的 28 个变量标签初始全为零">{Array.from({ length: 8 }, (_, i) => <div key={i}>{Array.from({ length: 28 }, (_, j) => <span key={j} className={j === field ? 'selected' : ''}>0</span>)}</div>)}</div><Note>前 8 个测试时刻 · 选中变量：{data.features[field].label}</Note></>}</>;
}

export function DataPages(props: ViewProps) {
  const { id, data, field, onField } = props;
  if (id === 1) return <Overview />;
  if (id === 2) return <StreamOverview data={data} />;
  if (id >= 3 && id <= 7) return <RawTable data={data} id={id} />;
  if (id === 8) return <SourceUse />;
  if (id === 9) return <><DataTable columns={[col('name', '资料'), col('raw', '原始分片记录'), col('platform', '平台表记录'), col('selected', '平台内电站 41')]} rows={data.streams.map(s => ({ name: s.name, raw: s.rawRows, platform: s.platformRows, selected: s.stationRows }))} highlight={['selected']} caption="来源范围与站点筛选" /><Note>短期汇总从 2024-11-21 批次开始，超短期汇总从 2024-11-19 批次开始。</Note></>;
  if (id === 10) return <><DataTable columns={[col('source', '资料'), col('time', '合并时间键'), col('features', '研究变量'), col('role', '变量组成')]} rows={[{ source: 'short', time: 'forecastvaluetime', features: 2, role: 'actualvalue · forecastvalue' }, { source: 'weatherdata', time: 'datatime', features: 13, role: '温度 · 湿度 · 气压 · 风速 · 风向' }, { source: 'weatherforecast', time: 'datatime + 预报批次', features: 13, role: '对应的 13 个预报气象变量' }]} highlight={['features']} caption="进入合并的三种行结构" /><div className="grid-matching"><strong>2 + 13 + 13 = 28</strong><span>同一目标时间横向拼接</span></div></>;
  if (id === 11) return <><DataTable columns={[col('forecastvaluetime', '目标网格时间'), col('actualvaluetime', '原始实际时间'), col('actualvalue', '实际功率'), col('forecastvalue', '预测功率')]} rows={data.rawSample.slice(0, 6)} highlight={['actualvaluetime']} caption="保留秒值的实际记录" /><Note>实际功率在 18:15:04 记录，对应 18:15 的预测目标时刻。</Note></>;
  if (id === 12) return <><Flow steps={[{ title: '目标时间', detail: '2025-04-02 18:15' }, { title: '目标日批次', detail: '2025-04-02 00:00' }, { title: '对应预报', detail: '功率 + 气象' }]} /><DataTable columns={[col('forecastvaluetime', '目标时间'), col('forecast_fromtime', '功率批次'), col('forecast_forecast_fromtime', '气象预报批次')]} rows={data.rawSample.slice(0, 4)} highlight={['forecast_fromtime', 'forecast_forecast_fromtime']} caption="目标日批次匹配" /></>;
  if (id === 13) return <><Flow steps={[{ title: '实测气象匹配', detail: '8,763 条匹配记录' }, { title: '去除额外重复', detail: '4 条数值相同记录' }, { title: '一时刻一行', detail: '8,759 条最终记录' }]} /><div className="check-line"><Icon name="check" /><span>28 个变量缺失值</span><strong>0</strong></div></>;
  if (id === 14) return <TimeBands data={data} />;
  if (id === 15 || id === 18) return <TimeGrid data={data} continuous={id === 18} />;
  if (id === 16) return <><div className="midnight-boundary"><span>前一日预报批次</span><Icon name="arrow" size={28} /><strong>00:00</strong><Icon name="arrow" size={28} /><span>91 个跨日时刻</span></div><DataTable columns={[col('forecastvaluetime', '目标时间'), col('forecast_forecast_fromtime', '气象预报批次'), col('forecast_temperature', '预报温度'), col('forecast_ws_hub', '预报轮毂风速')]} rows={data.midnight} highlight={['forecast_forecast_fromtime']} caption="跨日预报记录" /></>;
  if (id === 17) return <><div className="data-heading"><span>每一行对应一个目标时刻</span><span>功率 + 实测气象 + 预报气象</span></div><DataTable columns={[col('forecastvaluetime', '目标时间'), col('actualvalue', '实际功率'), col('forecastvalue', '预测功率'), col('weather_temperature', '实测温度'), col('forecast_temperature', '预报温度'), col('weather_ws_hub', '实测轮毂风速'), col('forecast_ws_hub', '预报轮毂风速')]} rows={data.rawSample.slice(0, 6)} highlight={['forecastvaluetime']} caption="对齐后的宽表" /></>;
  if (id === 19) return <TimeBands data={data} candidates />;
  if (id === 20) return <><div className="date-range"><span>{data.times[0]}</span><Icon name="arrow" size={28} /><span>{data.times.at(-1)}</span></div><DataChart {...props} compact /><Note>每 15 分钟一条，共 8,759 条记录。</Note></>;
  if (id === 21) return <ChangeRecords data={data} />;
  if (id === 22) return <FeatureMap data={data} field={field} onField={onField} />;
  if (id === 23) return <Split data={data} />;
  if (id === 24) return <div className="sample-sections">{[{ label: '训练段末尾', indices: [6128, 6129, 6130] }, { label: '测试段开头', indices: [6131, 6132, 6133] }].map(s => <section key={s.label}><h2>{s.label}</h2><DataTable columns={[col('time', '目标时间'), ...[0, 1, 2, 15].map(i => col(data.features[i].key, (i === 2 ? '实测' : i === 15 ? '预报' : '') + data.features[i].label))]} rows={sampledRows(data, s.indices, [0, 1, 2, 15])} caption={s.label} /></section>)}</div>;
  if (id === 25) return <Statistics {...props} />;
  if (id === 26) return <Normalization data={data} />;
  if (id === 27) return <div className="validation-list">{[['输入行数', '8,759'], ['研究变量 / 合并列', '28 / 42'], ['变量缺失值', '0'], ['重复时间 / 缺失网格点', '0 / 0'], ['训练 / 测试', '6,131 / 2,628'], ['逐行来源映射', '8,759 条']].map(([label, value]) => <div className="check-line" key={label}><Icon name="check" /><span>{label}</span><strong>{value}</strong></div>)}</div>;
  if (id === 28 || id === 29) return <Labels data={data} field={field} onField={onField} values={id === 29} />;
  throw new Error(`Unhandled data page ${id}`);
}
