import hashlib
import json
import os
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipIf(
    os.environ.get("SHOWCASE_PUBLIC_ONLY") == "1",
    "Retained local sources are checked by npm run verify",
)
class JourneyExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = ROOT / "data/reference"
        cls.data = json.loads((cls.folder / "manifest.json").read_text(encoding="utf-8"))

    def test_mapping_and_counts(self):
        d = self.data
        self.assertEqual((d["summary"]["trainRows"], d["summary"]["testRows"]), (5593, 2397))
        self.assertEqual(d["times"][0], "2022-08-23 03:00")
        self.assertEqual(d["times"][-1], "2022-11-30 23:00")
        self.assertEqual(len(d["features"]), 125)
        self.assertEqual(sum(d["labels"]), 490)
        self.assertEqual(len(d["removedFeatures"]), 11)

    def test_history_and_label_shapes(self):
        self.assertEqual([len(m["history"]) for m in self.data["models"]], [15, 20])
        a = np.fromfile(self.folder / "labels.bin", dtype="<f8").reshape(2397, 125)
        np.testing.assert_array_equal(a.max(1), self.data["labels"])

    def test_formal_clean_baseline_uses_training_statistics(self):
        clean = np.fromfile(self.folder / "clean-full.bin", dtype="<f8").reshape(7992, 125)
        train = clean[1:5594]
        span = np.ptp(train, axis=0)
        expected = np.clip(
            np.divide(
                clean[5595:] - train.min(0), span, out=np.zeros_like(clean[5595:]), where=span != 0
            ),
            0,
            1,
        )
        actual = np.fromfile(self.folder / self.data["cleanTest"]["file"], dtype="<f8").reshape(
            2397, 125
        )
        np.testing.assert_allclose(actual, expected, rtol=0, atol=1e-8)
        self.assertEqual(
            self.data["cleanTest"]["sha256"],
            "b4cc3f349d62ba55ee0f6f4eab2653bdc7af8483b8fcb67e5ed639322a0746fb",
        )

    def test_complete_dataset_assets(self):
        expected = {"raw": (8760, 136), "clean": (7992, 125), "train": (5593, 125)}
        for key, shape in expected.items():
            asset = self.data["datasets"][key]
            payload = (self.folder / asset["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(payload).hexdigest(), asset["sha256"])
            self.assertEqual(tuple(asset["shape"]), shape)
            self.assertEqual(len(asset["times"]), shape[0])
            self.assertEqual(len(asset["keys"]), shape[1])
        clean = np.fromfile(self.folder / "clean-full.bin", dtype="<f8").reshape(7992, 125)
        train = np.fromfile(self.folder / "train-full.bin", dtype="<f8").reshape(5593, 125)
        np.testing.assert_array_equal(clean[1:5594], train)


if __name__ == "__main__":
    unittest.main()
