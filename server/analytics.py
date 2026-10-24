import numpy as np
from scipy.stats import rankdata


def counts(labels, prediction):
    y = np.asarray(labels, dtype=bool)
    p = np.asarray(prediction, dtype=bool)
    tp = int((y & p).sum())
    fp = int((~y & p).sum())
    fn = int((y & ~p).sum())
    tn = int((~y & ~p).sum())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=precision, recall=recall, f1=f1)


def auc_score(labels, scores):
    y = np.asarray(labels) > 0
    n1 = int(y.sum())
    n0 = int((~y).sum())
    if not n1 or not n0:
        return None
    ranks = rankdata(scores)
    return float((ranks[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def point_adjust(labels, prediction):
    y = np.asarray(labels) > 0
    p = np.asarray(prediction, dtype=bool).copy()
    edges = np.diff(np.r_[False, y, False].astype(int))
    for start, end in zip(np.where(edges == 1)[0], np.where(edges == -1)[0]):
        if p[start:end].any():
            p[start:end] = True
    return p


def metrics(labels, scores, threshold):
    pred = np.asarray(scores) > threshold
    return dict(
        direct=counts(labels, pred),
        adjusted=counts(labels, point_adjust(labels, pred)),
        auc=auc_score(labels, scores),
    )


def inject(sequence, kind, seed=42, rate=0.35):
    x = np.asarray(sequence, dtype=float).copy()
    original = x.copy()
    labels = np.zeros(x.shape, dtype=np.uint8)
    rng = np.random.default_rng(seed)
    T, C = x.shape
    for block in range(0, T, 64):
        if rng.random() > rate:
            continue
        end = min(block + 64, T)
        length = max(2, int((end - block) * rng.uniform(0.12, 0.45)))
        start = int(rng.integers(block, max(block + 1, end - length + 1)))
        stop = min(start + length, end)
        cols = rng.choice(C, max(1, int(C * 0.15)), replace=False)
        k = kind
        if kind == "mixed":
            k = rng.choice(["soft", "uniform", "peak", "length"])
        source = original[start:stop, cols].copy()
        if k == "soft":
            other = int(rng.integers(0, max(1, T - (stop - start))))
            x[start:stop, cols] = (
                0.3 * source + 0.7 * original[other : other + stop - start, cols]
            )
        elif k == "uniform":
            x[start:stop, cols] = rng.uniform(0, 1, len(cols))
        elif k == "peak":
            stop = min(start + 2, T)
            x[start:stop, cols] += rng.uniform(0.6, 1.2, len(cols))
        elif k == "length":
            n = stop - start
            grid = np.linspace(0, n - 1, max(2, n // 2))
            coarse = np.stack(
                [np.interp(grid, np.arange(n), source[:, j]) for j in range(len(cols))],
                axis=1,
            )
            x[start:stop, cols] = np.resize(coarse, (n, len(cols)))
        else:
            raise ValueError("未知异常类型")
        labels[start:stop, cols] = 1
    return x, labels
