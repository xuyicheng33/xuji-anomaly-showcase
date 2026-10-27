import { useId, useState } from 'react';
import { DataChart, DataTable, FeatureMap, Formula, Icon, LineChart, Note, StreamOverview } from './components';
import { number } from './model';
import type { Cell, Research } from './types';
import type { ViewProps } from './PageView';
import { datasetIntroductions } from './content/copy';

const col = (key: string, label = key) => ({ key, label });
const sampledRows = (data: Research, indices: number[], fields: number[]) => indices.map(i => Object.fromEntries([['time', data.times[i]], ...fields.map(f => [data.features[f].key, data.values[i][f]])])) as Record<string, Cell>[];

function Overview() {
  return <div className="journey"><div className="journey-sources"><h2>五类原始数据</h2>{['实测气象', '气象预报', '功率统计', '短期功率预测', '超短期功率预测'].map(v => <div key={v}>{v}</div>)}</div><Icon name="arrow" size={30} /><div className="journey-dataset"><h2>合并后的数据集</h2><p>41 号电站在 2025 年 4 月 2 日至 7 月 2 日期间，共 <strong>8,759 条记录</strong>，每 15 分钟一条。</p><p>包含实际功率、预测功率、13 项实测气象和 13 项气象预报，共 <strong>28 个变量</strong>。</p></div><Icon name="arrow" size={30} /><div className="journey-models"><h2>三种异常检测模型</h2><div>STAM-AD</div><div>SMST-AD</div><div>STMem-AD</div><p>重建时间窗口，计算重建误差，依据异常分数与阈值识别异常。</p></div></div>;
}

function RawTable({ data, id }: { data: Research; id: number }) {
  const stream = data.streams[id - 3];
  const choices: Record<string, ReturnType<typeof col>[]> = {
    weather: [col('datatime', '实测时间'), col('stationid', '电站'), col('temperature', '温度'), col('humidity', '湿度'), col('pressure', '气压'), col('ws_10', '10 米风速'), col('ws_hub', '轮毂风速')],
    forecast: [col('forecast_fromtime', '预报批次'), col('datatime', '目标时间'), col('temperature', '温度'), col('humidity', '湿度'), col('ws_10', '10 米风速'), col('ws_hub', '轮毂风速')],
    powerstat: [col('statistictime', '统计时间'), col('actualpower', '实际功率'), col('forecastpower', '预测功率'), col('ermse', '均方根误差指标'), col('accuracyrate', '预测准确率'), col('qualifyrate', '合格率')],
    short: [col('forecast_fromtime', '预报批次'), col('forecastvaluetime', '目标时间'), col('actualvaluetime', '实际时间'), col('forecastvalue', '预测功率'), col('actualvalue', '实际功率')],
    ultrashort: [col('forecast_fromtime', '预报起点'), col('forecast_totime', '预报终点'), col('forecastvalue_01', '首位预测值'), col('forecastvalue_16', '末位预测值'), col('actualvalue', '末位对应实际功率')],
  };
  return <><p className="dataset-intro">{datasetIntroductions[stream.id]}</p><DataTable columns={choices[stream.id]} rows={stream.sample.slice(0, 6)} highlight={[stream.timeColumn]} caption={stream.name + '数据样例'} /><Note>{number(stream.files)} 份文件 · {number(stream.platformRows)} 条汇总记录 · {stream.id === 'powerstat' ? '样例：41 号电站' : '41 号电站'} · {stream.start.slice(0, 10)} 至 {stream.end.slice(0, 10)}</Note></>;
}

function SourceUse() {
  return <DataTable columns={[col('source', '数据来源'), col('fields', '选取内容'), col('count', '变量数')]} rows={[{ source: '短期功率预测', fields: '实际功率、原系统预测功率', count: 2 }, { source: '实测气象', fields: '温度、湿度、气压，以及五个高度的风速和风向', count: 13 }, { source: '气象预报', fields: '与实测气象对应的 13 项指标预报值', count: 13 }]} caption="三类数据的变量组成" />;
}

function TimeBands({ data, candidates = false }: { data: Research; candidates?: boolean }) {
  const rows = candidates ? data.candidates.map((c, i) => ({ name: `候选区间 ${i + 1}`, ...c, segments: [c], detail: `${number(c.rows)} 条原始样本` })) : [...data.streams.filter(s => s.used).map(s => ({ name: s.name, start: s.start, end: s.end, segments: s.coverage, detail: `${s.coverage.length - 1} 处时间缺口` })), { name: '最终连续区间', start: data.times[0], end: data.times.at(-1)!, segments: [{ start: data.times[0], end: data.times.at(-1)! }], detail: '8,759 个目标时刻' }];
  const stamp = (s: string) => Date.parse(s.replace(' ', 'T') + 'Z');
  const min = Date.UTC(2024, 10, 1), max = Date.UTC(2025, 7, 1);
  const position = (s: string) => (stamp(s) - min) / (max - min) * 100;
  return <div className="coverage-view">{rows.map((row, i) => <div className="coverage-row" key={row.name}><div className="coverage-label"><strong>{row.name}</strong><span>{row.start.slice(0, 10)} 至 {row.end.slice(0, 10)}</span></div><div className={`coverage-track ${i === 3 ? 'coverage-final' : ''}`} role="img" aria-label={`${row.name}，${row.detail}`}>{row.segments.map((segment, j) => <span key={j} title={`${segment.start} 至 ${segment.end}`} style={{ left: `${position(segment.start)}%`, width: `${(stamp(segment.end) - stamp(segment.start)) / (max - min) * 100}%` }} />)}</div><span className="coverage-detail">{row.detail}</span></div>)}<div className="coverage-axis"><div /> <div>{Array.from({ length: 9 }, (_, i) => { const date = new Date(Date.UTC(2024, 10 + i, 1)); return <span key={i} style={{ left: `${(date.getTime() - min) / (max - min) * 100}%` }}>{date.getUTCMonth() === 0 ? '2025 年 1 月' : `${date.getUTCMonth() + 1} 月`}</span>; })}</div><div /></div></div>;
}

function TimeGrid({ data, continuous = false }: { data: Research; continuous?: boolean }) {
  return continuous ? <DataTable columns={[col('time', '目标时刻'), col('next', '下一个目标时刻'), col('interval', '相邻间隔')]} rows={data.times.slice(0, 5).map((time, i) => ({ time, next: data.times[i + 1], interval: '15 分钟' }))} caption="相邻记录的时间连续性" /> : <DataTable columns={[col('time', '功率目标时刻'), col('weather', '实测气象时刻'), col('forecast', '气象预报目标时刻')]} rows={data.rawSample.slice(0, 5).map(row => ({ time: row.forecastvaluetime, weather: row.weather_datatime, forecast: row.forecast_datatime }))} highlight={['time']} caption="三类数据的时刻匹配" />;
}

function ChangeRecords({ data }: { data: Research }) {
  const [field, setField] = useState('weather_pressure');
  const rows = data.changes.filter(row => row['字段'] === field);
  return <><div className="controls"><label htmlFor="changed-field">变量</label><select id="changed-field" value={field} onChange={e => setField(e.target.value)}><option value="weather_pressure">气压 · 4 处</option><option value="weather_ws_hub">轮毂风速 · 58 处</option></select><span className="control-tail">62 处数值调整</span></div><DataTable columns={[col('目标时间'), col('原值', '调整前'), col('复现值', '调整后')]} rows={rows.slice(0, 7)} highlight={['复现值']} caption="气象数值调整对照" /><Note>{rows.length > 7 ? `前 7 处修改，共 ${rows.length} 处。` : '气压下界调整为 950.81。'}</Note></>;
}

function DuplicateRecords({ data }: { data: Research }) {
  const times = [...new Set(data.duplicateWeather.map(row => String(row.datatime)))];
  const [time, setTime] = useState(times[0]);
  return <><div className="controls"><label htmlFor="duplicate-time">重复时刻</label><select id="duplicate-time" value={time} onChange={event => setTime(event.target.value)}>{times.map(value => <option key={value}>{value}</option>)}</select></div><DataTable columns={[col('id', '记录编号'), col('savetime', '保存时间'), col('temperature', '温度'), col('humidity', '湿度'), col('pressure', '气压'), col('ws_hub', '轮毂风速')]} rows={data.duplicateWeather.filter(row => row.datatime === time)} caption="同一时刻的重复气象记录" /></>;
}

function Split({ data }: { data: Research }) {
  return <div className="split-view"><div className="split-top"><div><strong>训练集</strong><span>6,131 行</span></div><div><strong>测试集</strong><span>2,628 行</span></div></div><div className="split-band"><div style={{ flex: data.split }}>70%</div><div style={{ flex: data.times.length - data.split }}>30%</div></div><div className="split-dates"><span>{data.times[0]}</span><span>{data.times[data.split - 1]}<br />{data.times[data.split]}</span><span>{data.times.at(-1)}</span></div></div>;
}

function Statistics({ data, field, onField }: ViewProps) {
  const uid = useId();
  const f = data.features[field];
  return <><div className="controls"><label htmlFor={uid}>变量</label><select id={uid} value={field} onChange={e => onField(Number(e.target.value))}>{data.features.map((f, i) => <option key={f.key} value={i}>{f.group} · {f.label}</option>)}</select></div><DataTable columns={[col('field', '变量'), col('min', '训练段最小值'), col('max', '训练段最大值')]} rows={data.features.filter(v => v.group === f.group).map(v => ({ field: v.label, min: v.min, max: v.max }))} pageSize={5} caption="训练段变量统计" /></>;
}

function Normalization({ data }: { data: Research }) {
  const [field, setField] = useState(0);
  const labels = data.old.data.map((_, i) => String(i));
  return <><div className="controls"><label htmlFor="normalization-field">7 维实验变量</label><select id="normalization-field" value={field} onChange={e => setField(Number(e.target.value))}>{data.old.features.map((key, i) => <option value={i} key={key}>{data.features.find(f => f.key === key)?.label}</option>)}</select></div><div className="normalization-charts"><LineChart compact series={[{ name: '原始数值', values: data.old.data.map(row => row[field]) }]} labels={labels} /><LineChart compact series={[{ name: '处理后数值', values: data.old.processed.map(row => row[field]) }]} labels={labels} /></div><Formula>x′ = (x − min<sub>train</sub>) / (max<sub>train</sub> − min<sub>train</sub>)</Formula><Note>7 维实验 · 前 160 个训练点</Note></>;
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
  if (id === 9) return <DataTable columns={[col('name', '数据类别'), col('scope', '汇总表的电站范围'), col('platform', '汇总表记录数'), col('selected', '41 号电站记录数')]} rows={data.streams.map(s => ({ name: s.name, scope: s.id === 'powerstat' ? '各电站' : '41 号电站', platform: s.platformRows, selected: s.stationRows }))} highlight={['selected']} caption="汇总表中的电站范围" />;
  if (id === 10) return <DataTable columns={[col('source', '来源表'), col('time', '时间字段'), col('role', '提取内容')]} rows={[{ source: '短期功率预测', time: 'forecastvaluetime（预测目标时间）', role: 'actualvalue（实际功率）、forecastvalue（预测功率）' }, { source: '实测气象', time: 'datatime（观测时间）', role: '温度、湿度、气压，以及五个高度的风速和风向' }, { source: '气象预报', time: 'datatime（预报目标时间）', role: '对应的 13 项气象指标预报值' }]} caption="字段选择与中文含义" />;
  if (id === 11) return <DataTable columns={[col('forecastvaluetime', '预测目标时间'), col('actualvaluetime', '实际功率记录时间'), col('actualvalue', '实际功率'), col('forecastvalue', '预测功率')]} rows={data.rawSample.slice(0, 5)} highlight={['actualvaluetime']} caption="预测目标与实际功率记录时间" />;
  if (id === 12) return <DataTable columns={[col('forecastvaluetime', '预测目标时间'), col('forecast_fromtime', '短期功率预报批次'), col('forecast_forecast_fromtime', '气象预报批次'), col('forecastvalue', '功率预测值')]} rows={data.rawSample.slice(0, 5)} highlight={['forecast_fromtime', 'forecast_forecast_fromtime']} caption="目标日预报批次匹配" />;
  if (id === 13) return <DuplicateRecords data={data} />;
  if (id === 14) return <TimeBands data={data} />;
  if (id === 15 || id === 18) return <TimeGrid data={data} continuous={id === 18} />;
  if (id === 16) return <DataTable columns={[col('forecastvaluetime', '午夜目标时间'), col('forecast_forecast_fromtime', '采用的气象预报批次'), col('forecast_temperature', '预报温度'), col('forecast_ws_hub', '预报轮毂风速')]} rows={data.midnight} highlight={['forecast_forecast_fromtime']} caption="午夜时刻采用前一日预报" />;
  if (id === 17) return <DataTable columns={[col('forecastvaluetime', '目标时间'), col('actualvalue', '实际功率'), col('forecastvalue', '预测功率'), col('weather_temperature', '实测温度'), col('forecast_temperature', '预报温度'), col('weather_ws_hub', '实测轮毂风速'), col('forecast_ws_hub', '预报轮毂风速')]} rows={data.rawSample.slice(0, 5)} highlight={['forecastvaluetime']} caption="合并后的功率与气象记录" />;
  if (id === 19) return <TimeBands data={data} candidates />;
  if (id === 20) return <><DataChart {...props} compact /></>;
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
