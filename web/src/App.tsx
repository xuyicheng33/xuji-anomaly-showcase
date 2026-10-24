import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import type { Arrays, Catalog, DatasetId, ModelId, Experiment } from "./types";
import { api, arraysFor } from "./data";
import { Stages } from "./Stages";
import { Detection } from "./Detection";
const STEPS = [
  "项目概览",
  "数据概况",
  "测点数据",
  "数据清洗",
  "数据划分",
  "模型输入",
  "异常构造",
  "模型结构",
  "训练管理",
  "动态检测",
];
function initial() {
  try {
    return JSON.parse(localStorage.getItem("xuji-session") || "{}");
  } catch {
    return {};
  }
}
const saved = initial();
export default function App() {
  const [cat, setCat] = useState<Catalog>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<DatasetId>(
    saved.dataset === "xuji" ? "xuji" : "converter",
  );
  const [model, setModel] = useState<ModelId>(
    ["model1", "model2", "model3"].includes(saved.model)
      ? saved.model
      : "model1",
  );
  const [step, setStep] = useState<number>(() => {
    const q = new URLSearchParams(location.search).get("step");
    return q ? Math.min(10, Math.max(1, Number(q))) : saved.step || 1;
  });
  const [experiment, setExperiment] = useState(saved.experiment || "");
  const [arrays, setArrays] = useState<Arrays>();
  const [menu, setMenu] = useState(false);
  const reload = () =>
    api<Catalog>("/catalog")
      .then(setCat)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void reload();
  }, []);
  const ds = cat?.datasets[dataset];
  const options = ds?.experiments.filter((e) => e.model === model) || [];
  const exp = options.find((e) => e.id === experiment) || options[0];
  useEffect(() => {
    if (!exp) {
      setArrays(undefined);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    setArrays(undefined);
    arraysFor(exp)
      .then((a) => {
        if (live) setArrays(a);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [dataset, exp?.id]);
  useEffect(() => {
    localStorage.setItem(
      "xuji-session",
      JSON.stringify({ dataset, model, step, experiment }),
    );
  }, [dataset, model, step, experiment]);
  const goto = (s: number) => {
    setStep(s);
    setMenu(false);
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const cb = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.isContentEditable
      )
        return;
      if (e.key === "ArrowRight") goto(Math.min(10, step + 1));
      if (e.key === "ArrowLeft") goto(Math.max(1, step - 1));
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", cb);
    return () => window.removeEventListener("keydown", cb);
  }, [step]);
  const selectExperiment = (e: Experiment) => {
    setDataset(e.dataset);
    setModel(e.model);
    setExperiment(e.id);
    goto(10);
  };
  if (!ds)
    return (
      <div className="initial-screen">
        <Activity size={28} />
        <h2>研究成果加载中</h2>
        {error && (
          <>
            <p>{error}</p>
            <button onClick={reload}>重新连接</button>
          </>
        )}
      </div>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            goto(1);
          }}
        >
          <span className="brand-icon">
            <Activity size={20} />
          </span>
          <span>
            <strong>许继电气</strong>
            <small>异常检测</small>
          </span>
        </a>
        <div className="dataset-switch" role="group" aria-label="选择数据集">
          <span
            className={"switch-plate " + (dataset === "xuji" ? "right" : "")}
          />
          {(["converter", "xuji"] as DatasetId[]).map((id) => (
            <button
              key={id}
              className={dataset === id ? "active" : ""}
              onClick={() => {
                setDataset(id);
                setExperiment("");
              }}
            >
              {cat!.datasets[id].short}
            </button>
          ))}
        </div>
        <button
          className="workflow-menu"
          onClick={() => setMenu(!menu)}
          aria-label="打开流程导航"
          aria-expanded={menu}
        >
          <span>{STEPS[step - 1]}</span>
          <span className="mono">{String(step).padStart(2, "0")} / 10</span>
          <ChevronDown size={14} />
        </button>
      </header>
      {menu && (
        <>
          <button
            className="menu-backdrop"
            aria-label="关闭流程导航"
            onClick={() => setMenu(false)}
          />
          <nav className="nav-menu" aria-label="处理流程">
            {STEPS.map((s, i) => (
              <button
                key={s}
                className={step === i + 1 ? "active" : ""}
                onClick={() => goto(i + 1)}
              >
                <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </button>
            ))}
          </nav>
        </>
      )}
      <main>
        {step >= 8 && (
          <details className="model-settings">
            <summary>
              {ds.models.find((m) => m.id === model)?.name}
              <span>模型配置</span>
              <ChevronDown size={13} />
            </summary>
            <div className="model-settings-body">
              <label>
                模型
                <select
                  aria-label="选择检测模型"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value as ModelId);
                    setExperiment("");
                  }}
                >
                  {ds.models.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                实验版本
                <select
                  aria-label="选择实验版本"
                  value={exp?.id || ""}
                  onChange={(e) => setExperiment(e.target.value)}
                >
                  {options.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            <button onClick={reload}>
              <RefreshCw size={14} />
              重试
            </button>
          </div>
        )}
        <div className="stage" key={dataset + "-" + step}>
          {step === 10 && exp && arrays ? (
            <Detection
              key={dataset + exp.id}
              dataset={dataset}
              ds={ds}
              exp={exp}
              arrays={arrays}
            />
          ) : step === 10 ? (
            <div className="loading-panel">
              {loading ? "检测数据加载中" : "暂无检测成果"}
            </div>
          ) : (
            <Stages
              step={step}
              dataset={dataset}
              ds={ds}
              cat={cat!}
              exp={exp}
              arrays={arrays}
              model={model}
              onModel={(m) => {
                setModel(m);
                setExperiment("");
              }}
              goto={goto}
              refresh={reload}
              selectExperiment={selectExperiment}
            />
          )}
        </div>
      </main>
      <footer className="footer-controls">
        <button
          className="text-button"
          disabled={step === 1}
          onClick={() => goto(step - 1)}
        >
          <ArrowLeft size={16} />
          上一步
        </button>
        <div className="footer-position">
          <span>{STEPS[step - 1]}</span>
          <span className="mono">{String(step).padStart(2, "0")} / 10</span>
        </div>
        <button
          className="text-button"
          disabled={step === 10}
          onClick={() => goto(step + 1)}
        >
          下一步
          <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
}
