"""External data must remain exact, recoverable and unnecessary for frontend checks."""

import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from backup_project import create_backup
from data_archive import configure, save, verify
from dataset_paths import RETAINED, archive_root, retained_path
from recovery_archive import git
from restore_project import restore
from verify_public import verify as verify_public


class DataArchiveTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "project"
        self.root.mkdir()
        self.archive = self.root.with_name("external-experiments")
        self.environment = patch.dict(os.environ, {"SHOWCASE_DATA_ROOT": ""})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        for name in RETAINED:
            folder = self.root / name
            folder.mkdir(parents=True)
            (folder / "original.bin").write_bytes(b"original experiment\x00\xff")
        (self.root / "data/manifest.json").write_text("[]\n")

    def test_archive_retains_exact_bytes_and_rejects_missing_changed_or_extra_data(self):
        save(self.archive, self.root)
        self.assertEqual(archive_root(self.root), self.archive)
        self.assertEqual(
            retained_path("data/reference/original.bin", self.root),
            self.archive / "data/reference/original.bin",
        )
        self.assertEqual(
            retained_path("data/manifest.json", self.root), self.root / "data/manifest.json"
        )
        target = self.archive / "data/reference/original.bin"
        target.write_bytes(b"corrupted")
        with self.assertRaisesRegex(ValueError, "differs"):
            verify(self.archive, self.root)
        target.unlink()
        with self.assertRaisesRegex(FileNotFoundError, "verify:frontend"):
            verify(self.archive, self.root)
        target.write_bytes(b"original experiment\x00\xff")
        extra = self.archive / "data/reference/unlisted.bin"
        extra.write_bytes(b"extra")
        with self.assertRaisesRegex(ValueError, "inventory differs"):
            verify(self.archive, self.root)
        extra.unlink()
        verify(self.archive, self.root)
        for unsafe in ("data/reference/../outside", "data/reference\\outside", "/outside"):
            with self.assertRaises(ValueError):
                retained_path(unsafe, self.root)

    def test_external_archive_is_included_in_backup_and_restored_as_local_data(self):
        save(self.archive, self.root)
        for name in RETAINED:
            (self.root / name / "original.bin").unlink()
            (self.root / name).rmdir()
        (self.root / "materials").mkdir()
        (self.root / "materials/source.txt").write_text("original material")
        (self.root / ".gitignore").write_text(".qa/\ndata/source/\ndata/models/\ndata/reference/\n")
        git(self.root, "init", "-q")
        git(self.root, "config", "user.name", "Archive test")
        git(self.root, "config", "user.email", "archive@example.invalid")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "Frontend without experiment data")
        backup = create_backup(self.root, self.root / ".qa/backups")
        restored = restore(backup["archive"], self.root.with_name("restored"))
        self.assertFalse((restored / ".qa/data-location.json").exists())
        self.assertEqual(archive_root(restored), restored)
        verify(project=restored)

    def test_frontend_inventory_requires_no_experiment_data(self):
        project = self.root.with_name("frontend-only")
        (project / "public/data").mkdir(parents=True)
        (project / "data").mkdir()
        raw = b"real browser bytes"
        (project / "public/data/window.bin").write_bytes(raw)
        inventory = {
            "schemaVersion": 1,
            "files": {
                "public/data/window.bin": {
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                }
            },
        }
        (project / "data/frontend-assets.json").write_text(json.dumps(inventory))
        verify_public(project)
        with self.assertRaises(FileNotFoundError):
            configure(self.archive, project)
        self.assertFalse((project / ".qa/data-location.json").exists())
        (project / "public/data/window.bin").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_public(project)


if __name__ == "__main__":
    unittest.main()
