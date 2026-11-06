"""Compare threshold selection against a direct, independent enumeration."""
import sys
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from evaluation_policy import select_threshold, point_adjust


def brute_force(scores, labels):
    rows, truth = np.atleast_2d(scores), np.atleast_2d(labels).astype(bool)
    distinct = sorted(set(np.asarray(scores).ravel()))
    candidates = [distinct[0] - 1e-12, *[(a + b) / 2 for a, b in zip(distinct, distinct[1:])], distinct[-1] + 1e-12]
    results = []
    for threshold in candidates:
        prediction = rows > threshold
        adjusted = prediction.copy()
        for r, y in enumerate(truth):
            start = 0
            while start < len(y):
                if not y[start]:
                    start += 1
                    continue
                end = start + 1
                while end < len(y) and y[end]:
                    end += 1
                if prediction[r, start:end].any():
                    adjusted[r, start:end] = True
                start = end
        def f1(p):
            tp, fp, fn = int((p & truth).sum()), int((p & ~truth).sum()), int((~p & truth).sum())
            return 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0
        results.append((f1(adjusted), f1(prediction), threshold))
    return max(results)


class EvaluationPolicyTests(unittest.TestCase):
    def test_point_adjust_only_extends_hit_abnormal_segments(self):
        labels = [1, 1, 0, 1, 1, 0, 1]
        prediction = np.array([0, 1, 1, 0, 0, 0, 0], dtype=bool)
        np.testing.assert_array_equal(point_adjust(labels, prediction), [1, 1, 1, 0, 0, 0, 0])
        np.testing.assert_array_equal(prediction, [0, 1, 1, 0, 0, 0, 0])

    def test_matches_exhaustive_search_with_ties_and_window_boundaries(self):
        rng = np.random.default_rng(27)
        for shape in [(13,), (4, 9)]:
            for _ in range(30):
                scores = rng.integers(0, 8, shape) / 10
                labels = rng.integers(0, 2, shape)
                actual = select_threshold(scores, labels)
                expected = brute_force(scores, labels)
                self.assertAlmostEqual(actual['pointAdjustedF1'], expected[0])
                self.assertAlmostEqual(actual['pointWiseF1'], expected[1])
                np.testing.assert_array_equal(scores > actual['value'], scores > expected[2])

    def test_empty_classes_and_constant_scores(self):
        for labels in [np.zeros(8), np.ones(8)]:
            actual = select_threshold(np.full(8, .3), labels)
            expected = brute_force(np.full(8, .3), labels)
            self.assertAlmostEqual(actual['pointAdjustedF1'], expected[0])

    def test_rejects_invalid_scores(self):
        with self.assertRaises(ValueError):
            select_threshold([float('nan')], [1])


if __name__ == '__main__':
    unittest.main()
