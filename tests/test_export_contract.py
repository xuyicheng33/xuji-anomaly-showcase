"""Keep legacy source metadata compatible with both dataset exporters."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from dataset_paths import dataset_info


class ExportContractTests(unittest.TestCase):
    def test_converter_legacy_title_and_missing_metadata(self):
        for source in [{'dataset': '第一批换流设备'}, {}]:
            self.assertEqual(dataset_info(source), {
                'id': 'converter', 'title': '第一批换流设备', 'samplingMinutes': 60,
            })

    def test_wind_keeps_all_source_metadata(self):
        source = {'dataset': {'id': 'wind', 'title': '风电设备', 'samplingMinutes': 15,
                              'sourceFiles': ['all_short.csv'], 'missingValues': 0}}
        self.assertIs(dataset_info(source), source['dataset'])
