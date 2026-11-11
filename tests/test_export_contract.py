"""Keep legacy source metadata compatible with both dataset exporters."""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from array_assets import curve_columns, read_array, write_array
from dataset_paths import dataset_info


class ExportContractTests(unittest.TestCase):
    def test_converter_legacy_title_and_missing_metadata(self):
        for source in [{"dataset": "第一批换流设备"}, {}]:
            self.assertEqual(
                dataset_info(source),
                {
                    "id": "converter",
                    "title": "第一批换流设备",
                    "samplingMinutes": 60,
                },
            )

    def test_wind_keeps_all_source_metadata(self):
        source = {
            "dataset": {
                "id": "wind",
                "title": "风电设备",
                "samplingMinutes": 15,
                "sourceFiles": ["all_short.csv"],
                "missingValues": 0,
            }
        }
        self.assertIs(dataset_info(source), source["dataset"])

    def test_array_reader_rejects_equal_length_corruption_and_keeps_shape(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            values = np.array([[1.0, 2.0], [3.0, 4.0]])
            asset = write_array(folder, "values.bin", values)
            np.testing.assert_array_equal(read_array(folder, asset), values)
            (folder / asset["file"]).write_bytes(np.zeros_like(values).tobytes())
            with self.assertRaisesRegex(ValueError, "values.bin"):
                read_array(folder, asset)

    def test_mean_curve_keeps_left_to_right_summation(self):
        columns = dict(curve_columns(np.array([[1e16, 1.0, -1e16], [1.0, 2.0, 3.0]]), True))
        np.testing.assert_array_equal(columns["mean"], [0.0, 2.0])
