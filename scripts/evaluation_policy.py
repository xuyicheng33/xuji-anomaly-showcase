"""Deterministic retrospective evaluation for the frozen showcase outputs."""

import numpy as np

POLICY = {
    "id": "pa-f1-exhaustive-v1",
    "name": "事后回看评估",
    "objective": "point_adjusted_f1",
    "candidates": "midpoints between distinct scores plus bounds outside the score range",
    "comparison": "score > threshold",
    "tieBreak": ["point_wise_f1", "higher_threshold"],
    "usesTestLabels": True,
    "windowSegments": "each 64-point window is evaluated independently",
}


def policy_for_window(window):
    return {**POLICY, "windowSegments": f"each {window}-point window is evaluated independently"}


def select_threshold(scores, labels):
    """Search every achievable alarm set; window boundaries split PA segments."""
    scores, labels = np.asarray(scores, float), np.asarray(labels, bool)
    if scores.shape != labels.shape or scores.ndim not in (1, 2) or not scores.size:
        raise ValueError("scores and labels must be equally shaped nonempty sequences")
    if not np.isfinite(scores).all():
        raise ValueError("scores must be finite")
    rows = scores.reshape(1, -1) if scores.ndim == 1 else scores
    truth = labels.reshape(rows.shape)
    maxima, lengths = [], []
    for row, y in zip(rows, truth):
        for begin, end in np.flatnonzero(np.diff(np.r_[0, y, 0])).reshape(-1, 2):
            maxima.append(row[begin:end].max())
            lengths.append(end - begin)
    flat, y = scores.ravel(), labels.ravel()
    unique = np.unique(flat)
    margin = max(1.0, float(np.ptp(unique))) * 1e-12
    candidates = np.r_[unique[0] - margin, unique[:-1] + np.diff(unique) / 2, unique[-1] + margin]
    positives, negatives = np.sort(flat[y]), np.sort(flat[~y])
    tp = len(positives) - np.searchsorted(positives, candidates, side="right")
    fp = len(negatives) - np.searchsorted(negatives, candidates, side="right")
    order = np.argsort(maxima)
    segment_maxima = np.asarray(maxima)[order]
    weights = np.r_[0, np.cumsum(np.asarray(lengths, dtype=int)[order])]
    pa_tp = int(y.sum()) - weights[np.searchsorted(segment_maxima, candidates, side="right")]
    pw_den, pa_den = tp + fp + y.sum(), pa_tp + fp + y.sum()
    pw_f1 = np.divide(2 * tp, pw_den, out=np.zeros(len(candidates)), where=pw_den != 0)
    pa_f1 = np.divide(2 * pa_tp, pa_den, out=np.zeros(len(candidates)), where=pa_den != 0)
    best = np.lexsort((candidates, pw_f1, pa_f1))[-1]
    return {
        "value": float(candidates[best]),
        "candidateCount": len(candidates),
        "sampleCount": flat.size,
        "abnormalCount": int(y.sum()),
        "sequenceCount": len(rows),
        "pointWiseF1": float(pw_f1[best]),
        "pointAdjustedF1": float(pa_f1[best]),
        "tp": int(tp[best]),
        "fp": int(fp[best]),
        "paTp": int(pa_tp[best]),
        "selectedCandidateIndex": int(best),
    }


def counts(labels, prediction):
    y = np.asarray(labels, dtype=bool)
    p = np.asarray(prediction, dtype=bool)
    tp = int((y & p).sum())
    fp = int((~y & p).sum())
    fn = int((y & ~p).sum())
    tn = int((~y & ~p).sum())
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    }


def point_adjust(labels, prediction):
    adjusted = np.asarray(prediction, bool).copy()
    truth = np.asarray(labels, bool)
    for begin, end in np.flatnonzero(np.diff(np.r_[0, truth, 0])).reshape(-1, 2):
        if adjusted[begin:end].any():
            adjusted[begin:end] = True
    return adjusted
