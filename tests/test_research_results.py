"""Regression checks for the retained research results, independent of any UI."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.evaluate_results import ROOT, evaluate_model


class ResearchResultsTests(unittest.TestCase):
    def test_original_thresholds_and_confusion_counts(self):
        cases = {
            "model1": (0.03153185243407894, (439, 48, 51, 1859)),
            "model2": (0.03197041806617129, (439, 52, 51, 1855)),
            "model3": (0.049309469580217175, (322, 74, 168, 1833)),
        }
        for model_id, (threshold, expected) in cases.items():
            with self.subTest(model=model_id):
                result = evaluate_model(model_id)
                self.assertAlmostEqual(result["threshold"], threshold, places=14)
                actual = result["point_adjusted"]
                self.assertEqual(tuple(actual[key] for key in ("tp", "fp", "fn", "tn")), expected)
                self.assertEqual(result["test_rows"], 2397)
                self.assertEqual(result["anomaly_rows"], 490)

    def test_three_models_use_the_same_saved_input(self):
        folders = [ROOT / "data/source/results/converter" / model_id
                   for model_id in ("model1", "model2", "model3")]
        for filename in ("testRaw.npy", "labels.npy", "matrix.npy"):
            first = np.load(folders[0] / filename)
            for folder in folders[1:]:
                np.testing.assert_array_equal(first, np.load(folder / filename))

    def test_feature_labels_match_time_labels(self):
        for model_id in ("model1", "model2", "model3"):
            folder = ROOT / "data/source/results/converter" / model_id
            np.testing.assert_array_equal(
                np.load(folder / "matrix.npy").max(axis=1),
                np.load(folder / "labels.npy"),
            )


if __name__ == "__main__":
    unittest.main()
