import json, time, threading
from typing import Literal
import numpy as np, torch
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .data import ROOT, PUBLIC, dataset_arrays, catalog
from .research import load_model, create_model, freeze, predict
from .analytics import inject
from .compute import JOBS, submit

app = FastAPI(title="Xuji Anomaly Explorer")
MODELS = {}
MODEL_LOCK = threading.RLock()


class InferInput(BaseModel):
    dataset: Literal["converter", "xuji"]
    model: Literal["model1", "model2", "model3"]
    index: int = Field(default=63, ge=0)
    window: list[list[float]] | None = None
    experiment: str | None = None


class InjectionInput(BaseModel):
    dataset: Literal["converter", "xuji"]
    kind: Literal["soft", "uniform", "peak", "length"]
    split: Literal["train", "test"] = "test"
    seed: int = 42


class TrainInput(BaseModel):
    dataset: Literal["converter", "xuji"]
    model: Literal["model1", "model2", "model3"]
    epochs: int = Field(default=1, ge=1, le=10)
    samples: int = Field(default=128, ge=32, le=512)
    seed: int = 42
    kind: Literal["soft", "uniform", "peak", "length", "mixed"] = "mixed"
    split: float = Field(default=0.7, ge=0.5, le=0.9)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "xuji-anomaly-explorer",
        "device": "cpu",
        "models": [list(k) for k in MODELS],
    }


@app.get("/api/catalog")
def get_catalog():
    return catalog()


@app.get("/api/live/{dataset}/{model}")
def live_info(dataset: str, model: str):
    if dataset not in ("converter", "xuji") or model not in (
        "model1",
        "model2",
        "model3",
    ):
        raise HTTPException(404)
    p = ROOT / "data/models" / dataset / model / "live.json"
    if not p.exists():
        raise HTTPException(404, "推理配置尚未准备")
    return json.loads(p.read_text(encoding="utf-8"))


@app.post("/api/inject")
def injection(body: InjectionInput):
    train, test, _ = dataset_arrays(body.dataset)
    sequence = train if body.split == "train" else test
    if body.dataset == "xuji":
        lo = train.min(0)
        hi = train.max(0)
        sequence = (sequence - lo) / np.maximum(hi - lo, 1e-8)
    raw = sequence[:512]
    x, matrix = inject(raw, body.kind, body.seed, 0.8)
    cols = np.where(matrix.any(0))[0].tolist()
    active = np.where(matrix.any(1))[0]
    center = int(active[0]) if len(active) else 80
    start = max(0, center - 12)
    end = min(start + 100, len(raw))
    return {
        "start": start,
        "seed": body.seed,
        "features": cols,
        "raw": raw[start:end].tolist(),
        "injected": x[start:end].tolist(),
        "matrix": matrix[start:end].tolist(),
        "labels": matrix[start:end].max(1).tolist(),
        "method": "本地算法构造",
    }


@app.post("/api/infer")
def infer(body: InferInput):
    started = time.perf_counter()
    with MODEL_LOCK:
        key = (body.dataset, body.model, body.experiment)
        if key not in MODELS:
            if body.experiment and body.experiment.startswith("job-"):
                jid = body.experiment[4:]
                job = JOBS.get(jid)
                if (
                    not job
                    or job["status"] != "complete"
                    or job["config"]["dataset"] != body.dataset
                    or job["config"]["model"] != body.model
                ):
                    raise HTTPException(400, "实验与模型不匹配")
                ckpt = torch.load(
                    ROOT / "data/jobs" / jid / "model.ckpt",
                    map_location="cpu",
                    weights_only=False,
                )
                model = create_model(
                    body.model, 125 if body.dataset == "converter" else 7
                )
                model.load_state_dict(ckpt["model_state_dict"], strict=True)
                for name, mod in model.named_modules():
                    if name in ckpt["memory_state"]:
                        mod.mem = ckpt["memory_state"][name]
                freeze(model)
                MODELS[key] = model
            else:
                try:
                    MODELS[key] = load_model(body.dataset, body.model)[0]
                except Exception as e:
                    raise HTTPException(422, str(e))
        model = MODELS[key]
        w = model.n_window
    if body.experiment and body.experiment.startswith("job-"):
        info = JOBS[body.experiment[4:]]["result"]
    else:
        info = json.loads(
            (ROOT / "data/models" / body.dataset / body.model / "live.json").read_text(
                encoding="utf-8"
            )
        )
    threshold = info["threshold"]
    if body.window is not None:
        data = np.asarray(body.window, dtype=float)
    else:
        _, sequence, _ = dataset_arrays(body.dataset)
        if body.index >= len(sequence):
            raise HTTPException(422, "索引超过序列范围")
        if info.get("preprocessing"):
            lo = np.asarray(info["preprocessing"]["min"])
            hi = np.asarray(info["preprocessing"]["max"])
            sequence = (sequence - lo) / np.maximum(hi - lo, 1e-8)
        data = sequence[max(0, body.index - w + 1) : body.index + 1]
        if len(data) < w:
            data = np.concatenate([np.repeat(data[:1], w - len(data), axis=0), data])
    features = 125 if body.dataset == "converter" else 7
    if data.shape != (w, features):
        raise HTTPException(422, f"输入需要 {w}×{features} 窗口，收到 {data.shape}")
    if not np.isfinite(data).all():
        raise HTTPException(422, "输入包含非有限数值")
    if np.abs(data).max() > 10:
        raise HTTPException(422, "请提供训练尺度的归一化输入")
    reconstruction = predict(model, body.model, data)[0]
    errors = (reconstruction[-1] - data[-1]) ** 2
    score = float(errors.mean())
    return dict(
        index=body.index,
        score=score,
        threshold=threshold,
        alarm=score > threshold,
        recon=reconstruction[-1].tolist(),
        input=data[-1].tolist(),
        errors=errors.tolist(),
        elapsedMs=(time.perf_counter() - started) * 1000,
        source=info.get("source", "本地任务模型"),
        scoreMethod="当前窗口末点误差",
    )


@app.post("/api/jobs")
def train(body: TrainInput):
    return submit(body.model_dump())


@app.get("/api/jobs")
def jobs():
    return list(JOBS.values())


@app.post("/api/jobs/{jid}/cancel")
def cancel(jid: str):
    if jid not in JOBS:
        raise HTTPException(404)
    JOBS[jid]["cancel"] = True
    return JOBS[jid]


app.mount("/data", StaticFiles(directory=PUBLIC), name="data")
