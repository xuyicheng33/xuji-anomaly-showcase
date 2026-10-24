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
                <th>推理方式</th>
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
                    <td>
                      {p.dataset === "xuji"
                        ? "本地完整保存的固定模型"
                        : m.id === "model3"
                          ? "固定网络 + 本地校准记忆"
                          : "固定网络权重"}
                    </td>
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
  if (!p.ds.preprocess)
    return (
      <>
        <div className="process-row">
          {["目标时刻匹配", "关键字段筛查", "多源时间对齐", "连续时段筛选"].map(
            (s, i) => (
              <div className="process-cell" key={s}>
                <span className="mono">0{i + 1}</span>
                <h3>{s}</h3>
                <p>
                  {
                    [
                      "将预测目标时刻与实测时刻对应",
                      "筛查缺失字段与重复记录",
                      "匹配5分钟观测和15分钟目标",
                      "选择共同可用的连续区间",
                    ][i]
                  }
                </p>
              </div>
            ),
          )}
        </div>
        <div className="panel prose-panel">
          <h2>风电数据的融合过程</h2>
          <p>
            研究材料记录了短期功率、气象观测与气象预报的匹配流程，最终形成当前8759点数据。现存材料主要为建模数组，尚未包含多表处理的中间文件。
          </p>
          <p>
            后续补齐原始分片与字段字典后，可在这一页逐项对照匹配结果与被筛除的记录。
          </p>
          <button className="outline" onClick={() => p.goto(6)}>
            查看已形成的模型输入
            <ArrowRight size={16} />
          </button>
        </div>
      </>
    );
  const v = p.ds.preprocess;
  const option = lines(
    [
      { name: "原始记录", data: v.raw, color: colors.input },
      { name: "缺失补齐", data: v.filled, color: colors.recon },
      { name: "加权平滑", data: v.smoothed, color: colors.score },
    ],
    { xAxis: { type: "category", data: v.raw.map((_, i) => v.start + i) } },
  );
  return (
    <>
      <div className="stats-row standalone">
        <Stat label="原始小时记录" value={8760} />
        <Stat label="原始变量" value={136} />
        <Stat label="保留建模变量" value={125} />
        <Stat label="原表缺失单元格" value={p.ds.missing} />
      </div>
      <div className="panel">
        <div className="section-title">
          <h2>缺失数据处理</h2>
          <span className="mono">{p.ds.dictionary[v.feature].code}</span>
        </div>
        <Chart option={option} height={300} />
        <div className="processing-equation">
          <span>原始断点</span>
          <ArrowRight size={17} />
          <span>线性插值补齐</span>
          <ArrowRight size={17} />
          <span>五点权重 1 : 2 : 3 : 2 : 1</span>
          <ArrowRight size={17} />
          <b>平滑片段</b>
        </div>
        <details className="source-details">
          <summary>方法与来源</summary>
          <div>
            {v.source} ·
            历史完整清洗参数尚未恢复，本片段使用明确的本地处理方法。
          </div>
        </details>
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
      <Note>{p.ds.timeStatus}。新的划分可在“训练与保存”中生成独立实验。</Note>
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
            <span>流式输出</span>
            <b>当前窗口末点</b>
          </div>
          <div>
            <span>序列边界</span>
            <b>最早观测值补齐</b>
          </div>
        </div>
      </div>
      <Note>
        现存输入已归一化。历史缩放参数未完整保存，实时推理接收训练尺度窗口；本地新实验单独记录处理与阈值配置。
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
  const [kind, setKind] = useState("soft");
  const [strategy, setStrategy] = useState("fixed");
  const [part, setPart] = useState("test");
  const [seed, setSeed] = useState(42);
  const [data, setData] = useState<Injection>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feature, setFeature] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    api<Injection>("/inject", { dataset: p.dataset, kind, split: part, seed })
      .then((d) => {
        if (alive) {
          setData(d);
          const visibleFeatures = [...d.features].sort((a, b) => {
            const change = (c: number) =>
              d.raw.reduce(
                (sum, row, i) => sum + Math.abs(d.injected[i][c] - row[c]),
                0,
              );
            return change(b) - change(a);
          });
          setFeature(visibleFeatures[0] ?? 0);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, part, seed, p.dataset]);
  const option = useMemo(
    () =>
      lines(
        [
          {
            name: "原始片段",
            data: data?.raw.map((r) => r[feature]) || [],
            color: colors.input,
          },
          {
            name: "注入后",
            data: data?.injected.map((r) => r[feature]) || [],
            color: colors.alarm,
          },
        ],
        {
          xAxis: {
            type: "category",
            data: data?.raw.map((_, i) => data.start + i),
          },
          series: [
            {
              name: "原始片段",
              type: "line",
              data: data?.raw.map((r) => r[feature]),
              showSymbol: false,
              itemStyle: { color: colors.input },
              lineStyle: { color: colors.input, width: 2 },
            },
            {
              name: "注入后",
              type: "line",
              data: data?.injected.map((r) => r[feature]),
              showSymbol: false,
              itemStyle: { color: colors.alarm },
              lineStyle: { color: colors.alarm, width: 2 },
              markArea: {
                silent: true,
                itemStyle: { color: "rgba(217,119,6,.08)" },
                data: (data?.labels || [])
                  .map((v, i) => (v ? [{ xAxis: i }, { xAxis: i + 1 }] : null))
                  .filter(Boolean),
              },
            },
          ],
        },
      ),
    [data, feature],
  );
  const cols = data?.features.slice(0, 10) || [];
  const heat = useMemo(
    () => ({
      animation: false,
      grid: { left: 70, right: 22, top: 10, bottom: 22 },
      xAxis: {
        type: "category",
        data: data?.raw.map((_, i) => data.start + i),
        axisLabel: { show: false },
      },
      yAxis: {
        type: "category",
        data: cols.map((c) => p.ds.dictionary[c]?.code),
        axisLabel: { fontSize: 10, width: 60, overflow: "truncate" },
      },
      visualMap: {
        show: false,
        min: 0,
        max: 1,
        inRange: { color: ["#f5f3ec", "#d97706"] },
      },
      series: [
        {
          type: "heatmap",
          data:
            data?.matrix.flatMap((r, t) => cols.map((c, j) => [t, j, r[c]])) ||
            [],
        },
      ],
    }),
    [data, cols.join(), p.ds],
  );
  return (
    <>
      <div className="method-grid">
        {methods.map((m) => (
          <button
            className={kind === m.id ? "method active" : "method"}
            key={m.id}
            onClick={() => setKind(m.id)}
          >
            <span className="method-mark">
              {m.id === "peak"
                ? "╱╲"
                : m.id === "uniform"
                  ? "─ ─"
                  : m.id === "length"
                    ? "↔"
                    : "∿"}
            </span>
            <b>{m.name}</b>
          </button>
        ))}
      </div>
      <div className="anomaly-controls">
        <div className="segmented">
          {["fixed", "dynamic"].map((id) => (
            <button
              className={strategy === id ? "active" : ""}
              key={id}
              onClick={() => {
                setStrategy(id);
                setSeed(42);
              }}
            >
              {id === "fixed" ? "固定注入" : "动态注入"}
            </button>
          ))}
        </div>
        <div className="segmented">
          {["train", "test"].map((id) => (
            <button
              className={part === id ? "active" : ""}
              key={id}
              onClick={() => setPart(id)}
            >
              {id === "train" ? "训练集" : "测试集"}
            </button>
          ))}
        </div>
        <select
          aria-label="查看异常变量"
          value={feature}
          onChange={(e) => setFeature(Number(e.target.value))}
        >
          {(data?.features.length ? data.features : [0]).map((c) => (
            <option value={c} key={c}>
              {p.ds.dictionary[c]?.code}
            </option>
          ))}
        </select>
        <button
          className="outline"
          disabled={strategy === "fixed" || busy}
          onClick={() => setSeed((s) => s + 1)}
        >
          <RefreshCw size={15} />
          重新生成
        </button>
        <span className="mono seed">seed {seed}</span>
      </div>
      {error && <Note>{error}</Note>}
      <div className={"panel " + (busy ? "pending" : "")}>
        <div className="section-title">
          <h2>注入结果</h2>
        </div>
        <Chart option={option} height={230} />
        <div className="label-strip">
          <span>异常区间</span>
          <div>
            {data?.labels.map((v, i) => (
              <i key={i} className={v ? "abnormal" : ""} />
            ))}
          </div>
        </div>
        <details className="source-details">
          <summary>变量标签</summary>
          <Chart option={heat} height={Math.max(70, cols.length * 18 + 30)} />
        </details>
        <details className="source-details">
          <summary>方法与来源</summary>
          <div>
            基于当前{part === "train" ? "训练" : "测试"}序列执行本地构造。
            {strategy === "fixed"
              ? "固定seed可重复查看。"
              : "重新生成时改变seed，更新异常位置与扰动。"}
            检测页面的历史结果保留其原实验输入。
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
            <span>直接逐点评价</span>
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
                    <td className="mono">{pct(e?.metrics.direct.precision)}</td>
                    <td className="mono">{pct(e?.metrics.direct.recall)}</td>
                    <td className="mono">{pct(e?.metrics.direct.f1)}</td>
                    <td className="mono">{fmt(e?.metrics.auc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <details className="source-details">
            <summary>方法与来源</summary>
            <div>
              {p.dataset === "converter"
                ? "三模型输入和标签一致，分别使用各自记录的阈值。"
                : "三模型使用同一归一化、异常输入、seed和本地训练预算，阈值按各自训练分数确定。"}
            </div>
          </details>
        </div>
      </details>{" "}
      <Note>模型0原始DTAAD代码已保存，同场景配对结果尚未补齐。</Note>
    </>
  );
}
function Training(p: Props) {
  const [epochs, setEpochs] = useState(1);
  const [samples, setSamples] = useState(128);
  const [split, setSplit] = useState(p.ds.split);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Job[]>("/jobs").then((j) => {
        if (alive) setJobs(j);
      });
    void load();
    const t = setInterval(() => void load(), 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const active = jobs.some(
    (j) => j.status === "running" || j.status === "queued",
  );
  const start = async () => {
    setSubmitting(true);
    try {
      const j = await api<Job>("/jobs", {
        dataset: p.dataset,
        model: p.model,
        epochs,
        samples,
        split,
        seed: 42,
        kind: "mixed",
      });
      setJobs((s) => [...s, j]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const history = p.exp?.history || [];
  const opt = lines(
    [
      {
        name: "保存的训练损失",
        data: history.map((h) => h.loss),
        color: colors.score,
      },
    ],
    {
      xAxis: { type: "category", data: history.map((h) => h.epoch) },
      series: [
        {
          name: "保存的训练损失",
          type: "line",
          data: history.map((h) => h.loss),
          showSymbol: true,
          symbolSize: 6,
          itemStyle: { color: colors.score },
        },
      ],
    },
  );
  return (
    <>
      <div className="training-grid">
        <div className="panel">
          <div className="section-title">
            <h2>训练记录</h2>
            <span>{p.exp?.name}</span>
          </div>
          <Chart option={opt} height={250} />
          <div className="facts-grid">
            <div>
              <span>记录轮数</span>
              <b className="mono">{history.length}</b>
            </div>
            <div>
              <span>学习率</span>
              <b className="mono">
                {history.length ? history.at(-1)!.lr.toExponential(1) : "—"}
              </b>
            </div>
            <div>
              <span>权重大小</span>
              <b className="mono">
                {fmt((p.exp?.checkpointBytes || 0) / 1e6, 1)} MB
              </b>
            </div>
            <div>
              <span>结果版本</span>
              <b className="mono">{p.exp?.id}</b>
            </div>
          </div>
          <details className="source-details">
            <summary>方法与来源</summary>
            <div>
              损失曲线来自保存记录，显示实际轮次。记忆模型历史文件未包含训练后记忆向量，本地补存校准记忆。
            </div>
          </details>
        </div>
        <details className="content-details new-training">
          <summary>新建训练任务</summary>{" "}
          <div className="panel compute-form">
            <div className="section-title">
              <h2>训练参数</h2>
              <span className="badge">CPU</span>
            </div>
            <p>训练并保存独立实验成果。</p>
            <label>
              训练轮数
              <select
                aria-label="训练轮数"
                value={epochs}
                onChange={(e) => setEpochs(Number(e.target.value))}
              >
                {[1, 2, 3, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              训练窗口数
              <select
                aria-label="训练窗口数"
                value={samples}
                onChange={(e) => setSamples(Number(e.target.value))}
              >
                {[32, 64, 128, 256].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              训练集比例
              <select
                aria-label="训练集比例"
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
              >
                {[0.6, 0.7, 0.8].map((n) => (
                  <option key={n} value={n}>
                    {n * 100}%
                  </option>
                ))}
              </select>
            </label>
            <div className="form-summary">
              <span>
                {p.ds.short} · {p.ds.models.find((m) => m.id === p.model)?.name}
              </span>
              <small>
                {p.model === "model3"
                  ? "正常重建 · 固定记忆"
                  : "重建损失 · 异常约束"}
              </small>
            </div>
            <button
              className="primary full"
              disabled={active || submitting}
              onClick={start}
            >
              <Play size={16} />
              {active ? "任务运行中" : "提交训练"}
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
        </details>
      </div>
      {jobs.length > 0 && (
        <details className="content-details">
          <summary>任务记录</summary>
          <div className="panel">
            <div className="section-title">
              <h2>计算任务</h2>
              <span>新成果独立保存</span>
            </div>
            {jobs.map((j) => (
              <div className="job-row" key={j.id}>
                <div>
                  <b>
                    {j.config.dataset === "converter" ? "换流设备" : "风电功率"}{" "}
                    · {j.config.model}
                  </b>
                  <small className="mono">{j.id}</small>
                </div>
                <div className="job-progress">
                  <i style={{ width: j.progress * 100 + "%" }} />
                </div>
                <span>
                  {
                    (
                      {
                        queued: "排队",
                        running: "计算中",
                        complete: "已完成",
                        failed: "失败",
                        cancelled: "已取消",
                      } as Record<string, string>
                    )[j.status]
                  }
                </span>
                {j.status === "complete" ? (
                  <button
                    className="outline compact"
                    onClick={async () => {
                      await p.refresh();
                      p.selectExperiment(j.result!);
                    }}
                  >
                    加载成果
                    <ArrowRight size={14} />
                  </button>
                ) : j.status === "running" || j.status === "queued" ? (
                  <button
                    className="text-button"
                    onClick={() => void api("/jobs/" + j.id + "/cancel", {})}
                  >
                    <Square size={12} />
                    取消
                  </button>
                ) : null}
                {j.error && <small className="error-message">{j.error}</small>}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
