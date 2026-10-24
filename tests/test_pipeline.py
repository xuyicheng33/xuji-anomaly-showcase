import sys, json, time, urllib.request, urllib.error, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from server.analytics import metrics, point_adjust, inject, counts
from server.data import catalog


def request(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api" + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


class DataTests(unittest.TestCase):
    def test_point_adjust_and_counts(self):
        y = [0, 1, 1, 1, 0]
        p = [0, 0, 1, 0, 1]
        self.assertEqual(point_adjust(y, p).tolist(), [False, True, True, True, True])
        self.assertEqual(counts(y, p)["tp"], 1)
        self.assertEqual(counts(y, p)["fn"], 2)

    def test_auc_uses_scores(self):
        m = metrics([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9], 0.5)
        self.assertEqual(m["auc"], 1)
        self.assertEqual(m["direct"]["f1"], 1)

    def test_fixed_injection(self):
        raw = np.tile(np.linspace(0, 1, 320)[:, None], (1, 7))
        for kind in ["soft", "uniform", "peak", "length"]:
            x, y = inject(raw, kind, 42, 0.8)
            a, b = inject(raw, kind, 42, 0.8)
            self.assertTrue(np.array_equal(x, a))
            self.assertTrue(np.array_equal(y, b))
            self.assertTrue(y.any())
            self.assertTrue(np.all((x != raw) <= y))

    def test_artifact_binding(self):
        for ds, d in catalog()["datasets"].items():
            self.assertEqual(d["features"], 125 if ds == "converter" else 7)
            self.assertGreaterEqual(len(d["experiments"]), 3)
            for e in d["experiments"]:
                base = Path("web/public/data") / ds / e["id"]
                y = np.fromfile(base / "labels.bin", np.uint8)
                s = np.fromfile(base / "scores.bin", np.float64)
                m = metrics(y, s, e["threshold"])
                self.assertEqual(m, e["metrics"])

    def test_inference_six_models(self):
        for ds in ["converter", "xuji"]:
            for mid in ["model1", "model2", "model3"]:
                a = request("/infer", dict(dataset=ds, model=mid, index=80))
                b = request("/infer", dict(dataset=ds, model=mid, index=80))
                self.assertAlmostEqual(a["score"], b["score"], places=12)
                self.assertEqual(a["alarm"], a["score"] > a["threshold"])
                self.assertEqual(len(a["input"]), 125 if ds == "converter" else 7)

    def test_invalid_window(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            request("/infer", dict(dataset="xuji", model="model1", window=[[1, 2]]))
        self.assertEqual(caught.exception.code, 422)

    def test_local_job(self):
        j = request(
            "/jobs",
            dict(
                dataset="xuji",
                model="model1",
                epochs=1,
                samples=32,
                seed=142,
                kind="peak",
                split=0.8,
            ),
        )
        deadline = time.time() + 90
        while time.time() < deadline:
            current = next(x for x in request("/jobs") if x["id"] == j["id"])
            if current["status"] in ["complete", "failed", "cancelled"]:
                break
            time.sleep(0.5)
        self.assertEqual(current["status"], "complete", current)
        self.assertTrue((Path("data/jobs") / j["id"] / "model.ckpt").exists())
        a = request(
            "/infer",
            dict(
                dataset="xuji",
                model="model1",
                index=80,
                experiment=current["result"]["id"],
            ),
        )
        self.assertTrue(np.isfinite(a["score"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
