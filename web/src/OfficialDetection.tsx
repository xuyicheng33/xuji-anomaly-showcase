import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  ChevronRight,
} from "lucide-react";
import type { Arrays, Dataset, Experiment } from "./types";
import { Chart, colors } from "./Chart";
import { fmt, pct } from "./data";
import { Title } from "./Stages";

export function Detection({
  ds,
  exp,
  arrays,
}: {
  ds: Dataset;
  exp: Experiment;
  arrays: Arrays;
}) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [feature, setFeature] = useState(4);
  const [scope, setScope] = useState(400);
  const [returnCursor, setReturnCursor] = useState<number>();
  const panel = useRef<HTMLElement>(null);
  const T = arrays.labels.length;
  const C = ds.features;
  const prediction = arrays.predictions;
  const stats = exp.metrics.adjusted;
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(scope * 0.55), T - scope),
  );
  const indices = Array.from(
    { length: Math.min(scope, T - start) },
    (_, i) => start + i,
  );
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((i) => {
          if (i >= T - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      Math.max(20, 1000 / (8 * speed)),
    );
    return () => clearInterval(timer);
  }, [playing, speed, T]);
  const events = useMemo(
    () =>
      Array.from(prediction, (_, i) => i).filter((i) =>
        i === 0
          ? prediction[i] || arrays.labels[i]
          : prediction[i] !== prediction[i - 1] ||
            arrays.labels[i] !== arrays.labels[i - 1],
      ),
    [arrays],
  );
  const jump = (direction: number) => {
    setPlaying(false);
    const value =
      direction > 0
        ? events.find((i) => i > cursor)
        : [...events].reverse().find((i) => i < cursor);
    if (value !== undefined) setCursor(value);
  };
  const locate = (i: number) => {
    setReturnCursor(cursor);
    setCursor(i);
    setPlaying(false);
    requestAnimationFrame(() =>
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  };
  const option = useMemo(() => {
    const axis = {
      type: "category",
      boundaryGap: false,
      data: indices,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#ddd9cf" } },
      axisLabel: { color: "#746f65", fontSize: 10 },
    };
    const marker = {
      symbol: "none",
      silent: true,
      label: { show: false },
      lineStyle: { color: colors.alarm, width: 1, type: "solid" },
      data: [{ xAxis: cursor - start }],
    };
    return {
      animation: false,
      tooltip: { trigger: "axis", confine: true, textStyle: { fontSize: 12 } },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      legend: {
        top: 0,
        left: 62,
        itemWidth: 16,
        itemHeight: 5,
        textStyle: { fontSize: 11, color: "#66635c" },
        data: ["输入", "重建", "异常分数", "阈值"],
      },
      grid: [
        { left: 67, right: 22, top: 35, height: 85 },
        { left: 67, right: 22, top: 140, height: 65 },
        { left: 67, right: 22, top: 225, height: 18 },
        { left: 67, right: 22, top: 263, height: 18 },
      ],
      xAxis: [0, 1, 2, 3].map((i) => ({
        ...axis,
        gridIndex: i,
        ...(i < 3 ? { axisLabel: { show: false } } : {}),
      })),
      yAxis: [
        {
          type: "value",
          scale: true,
          gridIndex: 0,
          splitNumber: 3,
          axisLabel: { color: "#746f65", fontSize: 10 },
          splitLine: { lineStyle: { color: "#f1eee7" } },
        },
        {
          type: "value",
          gridIndex: 1,
          splitNumber: 3,
          axisLabel: {
            color: "#746f65",
            fontSize: 10,
            formatter: (v: number) => Number(v.toPrecision(2)),
          },
          splitLine: { lineStyle: { color: "#f1eee7" } },
        },
        { type: "value", min: 0, max: 1, gridIndex: 2, show: false },
        { type: "value", min: 0, max: 1, gridIndex: 3, show: false },
      ],
      graphic: [
        {
          type: "text",
          left: 14,
          top: 35,
          style: { text: "波形", fill: "#746f65", fontSize: 11 },
        },
        {
          type: "text",
          left: 14,
          top: 140,
          style: { text: "分数", fill: "#746f65", fontSize: 11 },
        },
        {
          type: "text",
          left: 14,
          top: 225,
          style: {
            text: "已知\n标签",
            fill: "#746f65",
            fontSize: 11,
            lineHeight: 12,
          },
        },
        {
          type: "text",
          left: 14,
          top: 263,
          style: {
            text: "诊断\n结果",
            fill: "#746f65",
            fontSize: 11,
            lineHeight: 12,
          },
        },
      ],
      series: [
        {
          name: "输入",
          type: "line",
          data: indices.map((i) => arrays.raw[i * C + feature]),
          showSymbol: false,
          itemStyle: { color: colors.input },
          lineStyle: { width: 1.6 },
          markLine: marker,
        },
        {
          name: "重建",
          type: "line",
          data: indices.map((i) => arrays.recon[i * C + feature]),
          showSymbol: false,
          itemStyle: { color: colors.recon },
          lineStyle: { width: 1.8 },
        },
        {
          name: "异常分数",
          type: "line",
          data: indices.map((i) => arrays.scores[i]),
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          itemStyle: { color: colors.score },
          lineStyle: { width: 1.8 },
          markLine: marker,
        },
        {
          name: "阈值",
          type: "line",
          data: indices.map(() => exp.threshold),
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          itemStyle: { color: colors.alarm },
          lineStyle: { width: 1, type: "dashed" },
        },
        {
          name: "已知标签",
          type: "bar",
          data: indices.map((i) => arrays.labels[i]),
          xAxisIndex: 2,
          yAxisIndex: 2,
          barWidth: "100%",
          itemStyle: { color: colors.label },
          markLine: marker,
        },
        {
          name: "诊断结果（点调整）",
          type: "bar",
          data: indices.map((i) => prediction[i]),
          xAxisIndex: 3,
          yAxisIndex: 3,
          barWidth: "100%",
          itemStyle: { color: colors.alarm },
          markLine: marker,
        },
      ],
    };
  }, [arrays, feature, cursor, scope, exp]);
  const eventRecords = events
    .filter((i) => i <= cursor)
    .slice(-6)
    .reverse();
  return (
    <>
      <Title title="动态检测" description="" />
      <div className="detection-toolbar">
        <span className="official-result-label">服务器结果 · 点调整评价</span>
        <div className="toolbar-selects">
          <select
            aria-label="检测测点"
            value={feature}
            onChange={(e) => setFeature(Number(e.target.value))}
          >
            {ds.dictionary.map((d) => (
              <option key={d.code} value={d.index}>
                {d.code}
              </option>
            ))}
          </select>
          <details className="display-options">
            <summary>设置</summary>
            <div>
              <label>
                显示范围
                <select
                  aria-label="观察窗口范围"
                  value={scope}
                  onChange={(e) => setScope(Number(e.target.value))}
                >
                  {[200, 400, 800].map((n) => (
                    <option key={n} value={n}>
                      {n} 点
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      </div>
      <section className="panel scope-panel" ref={panel}>
        <div className="scope-heading">
          <div>
            <b>{ds.dictionary[feature].code}</b>
            <small>{ds.dictionary[feature].name}</small>
          </div>
          <section className="current-state">
            <div
              className={
                "state-word " + (prediction[cursor] ? "alarm" : "normal")
              }
            >
              <span />
              {prediction[cursor] ? "诊断异常" : "诊断正常"}
            </div>
            <div className="score-value">
              <span>分数</span>
              <strong className="mono">{fmt(arrays.scores[cursor], 5)}</strong>
            </div>
            <div className="threshold-row">
              <span>阈值</span>
              <b className="mono">{fmt(exp.threshold, 5)}</b>
            </div>
          </section>
        </div>
        <Chart option={option} height={310} />
        <div className="player">
          <div className="player-buttons">
            <button
              aria-label="重置播放"
              onClick={() => {
                setCursor(0);
                setPlaying(false);
                setReturnCursor(undefined);
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button aria-label="上一个检测事件" onClick={() => jump(-1)}>
              <SkipBack size={16} />
            </button>
            <button
              className="play-button"
              aria-label={playing ? "暂停播放" : "开始播放"}
              onClick={() => {
                if (cursor === T - 1) setCursor(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button aria-label="下一个检测事件" onClick={() => jump(1)}>
              <SkipForward size={16} />
            </button>
          </div>
          <input
            type="range"
            aria-label="检测播放进度"
            min={0}
            max={T - 1}
            value={cursor}
            onChange={(e) => {
              setCursor(Number(e.target.value));
              setPlaying(false);
            }}
          />
          <span className="mono play-position">
            {fmt(cursor, 0)} / {fmt(T - 1, 0)}
          </span>
          <select
            aria-label="播放倍率"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[0.5, 1, 2, 5].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
          {returnCursor !== undefined && (
            <button
              className="text-button return-location"
              onClick={() => {
                setCursor(returnCursor);
                setReturnCursor(undefined);
              }}
            >
              返回 t {returnCursor}
            </button>
          )}
        </div>
      </section>
      <section className="metrics-panel">
        <div className="metric-label">
          <span>测试集 · 点调整</span>
          <small className="mono">{fmt(T, 0)} 个时刻</small>
        </div>
        <div className="metric-highlight">
          <span>F1</span>
          <strong className="mono">{pct(stats.f1)}</strong>
        </div>
        <div className="metric-pair">
          <div>
            <span>Precision</span>
            <b className="mono">{pct(stats.precision)}</b>
          </div>
          <div>
            <span>Recall</span>
            <b className="mono">{pct(stats.recall)}</b>
          </div>
        </div>
      </section>
      <details className="analysis-details">
        <summary>
          评估详情<span>事件记录 · 混淆矩阵 · 来源</span>
        </summary>
        <div className="analysis-body">
          <div className="confusion-grid">
            {[
              ["正确检出", "TP", stats.tp, "tp"],
              ["误报", "FP", stats.fp, "fp"],
              ["漏报", "FN", stats.fn, "fn"],
              ["正常判对", "TN", stats.tn, "tn"],
            ].map(([label, abbr, value, cls]) => (
              <div className={"confusion-cell " + cls} key={abbr}>
                <span>
                  {label}
                  <small>{abbr}</small>
                </span>
                <b className="mono">{fmt(Number(value), 0)}</b>
              </div>
            ))}
          </div>
          <div className="detection-bottom">
            <section className="panel event-panel">
              <div className="section-title">
                <h2>诊断事件</h2>
              </div>
              <div className="event-list">
                {eventRecords.map((i) => {
                  const pred = prediction[i] > 0,
                    y = arrays.labels[i] > 0;
                  const tag = pred
                    ? y
                      ? "正确检出"
                      : "误报"
                    : y
                      ? "漏报"
                      : "正常";
                  return (
                    <button
                      key={i}
                      aria-current={i === cursor ? "true" : undefined}
                      onClick={() => locate(i)}
                    >
                      <span
                        className={
                          "event-dot " +
                          (tag === "误报" ? "fp" : tag === "漏报" ? "fn" : "")
                        }
                      />
                      <span className="mono">t {i}</span>
                      <b>{tag}</b>
                      <span className="mono">{fmt(arrays.scores[i], 4)}</span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="panel offline-panel">
              <div className="section-title">
                <h2>评价口径</h2>
              </div>
              <small>
                沿用服务器绘图脚本的点调整：异常区间内有点超过阈值时，将整段异常区间记为检出。图中诊断标签、混淆矩阵和指标采用同一结果。
              </small>
              <div className="offline-stats">
                <div>
                  <span>逐点 F1</span>
                  <b className="mono">{pct(exp.metrics.direct.f1)}</b>
                </div>
                <div>
                  <span>点调整 F1</span>
                  <b className="mono">{pct(stats.f1)}</b>
                </div>
                <div>
                  <span>连续分数 AUC</span>
                  <b className="mono">{fmt(exp.metrics.auc, 4)}</b>
                </div>
              </div>
            </section>
          </div>
          <details className="source-details">
            <summary>方法与来源</summary>
            <div>
              {exp.source}
              <br />
              {exp.thresholdSource}
              。输入、重建、分数与标签逐项核对服务器保存文件。报告中多次实验的汇总值对应其报告实验，当前曲线对应本次保存结果。
            </div>
          </details>
        </div>
      </details>
    </>
  );
}
