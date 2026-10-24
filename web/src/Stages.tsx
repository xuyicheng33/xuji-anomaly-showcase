import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Database,
  Layers,
  Play,
  Search,
  RefreshCw,
  SlidersHorizontal,
  Clock,
  HardDrive,
  ArrowDown,
  CheckCircle2,
  TriangleAlert,
  Square,
  Download,
} from "lucide-react";
import { Chart, lines, colors } from "./Chart";
import { api, column, fmt, pct } from "./data";
import type {
  Arrays,
  Catalog,
  Dataset,
  DatasetId,
  Experiment,
  Injection,
  Job,
  ModelId,
} from "./types";
type Props = {
  step: number;
  dataset: DatasetId;
  ds: Dataset;
  cat: Catalog;
  exp?: Experiment;
  arrays?: Arrays;
  model: ModelId;
  onModel: (m: ModelId) => void;
  goto: (s: number) => void;
  refresh: () => Promise<void>;
  selectExperiment: (exp: Experiment) => void;
};
const headings = [
  ["项目概览", ""],
  ["数据概况", ""],
  ["测点数据", ""],
  ["数据清洗", ""],
  ["数据划分", ""],
  ["模型输入", ""],
  ["异常构造", ""],
  ["模型结构", ""],
  ["训练管理", ""],
];
export function Title({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {right}
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className="mono">
        {typeof value === "number" ? fmt(value, 0) : value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <details className="material-note">
      <summary>数据说明</summary>
      <div>{children}</div>
    </details>
  );
}
export function Stages(p: Props) {
  return (
    <>
      {p.step !== 1 && (
        <Title
          title={headings[p.step - 1][0]}
          description={headings[p.step - 1][1]}
        />
      )}
      {p.step === 1 ? (
        <Overview {...p} />
      ) : p.step === 2 ? (
        <DataOverview {...p} />
      ) : p.step === 3 ? (
        <RawData {...p} />
      ) : p.step === 4 ? (
        <Cleaning {...p} />
      ) : p.step === 5 ? (
        <Split {...p} />
      ) : p.step === 6 ? (
        <Windows {...p} />
      ) : p.step === 7 ? (
        <Anomalies {...p} />
      ) : p.step === 8 ? (
        <Models {...p} />
      ) : (
        <Training {...p} />
      )}
    </>
  );
}
function Overview(p: Props) {
  const opt = useMemo(
    () =>
      lines(
        [
          {
            name: "异常分数",
            data: p.arrays ? Array.from(p.arrays.scores.slice(0, 500)) : [],
            color: colors.score,
          },
        ],
        {
          grid: { left: 38, right: 20, top: 15, bottom: 30 },
          legend: { show: false },
          xAxis: { type: "category", show: false },
          yAxis: { type: "value", show: false },
          series: [
            {
              type: "line",
              data: p.arrays ? Array.from(p.arrays.scores.slice(0, 500)) : [],
              showSymbol: false,
              lineStyle: { color: colors.score, width: 2 },
              areaStyle: { color: "rgba(107,70,193,.05)" },
              markLine: {
                symbol: "none",
                label: {
                  show: true,
                  formatter: "判断阈值",
                  position: "insideEndTop",
                  color: "#8e5b3f",
                  fontSize: 11,
                },
                lineStyle: { color: "#b77854", type: "dashed" },
                data: p.exp ? [{ yAxis: p.exp.threshold }] : [],
              },
              markArea: {
                silent: true,
                itemStyle: { color: "rgba(217,119,6,.1)" },
                data: p.arrays
                  ? Array.from(p.arrays.labels.slice(0, 500))
                      .map((v, i) =>
                        v ? [{ xAxis: i }, { xAxis: i + 1 }] : null,
                      )
                      .filter(Boolean)
                  : [],
              },
            },
          ],
        },
      ),
    [p.arrays],
  );
  return (
    <>
      <div className="hero-layout">
        <div className="hero-story">
          <span className="hero-kicker">
            <span />
            工业时序分析
          </span>
          <h1>
            工业数据
            <br />
            异常检测
          </h1>
          <div className="hero-actions">
            <button className="primary" onClick={() => p.goto(10)}>
              <Play size={16} />
              进入检测
              <ArrowRight size={16} />
            </button>
            <button className="text-button" onClick={() => p.goto(2)}>
              查看数据
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-top">
            <span>
              {p.ds.short} · {p.ds.models.find((m) => m.id === p.model)?.name}
            </span>
            <span className="mono">测试 {fmt(p.ds.test, 0)} 点</span>
          </div>
          <div className="mini-track">
            <span>异常分数</span>
            <Chart option={opt} height={220} />
          </div>
          <div className="visual-caption">
            <i />
            <span>构造异常区间</span>
          </div>
        </div>
      </div>
    </>
  );
}
function DataOverview(p: Props) {
  return (
    <>
      <div className="dataset-cards">
        {Object.entries(p.cat.datasets).map(([id, ds]) => (
          <div
            className={"dataset-card " + (id === p.dataset ? "selected" : "")}
            key={id}
          >
            <div className="section-title">
              <h2>{ds.name}</h2>
              <span className={id === p.dataset ? "badge" : "subtle-badge"}>
                {id === p.dataset ? "当前数据集" : "已接入"}
              </span>
            </div>
            <p>{ds.period}</p>
            <div className="stats-row">
              <Stat label="建模时刻" value={ds.total} />
              <Stat label="变量维度" value={ds.features} />
            </div>
            <div className="data-facts">
              <span>
                训练集 <b className="mono">{fmt(ds.train, 0)}</b>
              </span>
              <span>
                测试集 <b className="mono">{fmt(ds.test, 0)}</b>
              </span>
              <span>
                历史划分{" "}
                <b>
                  {Math.round(ds.split * 100)} :{" "}
                  {Math.round((1 - ds.split) * 100)}
                </b>
              </span>
            </div>
            <div className="dataset-footer">
              {id === "converter"
                ? "换流器电压、电流等设备测点"
                : "电站 41 · 当前 7 特征版本"}
            </div>
          </div>
        ))}
      </div>
      <details className="content-details">
        <summary>成果目录</summary>{" "}
        <div className="panel">
          <div className="section-title">
            <h2>成果目录</h2>
            <span>{p.ds.short}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>检测成果</th>
                <th>训练记录</th>
                <th>结果来源</th>
              </tr>
            </thead>
            <tbody>
              {p.ds.models.map((m) => {
                const e = p.ds.experiments.find((x) => x.model === m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                    </td>
                    <td>{e?.name || "等待计算"}</td>
                    <td>{e?.history.length || 0} 轮记录</td>
                    <td>研究服务器保存成果</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>{" "}
      <Note>
        {p.dataset === "converter"
          ? "原始表8760条记录，当前建模数组7990点。报告另记7992点，当前页面按实际保存数组展示。"
          : "研究报告另有28特征方案。当前接入7特征实存数据，字段字典与真实时间戳尚需补齐。"}
      </Note>
    </>
  );
}
function RawData(p: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([
    p.dataset === "converter" ? 4 : 0,
  ]);
  const filtered = p.ds.dictionary.filter((d) =>
    (d.code + " " + d.name + " " + d.originalName)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const option = useMemo(
    () =>
      lines(
        selected.map((c, i) => ({
          name: p.ds.dictionary[c]?.code || "变量",
          data: p.ds.rawView[c] || [],
          color: [colors.input, colors.recon, colors.score][i],
        })),
        {
          dataZoom: [
            { type: "inside" },
            { type: "slider", height: 14, bottom: 4 },
          ],
          grid: { left: 60, right: 24, top: 40, bottom: 55 },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: p.ds.rawTime.length
              ? p.ds.rawTime
              : Array.from({ length: 500 }, (_, i) => i),
            axisLabel: {
              showMaxLabel: false,
              formatter: (v: string) => (v.length > 16 ? v.slice(5, 13) : v),
            },
          },
        },
      ),
    [selected, p.ds],
  );
  const toggle = (i: number) =>
    setSelected((s) =>
      s.includes(i)
        ? s.length > 1
          ? s.filter((x) => x !== i)
          : s
        : s.length < 3
          ? [...s, i]
          : [...s.slice(1), i],
    );
  return (
    <div className="raw-layout">
      <aside className="dictionary-panel">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="搜索测点"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称或测点编码"
          />
        </div>
        <p className="small-hint">选择 1–3 个测点 · 共 {p.ds.features} 项</p>
        <div className="dictionary-list">
          {filtered.map((d) => (
            <button
              className={selected.includes(d.index) ? "active" : ""}
              key={d.code}
              onClick={() => toggle(d.index)}
            >
              <span className="selection-dot" />
              <span>
                <b>{d.name}</b>
                <small className="mono">{d.code}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="panel raw-chart">
        <div className="section-title">
          <h2>
            {p.dataset === "converter"
              ? "原始小时记录切片"
              : "当前数据序列切片"}
          </h2>
          <span>500 个时刻</span>
        </div>
        <Chart option={option} height={350} />
        <div className="selected-details">
          {selected.map((c) => {
            const d = p.ds.dictionary[c];
            return (
              <div key={c}>
                <span className="mono">{d.code}</span>
                <p>{d.originalName}</p>
                {d.pointId && <small>测点ID {d.pointId}</small>}
              </div>
            );
          })}
        </div>
        <details className="source-details">
          <summary>方法与来源</summary>
          <div>
            {p.dataset === "converter"
              ? "来源：原始 Excel Sheet8，与Sheet6测点编码对应。曲线断点代表缺失记录。"
              : "来源：现存7特征数组。当前未提供字段字典与时间戳，以索引和变量编号呈现。"}
          </div>
        </details>
      </div>
    </div>
  );
}
function Cleaning(p: Props) {
  return (
    <>
      <div className="stats-row standalone">
        <Stat label="原始记录" value={p.ds.originalRows || 0} />
        <Stat label="建模时刻" value={p.ds.total} />
        <Stat label="建模变量" value={p.ds.features} />
      </div>
      <div className="panel prose-panel">
        <h2>服务器预处理成果</h2>
        <p>
          原始记录与训练、测试数组均来自研究服务器。当前展示保存的最终输入，处理中间曲线未保存。
        </p>
        <button className="outline" onClick={() => p.goto(5)}>
          查看数据划分
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
function Split(p: Props) {
  const [part, setPart] = useState<"train" | "test">("train");
  const [values, setValues] = useState<Float32Array>();
  useEffect(() => {
    let alive = true;
    fetch(part === "train" ? p.ds.trainFile : p.ds.cleanFile)
      .then((r) => r.arrayBuffer())
      .then((b) => {
        if (alive) setValues(new Float32Array(b));
      });
    return () => {
      alive = false;
    };
  }, [part, p.dataset]);
  const c = p.dataset === "converter" ? 4 : 0;
  const opt = lines([
    {
      name: part === "train" ? "训练片段" : "测试片段",
      data: values
        ? column(
            values,
            c,
            p.ds.features,
            0,
            Math.min(400, values.length / p.ds.features),
          )
        : [],
      color: part === "train" ? colors.recon : colors.score,
    },
  ]);
  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>训练 / 测试划分</h2>
          <span className="mono">
            {Math.round(p.ds.split * 100)} :{" "}
            {Math.round((1 - p.ds.split) * 100)}
          </span>
        </div>
        <div className="split-timeline">
          <div
            className="train-block"
            style={{ width: p.ds.split * 100 + "%" }}
          >
            <span>训练集</span>
            <b className="mono">{fmt(p.ds.train, 0)} 点</b>
            <small>学习模型参数</small>
          </div>
          <div className="test-block">
            <span>测试集</span>
            <b className="mono">{fmt(p.ds.test, 0)} 点</b>
            <small>检测与效果评估</small>
          </div>
        </div>
        <div className="timeline-labels">
          <span>序列开始</span>
          <span>划分位置 {fmt(p.ds.train, 0)}</span>
          <span>序列结束 {fmt(p.ds.total, 0)}</span>
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>数据片段</h2>
          <div className="segmented">
            {(["train", "test"] as const).map((id) => (
              <button
                key={id}
                className={part === id ? "active" : ""}
                onClick={() => setPart(id)}
              >
                {id === "train" ? "训练集" : "测试集"}
              </button>
            ))}
          </div>
        </div>
        <Chart option={opt} height={240} />
      </div>
      <Note>{p.ds.timeStatus}。训练与测试划分沿用服务器保存数组。</Note>
    </>
  );
}
function Windows(p: Props) {
  const [index, setIndex] = useState(64);
  const [values, setValues] = useState<Float32Array>();
  useEffect(() => {
    fetch(p.ds.cleanFile)
      .then((r) => r.arrayBuffer())
      .then((b) => setValues(new Float32Array(b)));
  }, [p.dataset]);
  const feature = p.dataset === "converter" ? 4 : 0;
  const opt = lines(
    [
      {
        name: "归一化输入",
        data: values ? column(values, feature, p.ds.features, 0, 256) : [],
        color: colors.recon,
      },
    ],
    {
      series: [
        {
          type: "line",
          data: values ? column(values, feature, p.ds.features, 0, 256) : [],
          showSymbol: false,
          lineStyle: { color: colors.recon, width: 2 },
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(217,119,87,.13)" },
            data: [[{ xAxis: Math.max(0, index - 63) }, { xAxis: index }]],
          },
        },
      ],
    },
  );
  return (
    <>
      <div className="input-flow">
        <div>
          <b>时间划分</b>
          <p>确定训练与测试部分</p>
        </div>
        <ArrowRight />
        <div>
          <b>训练统计量</b>
          <p>确定统一归一化尺度</p>
        </div>
        <ArrowRight />
        <div>
          <b>窗口构建</b>
          <p>64 个时刻 × {p.ds.features} 个变量</p>
        </div>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>滑动窗口</h2>
          <span className="mono">
            [{Math.max(0, index - 63)}, {index}]
          </span>
        </div>
        <Chart option={opt} height={260} />
        <label className="window-slider">
          <span>窗口位置</span>
          <input
            aria-label="窗口端点"
            type="range"
            min="63"
            max="255"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
          <b className="mono">64 × {p.ds.features}</b>
        </label>
        <div className="facts-grid">
          <div>
            <span>窗口长度</span>
            <b className="mono">64</b>
          </div>
          <div>
            <span>移动步长</span>
            <b className="mono">1</b>
          </div>
          <div>
            <span>序列输出</span>
            <b>重叠窗口平均</b>
          </div>
          <div>
            <span>序列边界</span>
            <b>最早观测值补齐</b>
          </div>
        </div>
      </div>
      <Note>
        输入与窗口配置沿用服务器实验。每个时刻的重建与误差按覆盖该时刻的窗口次数平均，再将变量误差平均为异常分数。
      </Note>
    </>
  );
}
const methods = [
  {
    id: "soft",
    name: "软替换",
    short: "局部模式的混合扰动",
    text: "将选定片段与其他位置的真实片段按0.3与0.7加权融合。",
  },
  {
    id: "uniform",
    name: "均匀替换",
    short: "固定常数替换区间",
    text: "用随机选定的恒定数值替换局部区间，观察原有变化如何消失。",
  },
  {
    id: "peak",
    name: "峰值噪声",
    short: "短时尖峰偏离",
    text: "在选定位置加入少量较大的数值扰动，构造突发峰值。",
  },
  {
    id: "length",
    name: "长度调整",
    short: "局部时间节奏改变",
    text: "对片段重采样并重复，模拟局部拉伸与节奏改变。",
  },
];
function Anomalies(p: Props) {
  const [feature, setFeature] = useState(4);
  if (!p.arrays) return <div className="loading-panel">实验数据加载中</div>;
  const a = p.arrays;
  const start = Math.max(0, Array.from(a.labels).findIndex((v) => v > 0) - 25);
  const end = Math.min(start + 200, a.labels.length);
  const indices = Array.from({ length: end - start }, (_, i) => i + start);
  const option = lines(
    [
      {
        name: "服务器实验输入",
        data: indices.map((i) => a.raw[i * p.ds.features + feature]),
        color: colors.input,
      },
    ],
    {
      xAxis: { type: "category", data: indices },
      series: [
        {
          name: "服务器实验输入",
          type: "line",
          showSymbol: false,
          data: indices.map((i) => a.raw[i * p.ds.features + feature]),
          itemStyle: { color: colors.input },
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(189,135,64,.12)" },
            data: indices.flatMap((i, j) =>
              a.matrix[i * p.ds.features + feature]
                ? [[{ xAxis: j }, { xAxis: j + 1 }]]
                : [],
            ),
          },
        },
      ],
    },
  );
  return (
    <>
      <div className="anomaly-controls">
        <span>服务器保存的异常输入与标签</span>
        <select
          aria-label="查看异常变量"
          value={feature}
          onChange={(e) => setFeature(Number(e.target.value))}
        >
          {p.ds.dictionary.map((d) => (
            <option key={d.code} value={d.index}>
              {d.code}
            </option>
          ))}
        </select>
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>异常输入</h2>
          <span>{p.exp?.name}</span>
        </div>
        <Chart option={option} height={280} />
        <div className="label-strip">
          <span>逐时刻标签</span>
          <div>
            {indices.map((i) => (
              <i key={i} className={a.labels[i] ? "abnormal" : ""} />
            ))}
          </div>
        </div>
        <details className="source-details">
          <summary>方法与来源</summary>
          <div>
            {p.exp?.source}
            。背景标出当前变量的异常标签，下方标签条汇总全部变量。页面读取保存结果，不重新构造异常。
          </div>
        </details>
      </div>
    </>
  );
}
function Architecture({ model }: { model: ModelId }) {
  const tracks =
    model === "model1"
      ? ["Global TCN + Transformer", "Local TCN + Transformer"]
      : model === "model2"
        ? ["Global + 多尺度 Local", "变量空间注意力"]
        : ["多尺度时间记忆", "空间注意力 + 记忆检索"];
  return (
    <>
      <svg
        className="architecture"
        viewBox="0 0 820 205"
        role="img"
        aria-label="模型数据处理结构"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0L8 4L0 8" fill="#b1aa9d" />
          </marker>
        </defs>
        <rect x="15" y="73" width="125" height="58" rx="7" fill="#f5f3ec" />
        <text x="77" y="100" textAnchor="middle">
          输入窗口
        </text>
        <text x="77" y="120" textAnchor="middle" className="svg-small">
          时间 × 变量
        </text>
        <path
          d="M140 102 H190 V47 H235 M190 102 V154 H235"
          stroke="#b1aa9d"
          fill="none"
          markerEnd="url(#arrowhead)"
        />
        {tracks.map((t, i) => (
          <g key={t}>
            <rect
              x="235"
              y={i ? 128 : 21}
              width="260"
              height="55"
              rx="7"
              fill={i ? "#eef2f7" : "#f9efeb"}
            />
            <text x="365" y={i ? 160 : 53} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <path
          d="M495 47 H540 V102 H578 M495 155 H540 V102"
          stroke="#b1aa9d"
          fill="none"
          markerEnd="url(#arrowhead)"
        />
        <rect x="578" y="74" width="100" height="58" rx="7" fill="#f5f3ec" />
        <text x="628" y="106" textAnchor="middle">
          融合 / 解码
        </text>
        <path d="M678 102 H710" stroke="#b1aa9d" markerEnd="url(#arrowhead)" />
        <rect x="714" y="74" width="95" height="58" rx="7" fill="#f0edf8" />
        <text x="760" y="106" textAnchor="middle">
          重建序列
        </text>
      </svg>
      <svg
        className="architecture-mobile"
        viewBox="0 0 340 350"
        role="img"
        aria-label="模型数据处理结构"
      >
        <defs>
          <marker
            id="mobile-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0L8 4L0 8" fill="#b1aa9d" />
          </marker>
        </defs>
        <rect x="110" y="8" width="120" height="48" rx="4" fill="#f5f3ec" />
        <text x="170" y="37" textAnchor="middle">
          输入窗口
        </text>
        <path
          d="M170 56 V74 H82 V96 M170 74 H258 V96"
          stroke="#b1aa9d"
          fill="none"
          markerEnd="url(#mobile-arrow)"
        />
        {tracks.map((t, i) => {
          const parts = t.split(" + ");
          const x = i ? 184 : 8;
          return (
            <g key={t}>
              <rect
                x={x}
                y="96"
                width="148"
                height="70"
                rx="4"
                fill={i ? "#eef2f7" : "#f9efeb"}
              />
              <text
                x={x + 74}
                y={parts.length > 1 ? 124 : 136}
                textAnchor="middle"
              >
                {parts.map((part, j) => (
                  <tspan key={part} x={x + 74} dy={j ? 22 : 0}>
                    {part}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        <path
          d="M82 166 V194 H170 V218 M258 166 V194 H170"
          stroke="#b1aa9d"
          fill="none"
          markerEnd="url(#mobile-arrow)"
        />
        <rect x="110" y="218" width="120" height="48" rx="4" fill="#f5f3ec" />
        <text x="170" y="247" textAnchor="middle">
          融合 / 解码
        </text>
        <path
          d="M170 266 V296"
          stroke="#b1aa9d"
          markerEnd="url(#mobile-arrow)"
        />
        <rect x="110" y="296" width="120" height="48" rx="4" fill="#f0edf8" />
        <text x="170" y="325" textAnchor="middle">
          重建序列
        </text>
      </svg>
    </>
  );
}
function Models(p: Props) {
  return (
    <>
      <div className="model-grid">
        {p.ds.models.map((m) => (
          <button
            className={p.model === m.id ? "model-card active" : "model-card"}
            key={m.id}
            aria-pressed={p.model === m.id}
            onClick={() => p.onModel(m.id)}
          >
            <h2>{m.name}</h2>
            <p className="model-subtitle">{m.title}</p>
            <span className="model-selected">
              {p.model === m.id ? (
                <>
                  <CheckCircle2 size={15} />
                  当前模型
                </>
              ) : (
                <>
                  查看结构
                  <ArrowRight size={15} />
                </>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>模型架构</h2>
          <span>{p.ds.models.find((m) => m.id === p.model)?.name}</span>
        </div>
        <Architecture model={p.model} />
        <details className="source-details">
          <summary>方法与来源</summary>
          <div>{p.ds.models.find((m) => m.id === p.model)?.note}</div>
        </details>
      </div>
      <details className="content-details">
        <summary>检测结果对比</summary>{" "}
        <div className="panel">
          <div className="section-title">
            <h2>检测结果</h2>
            <span>服务器点调整评价</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>实验来源</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>连续分数 AUC</th>
              </tr>
            </thead>
            <tbody>
              {p.ds.models.map((m) => {
                const e = p.ds.experiments.find((x) => x.model === m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                    </td>
                    <td>{e?.name || "—"}</td>
                    <td className="mono">
                      {pct(e?.metrics.adjusted.precision)}
                    </td>
                    <td className="mono">{pct(e?.metrics.adjusted.recall)}</td>
                    <td className="mono">{pct(e?.metrics.adjusted.f1)}</td>
                    <td className="mono">{fmt(e?.metrics.auc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details className="source-details">
            <summary>方法与来源</summary>
            <div>
              三模型输入和标签一致，阈值与点调整预测沿用各自服务器绘图脚本。
            </div>
          </details>
        </div>
      </details>{" "}
      <Note>模型0原始DTAAD代码已保存，同场景配对结果尚未补齐。</Note>
    </>
  );
}
function Training(p: Props) {
  const history = p.exp?.history || [];
  const option = lines(
    [
      {
        name: "服务器训练损失",
        data: history.map((h) => h.loss),
        color: colors.score,
      },
    ],
    { xAxis: { type: "category", data: history.map((h) => h.epoch) } },
  );
  return (
    <div className="panel">
      <div className="section-title">
        <h2>服务器训练记录</h2>
        <span>{p.exp?.name}</span>
      </div>
      <Chart option={option} height={300} />
      <div className="facts-grid">
        <div>
          <span>训练轮数</span>
          <b className="mono">{history.length}</b>
        </div>
        <div>
          <span>学习率</span>
          <b className="mono">{history.at(-1)?.lr.toExponential(1) || "—"}</b>
        </div>
        <div>
          <span>权重大小</span>
          <b className="mono">
            {fmt((p.exp?.checkpointBytes || 0) / 1e6, 1)} MB
          </b>
        </div>
        <div>
          <span>结果来源</span>
          <b>研究服务器</b>
        </div>
      </div>
      <details className="source-details">
        <summary>方法与来源</summary>
        <div>
          {p.exp?.source}
          。损失曲线来自服务器权重中的训练记录，检测读取同目录保存结果。
        </div>
      </details>
    </div>
  );
}
