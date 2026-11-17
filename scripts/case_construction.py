"""Reproduce the frozen case inputs for local export verification only."""

import numpy as np

START, BEGIN, END, SEED = 107, 18, 42, 20261028


def construct(clean, selected_features=None, window=64):
    """Separate candidate construction from replacement/blending composition.

    Reference flipping, uniform value, peak selection and repeat-interleave
    follow demoNew03.py. Lengthening is restricted to the selected interval and
    dimensions: the historical function also shifts the tail without labeling
    all changed dimensions; that behavior is deliberately not copied.
    """
    begin, end = round(BEGIN * window / 64), round(END * window / 64)
    peak, patch = round(30 * window / 64), max(1, round(4 * window / 64))
    span = end - begin
    if span % 3 or not 0 <= begin < end <= window:
        raise ValueError("Unsupported retained case geometry")
    base = clean[START : START + window].copy()
    # A fixed multivariate selection makes the aggregate score interpretable.
    features = [
        4,
        5,
        6,
        9,
        11,
        13,
        16,
        17,
        18,
        20,
        22,
        24,
        26,
        28,
        30,
        32,
        34,
        36,
        38,
        40,
        42,
        44,
        46,
        48,
        50,
        52,
        54,
        56,
        58,
        60,
        62,
        64,
    ]
    if selected_features is not None:
        features = selected_features
    feature_count = clean.shape[1]
    rng = np.random.default_rng(SEED)
    mask = np.ones((window, feature_count), np.uint8)
    zero_span = window // 4
    for f, offset in enumerate(rng.integers(0, window - zero_span + 1, feature_count)):
        mask[offset : offset + zero_span, f] = 0
    cases = []
    for kind in ["reference", "uniform", "peak", "length"]:
        candidate = base.copy()
        labels = np.zeros_like(base, np.uint8)
        weights = np.zeros_like(base)
        source = {"file": "processed/converterold/converter_test.npy", "start": START}
        active = np.zeros_like(base, bool)
        if kind == "reference":
            source.update(referenceStart=175, verticalFlip=True, horizontalFlip=True)
            reference = 1 - clean[175 : 175 + span, features][::-1]
            candidate[begin:end, features] = reference
            active[begin:end, features] = True
            labels[begin:end, features] = 1
        elif kind == "uniform":
            values = rng.uniform(0.08, 0.18, len(features))
            values[features.index(4)] = 0.923039436340332
            candidate[begin:end, features] = values
            source.update(values=values.tolist())
            active[begin:end, features] = True
            labels[begin:end, features] = 1
        elif kind == "peak":
            opposite = (base[peak, features] < 0.5).astype(float)
            values = opposite + 0.1 * (1 - 2 * opposite) * rng.random(len(features))
            candidate[peak, features] = values
            active[peak, features] = True
            labels[max(0, peak - patch) : min(window, peak + patch + 1), features] = 1
            source.update(peak=peak, patchSize=patch, values=values.tolist())
        else:
            scale = 3
            candidate[begin:end, features] = np.repeat(
                base[begin : begin + span // scale, features], scale, axis=0
            )
            active[begin:end, features] = True
            labels[begin:end, features] = 1
            source.update(
                scale=scale,
                sourceBegin=begin,
                sourceEnd=begin + span // scale,
                boundary="selected interval and features only; tail unchanged",
            )
        for insertion in ["replace", "blend"]:
            weights.fill(0)
            weights[active] = 1 if insertion == "replace" else 0.7
            if insertion == "blend" and kind != "peak":
                # Same 10% warmup/cooldown rule as the research soft replacement.
                warmup = span // 10
                envelope = (
                    np.r_[
                        np.linspace(0, 0.7, warmup),
                        np.full(span - 2 * warmup, 0.7),
                        np.linspace(0.7, 0, warmup),
                    ]
                    if warmup
                    else np.full(span, 0.7)
                )
                weights[begin:end, features] = envelope[:, None]
            after = base * (1 - weights) + candidate * weights
            cases.append(
                dict(
                    id=f"{insertion}-{kind}",
                    insertion=insertion,
                    kind=kind,
                    start=START,
                    begin=begin,
                    end=end,
                    feature=4 if kind in ["uniform", "length"] else 5,
                    features=features,
                    source=source,
                    original=base.copy(),
                    candidate=candidate.copy(),
                    weights=weights.copy(),
                    input=after,
                    labels=labels.copy(),
                    mask=mask.copy(),
                )
            )
    return cases
