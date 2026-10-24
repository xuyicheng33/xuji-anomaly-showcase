import sys, json, hashlib, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from server.data import ROOT, PUBLIC, catalog
from server.official import evaluate_archive


class OfficialTests(unittest.TestCase):
    def test_only_archived_experiments(self):
        c = catalog()
        self.assertTrue(c["officialOnly"])
        self.assertEqual(list(c["datasets"]), ["converter"])
        self.assertEqual([e["id"] for e in c["datasets"]["converter"]["experiments"]], ["historical-model1", "historical-model2", "historical-model3"])

    def test_arrays_match_server_files(self):
        for e in catalog()["datasets"]["converter"]["experiments"]:
            source = ROOT / "data/source/results/converter" / e["model"]
            for key, filename in {"raw":"testRaw.npy","recon":"recon.npy","scores":"lossFinal.npy","errors":"lossPerFeat.npy","labels":"labels.npy"}.items():
                meta = e["files"][key]
                binary = PUBLIC / meta["url"].removeprefix("/data/")
                actual = np.fromfile(binary, dtype=meta["dtype"]).reshape(meta["shape"])
                expected = np.load(source / filename).astype(meta["dtype"]).reshape(meta["shape"])
                np.testing.assert_array_equal(actual, expected)
                self.assertEqual(hashlib.sha256((source / filename).read_bytes()).hexdigest(), e["sourceHashes"][filename])

    def test_model3_server_scan_threshold(self):
        e = catalog()["datasets"]["converter"]["experiments"][2]
        self.assertAlmostEqual(e["threshold"], 0.049309469580217175, places=14)
        self.assertEqual(e["metrics"]["adjusted"]["tp"], 322)
        self.assertEqual(e["metrics"]["adjusted"]["fp"], 74)
        self.assertEqual(e["metrics"]["adjusted"]["fn"], 168)
        self.assertAlmostEqual(e["metrics"]["adjusted"]["f1"], 644 / 886, places=14)

    def test_predictions_follow_original_script(self):
        for e in catalog()["datasets"]["converter"]["experiments"]:
            source = ROOT / "data/source/results/converter" / e["model"]
            threshold, prediction, _ = evaluate_archive(source / "viz_best.py", np.load(source / "lossFinal.npy").reshape(-1), np.load(source / "labels.npy").reshape(-1))
            exported = np.fromfile(PUBLIC / e["files"]["predictions"]["url"].removeprefix("/data/"), np.uint8)
            np.testing.assert_array_equal(prediction, exported)
            self.assertEqual(threshold, e["threshold"])


if __name__ == "__main__":
    unittest.main()
