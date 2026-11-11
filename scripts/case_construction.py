"""Reproduce the frozen case inputs for local export verification only."""
import numpy as np

START, BEGIN, END, SEED = 107, 18, 42, 20261028


def construct(clean, selected_features=None):
    """Separate candidate construction from replacement/blending composition.

    Reference flipping, uniform value, peak selection and repeat-interleave
    follow demoNew03.py. Lengthening is restricted to the selected interval and
    dimensions: the historical function also shifts the tail without labeling
    all changed dimensions; that behavior is deliberately not copied.
    """
    base = clean[START:START + 64].copy()
    # A fixed multivariate selection makes the aggregate score interpretable.
    features = [4, 5, 6, 9, 11, 13, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32,
                34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64]
    if selected_features is not None:
        features = selected_features
    feature_count = clean.shape[1]
    rng = np.random.default_rng(SEED)
    mask = np.ones((64, feature_count), np.uint8)
    for f, begin in enumerate(rng.integers(0, 49, feature_count)):
        mask[begin:begin + 16, f] = 0
    cases = []
    for kind in ['reference', 'uniform', 'peak', 'length']:
        candidate = base.copy()
        labels = np.zeros_like(base, np.uint8)
        weights = np.zeros_like(base)
        source = {'file': 'processed/converterold/converter_test.npy', 'start': START}
        active = np.zeros_like(base, bool)
        if kind == 'reference':
            source.update(referenceStart=175, verticalFlip=True, horizontalFlip=True)
            reference = 1 - clean[175:199, features][::-1]
            candidate[BEGIN:END, features] = reference
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
        elif kind == 'uniform':
            values = rng.uniform(.08, .18, len(features))
            values[features.index(4)] = .923039436340332
            candidate[BEGIN:END, features] = values
            source.update(values=values.tolist())
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
        elif kind == 'peak':
            peak = 30
            opposite = (base[peak, features] < .5).astype(float)
            values = opposite + .1 * (1 - 2 * opposite) * rng.random(len(features))
            candidate[peak, features] = values
            active[peak, features] = True
            labels[peak - 4:peak + 5, features] = 1
            source.update(peak=peak, patchSize=4, values=values.tolist())
        else:
            scale = 3
            candidate[BEGIN:END, features] = np.repeat(base[BEGIN:BEGIN + 8, features], scale, axis=0)
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
            source.update(scale=scale, sourceBegin=BEGIN, sourceEnd=BEGIN + 8,
                          boundary='selected interval and features only; tail unchanged')
        for insertion in ['replace', 'blend']:
            weights.fill(0)
            weights[active] = 1 if insertion == 'replace' else .7
            if insertion == 'blend' and kind != 'peak':
                # Same 10% warmup/cooldown rule as the research soft replacement.
                warmup = (END - BEGIN) // 10
                envelope = np.r_[np.linspace(0, .7, warmup),
                                 np.full(END - BEGIN - 2 * warmup, .7),
                                 np.linspace(.7, 0, warmup)]
                weights[BEGIN:END, features] = envelope[:, None]
            after = base * (1 - weights) + candidate * weights
            cases.append(dict(id=f'{insertion}-{kind}', insertion=insertion, kind=kind,
                              start=START, begin=BEGIN, end=END, feature=4 if kind in ['uniform', 'length'] else 5,
                              features=features, source=source, original=base.copy(), candidate=candidate.copy(),
                              weights=weights.copy(), input=after, labels=labels.copy(), mask=mask.copy()))
    return cases
