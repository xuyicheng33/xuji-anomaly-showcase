"""Check the wind source chain and every retained reference file."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from evaluation_policy import counts

ROOT = Path(__file__).resolve().parents[1]


def verify():
    source = ROOT / "data/source/wind"
    reference = ROOT / "data/reference/wind"
    index = json.loads((ROOT / "data/wind-reference-index.json").read_text(encoding="utf8"))
    actual = {p.relative_to(reference).as_posix() for p in reference.rglob("*") if p.is_file()}
    assert actual == set(index), "Wind reference inventory changed"
    for name, digest in index.items():
        assert hashlib.sha256((reference / name).read_bytes()).hexdigest() == digest, name
    data = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
    keys = [f["key"] for f in data["features"]]
    df = pd.read_csv(source / "weather/extracted_data.csv")
    raw_train = np.load(source / "data/xuji_28/train.npy").astype(float)
    raw_test = np.load(source / "data/xuji_28/test.npy").astype(float)
    train = np.load(source / "processed/xuji_28/train.npy")
    test = np.load(source / "processed/xuji_28/test.npy")
    np.testing.assert_array_equal(
        np.concatenate([raw_train, raw_test]), df[keys].to_numpy(dtype=np.float32).astype(float)
    )
    low, high = raw_train.min(0), raw_train.max(0)
    np.testing.assert_array_equal((raw_train - low) / (high - low + 1e-4), train)
    np.testing.assert_array_equal((raw_test - low) / (high - low + 1e-4), test)
    for asset, array in [
        (data["datasets"]["train"], raw_train),
        (data["cleanTest"], test),
        (data["input"], np.load(source / "insertedData/xuji_28/test.npy")),
        (data["labelMatrix"], np.load(source / "insertedData/xuji_28/labels.npy")),
    ]:
        np.testing.assert_array_equal(
            np.fromfile(reference / asset["file"], dtype="<f8").reshape(asset["shape"]), array
        )
    time = pd.to_datetime(df.forecastvaluetime)
    assert time.diff().dropna().eq(pd.Timedelta(minutes=15)).all() and not time.duplicated().any()
    assert data["times"] == time.iloc[len(train) :].dt.strftime("%Y-%m-%d %H:%M").tolist()
    assert set(df.stationid) == {41} and not df[keys].isna().any().any()
    assert data["dataset"]["outsideUnitRange"] == int(((test < 0) | (test > 1)).sum())
    assert (
        hashlib.sha256((ROOT / "data/models/wind/method2.ckpt").read_bytes()).hexdigest()
        == data["models"][0]["provenance"]["checkpointSHA256"]
    )
    model = data["models"][0]
    labels = np.asarray(data["labels"], bool)
    scores = np.asarray(model["scores"])
    prediction = scores > model["threshold"]
    assert model["metrics"]["point_wise"] == counts(labels, prediction)
    adjusted = prediction.copy()
    for begin, end in np.flatnonzero(np.diff(np.r_[0, labels, 0])).reshape(-1, 2):
        if prediction[begin:end].any():
            adjusted[begin:end] = True
    assert model["metrics"]["point_adjusted"] == counts(labels, adjusted)
    ranks = pd.Series(scores).rank(method="average").to_numpy()
    n_positive = int(labels.sum())
    n_negative = len(labels) - n_positive
    auc = (ranks[labels].sum() - n_positive * (n_positive + 1) / 2) / (n_positive * n_negative)
    assert abs(auc - model["metrics"]["continuous_score_auc"]) < 1e-14
    assert len(model["history"]) == 5
    log = next((source / "logs").glob("xuji_28*")).read_text(encoding="utf8")
    for row in model["history"]:
        assert str(row["loss"]) in log
    print(
        f"PASS wind source chain, 28-field normalization, timestamps and {len(index)} retained reference files"
    )


if __name__ == "__main__":
    verify()
