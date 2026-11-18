"""Failed generation or directory switching must preserve the complete previous export."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import export_journey


class ExportTransactionTests(unittest.TestCase):
    def test_invalid_policy_does_not_copy_windows_into_public(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            reference, public = root / "reference", root / "public"
            reference.mkdir()
            public.mkdir()
            (reference / "manifest.json").write_text(json.dumps({"evaluation": {}, "models": []}))
            (public / "manifest.json").write_bytes(b"previous manifest")
            with self.assertRaisesRegex(ValueError, "policy"):
                export_journey.export(reference, public, "converter")
            self.assertEqual((public / "manifest.json").read_bytes(), b"previous manifest")
            self.assertFalse(list(root.glob(".public-export-*")))

    def test_failed_switch_restores_old_tree_then_success_removes_obsolete(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            reference, public = root / "reference", root / "public"
            reference.mkdir()
            public.mkdir()
            (public / "old.bin").write_bytes(b"complete old data")

            def build(_reference, candidate, _dataset):
                candidate.mkdir()
                (candidate / "new.bin").write_bytes(b"complete new data")

            original_replace = export_journey.os.replace

            def fail_switch(source, target):
                if Path(source).name == "next":
                    raise OSError("simulated switch failure")
                original_replace(source, target)

            with patch.object(export_journey, "build_dataset", side_effect=build):
                with patch.object(export_journey.os, "replace", side_effect=fail_switch):
                    with self.assertRaisesRegex(OSError, "switch"):
                        export_journey.export(reference, public, "converter")
                self.assertEqual((public / "old.bin").read_bytes(), b"complete old data")
                export_journey.export(reference, public, "converter")
            self.assertEqual([p.name for p in public.iterdir()], ["new.bin"])
            self.assertFalse(list(root.glob(".public-export-*")))

    def test_destination_cannot_overwrite_retained_sources(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            reference = root / "reference"
            reference.mkdir()
            for public in (root, reference, reference / "nested"):
                with self.assertRaises(ValueError):
                    export_journey.export(reference, public, "converter")
