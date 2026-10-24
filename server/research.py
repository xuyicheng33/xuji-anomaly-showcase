"""Isolated network definitions; never imports research training entry points."""

import ast, math, random, copy, io, contextlib, threading
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.nn.utils import weight_norm
from torch.autograd import Variable

ROOT = Path(__file__).resolve().parents[1]
torch.set_num_threads(4)
LOCK = threading.RLock()


def definitions(path, namespace):
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    keep = [
        n
        for n in tree.body
        if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]

    # Research print calls produce large per-window output, with no numerical role.
    class Quiet(ast.NodeTransformer):
        def visit_Expr(self, node):
            if (
                isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name)
                and node.value.func.id == "print"
            ):
                return ast.copy_location(ast.Pass(), node)
            return self.generic_visit(node)

    tree = Quiet().visit(ast.Module(body=keep, type_ignores=[]))
    ast.fix_missing_locations(tree)
    exec(compile(tree, str(path), "exec"), namespace)


def create_model(model_id, features, window=64):
    folder = ROOT / "data/source/research" / model_id
    ns = dict(vars(nn))
    ns.update(
        torch=torch,
        nn=nn,
        F=F,
        np=np,
        math=math,
        random=random,
        copy=copy,
        Variable=Variable,
        weight_norm=weight_norm,
        args=SimpleNamespace(
            Device="cpu", dataset="converter", model="DTAAD", window_size=window
        ),
        seed_fordata=1,
        window_size=window,
        lr=1e-5,
    )
    for name in ["gltcn.py", "dlutils.py", "ours_memory_module_v8.py"]:
        p = folder / "src" / name
        if p.exists():
            definitions(p, ns)
    definitions(folder / "src/models.py", ns)
    with contextlib.redirect_stdout(io.StringIO()):
        torch.manual_seed(1)
        model = ns["DTAAD"](features).double().cpu()
    model.save_attn = False
    return model


def memory_state(model):
    return {
        name: module.mem.detach().cpu().clone()
        for name, module in model.named_modules()
        if hasattr(module, "mem")
    }


def freeze(model):
    model.eval()
    model.memory_phase = "test"
    for module in model.modules():
        if hasattr(module, "phase_type"):
            module.phase_type = "test"
        if hasattr(module, "device"):
            module.device = torch.device("cpu")


def load_model(dataset, model_id):
    path = ROOT / "data/models" / dataset / model_id / "model.ckpt"
    local = path.parent / "local.ckpt"
    if local.exists():
        path = local
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    state = checkpoint["model_state_dict"]
    w = 64
    for key, value in state.items():
        if (
            key in ("decoder.0.weight", "decoder.2.weight")
            and value.shape[0] == value.shape[1]
        ):
            w = int(value.shape[0])
    features = 125 if dataset == "converter" else 7
    model = create_model(model_id, features, w)
    model.load_state_dict(state, strict=True)
    if model_id == "model3":
        supplemental = ROOT / "data/models" / dataset / model_id / "memory_state.pt"
        if "memory_state" in checkpoint or supplemental.exists():
            saved = checkpoint.get("memory_state") or torch.load(
                supplemental, map_location="cpu", weights_only=True
            )
            for name, module in model.named_modules():
                if name in saved:
                    module.mem = saved[name].clone()
        else:
            raise ValueError("历史权重未保存记忆向量，需要先完成本地记忆校准。")
    freeze(model)
    return model, checkpoint


def predict(model, model_id, windows):
    x = torch.as_tensor(np.asarray(windows), dtype=torch.float64)
    if x.ndim == 2:
        x = x[None, :, :]
    # This mask is computed from the current observed window only.
    masked = x.clone()
    k = torch.fft.rfft(x, dim=1).abs().mean(dim=(0, 2))
    if len(k) > 1:
        k[0] = 0
        period = max(2, int(x.shape[1] / max(1, int(k.argmax()))))
        masked[:, ::period, :] = 0
    with LOCK, torch.no_grad(), contextlib.redirect_stdout(io.StringIO()):
        if model_id == "model0":
            y = model(x.permute(0, 2, 1))
            if isinstance(y, (list, tuple)):
                y = y[-1]
        elif model_id == "model1":
            y = model(x.permute(0, 2, 1), masked.permute(0, 2, 1))
        else:
            y = model(x, masked)
    if y.shape != x.shape:
        if y.numel() == x.numel():
            y = y.reshape(x.shape)
        else:
            raise ValueError(f"模型输出形状不匹配: {tuple(y.shape)}")
    return y.detach().numpy()


def calibrate_memory(model, sequence):
    """Rebuild missing memory from local normal features, saved separately."""
    rng = np.random.default_rng(42)
    starts = np.linspace(model.n_window, len(sequence), 64, dtype=int)
    windows = np.stack([sequence[max(0, s - model.n_window) : s] for s in starts])
    freeze(model)
    samples = {}
    hooks = []
    for name, module in model.named_modules():
        if hasattr(module, "mem"):
            samples[name] = []

            def collect(mod, inputs, name=name):
                x = inputs[0].detach().cpu().numpy()
                vectors = (
                    x.reshape(-1, x.shape[-1])
                    if mod.mem.shape[1] == x.shape[-1]
                    else x.transpose(0, 2, 1).reshape(-1, x.shape[1])
                )
                samples[name].append(vectors)

            hooks.append(module.register_forward_pre_hook(collect))
    predict(model, "model3", windows[:16])
    for h in hooks:
        h.remove()
    for name, module in model.named_modules():
        if name in samples:
            vectors = np.concatenate(samples[name])
            n = module.mem.shape[0]
            # K-means normal prototypes, fixed initialization and bounded iterations.
            centers = vectors[
                rng.choice(len(vectors), n, replace=len(vectors) < n)
            ].copy()
            for _ in range(12):
                distance = ((vectors[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
                assign = distance.argmin(1)
                for i in range(n):
                    if np.any(assign == i):
                        centers[i] = vectors[assign == i].mean(0)
            module.mem = torch.as_tensor(centers, dtype=torch.float64)
    freeze(model)
