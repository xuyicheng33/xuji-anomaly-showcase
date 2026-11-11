"""Data updates change resource paths while retained numeric bytes remain exact."""

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from data_versions import version_assets


class DataVersionTests(unittest.TestCase):
    def build(self, folder, payload):
        folder.mkdir()
        file = folder / "windows-v1/model/0.bin"
        file.parent.mkdir(parents=True)
        file.write_bytes(payload)
        asset = {
            "file": "windows-v1/model/0.bin",
            "sha256": hashlib.sha256(payload).hexdigest(),
            "bytes": len(payload),
        }
        nested = json.dumps({"rows": [asset, asset]}).encode()
        index = folder / "calculation-v2/manifest.json"
        index.parent.mkdir()
        index.write_bytes(nested)
        (folder / "manifest.json").write_text(
            json.dumps(
                {
                    "window": asset,
                    "index": {
                        "file": "calculation-v2/manifest.json",
                        "sha256": hashlib.sha256(nested).hexdigest(),
                        "bytes": len(nested),
                    },
                }
            )
        )
        return version_assets(folder)

    def test_new_content_has_new_path_and_same_content_keeps_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            old = self.build(root / "old", b"old numeric bytes")
            new = self.build(root / "new", b"new numeric bytes")
            same = self.build(root / "same", b"old numeric bytes")
            self.assertNotEqual(old["window"]["file"], new["window"]["file"])
            self.assertNotEqual(old["index"]["file"], new["index"]["file"])
            self.assertEqual(old, same)
            for directory, manifest, payload in [
                (root / "old", old, b"old numeric bytes"),
                (root / "new", new, b"new numeric bytes"),
            ]:
                self.assertEqual((directory / manifest["window"]["file"]).read_bytes(), payload)
                index = json.loads((directory / manifest["index"]["file"]).read_bytes())
                self.assertEqual(index["rows"], [manifest["window"], manifest["window"]])
                self.assertFalse((directory / "windows-v1/model/0.bin").exists())
