"""Exercise recovery contents and the binding between browser checks and a build."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(folder, *args):
    subprocess.run(["git", "-C", str(folder), *args], check=True, capture_output=True)


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        git(self.folder, "init", "-q")
        git(self.folder, "config", "user.name", "Maintenance test")
        git(self.folder, "config", "user.email", "test@example.invalid")
        (self.folder / ".gitignore").write_text(".qa/\ndist/\nignored.txt\n")
        (self.folder / "app.txt").write_text("initial source")
        git(self.folder, "add", ".")
        git(self.folder, "commit", "-qm", "Initial source")

    def test_backup_includes_new_code_and_current_tracked_content(self):
        spec = importlib.util.spec_from_file_location("backup", ROOT / "scripts/backup_project.py")
        backup = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(backup)
        (self.folder / "app.txt").write_text("edited source")
        (self.folder / "new-page.tsx").write_text("new component")
        (self.folder / "ignored.txt").write_text("not part of workspace backup")
        for name in backup.RETAINED:
            target = self.folder / name
            target.mkdir(parents=True)
            (target / "source.txt").write_text("retained experiment")
        with patch.object(backup, "ROOT", self.folder), patch("sys.argv", ["backup"]):
            with contextlib.redirect_stdout(io.StringIO()):
                backup.main()
        archive = next((self.folder / ".qa/backups").glob("*.zip"))
        with zipfile.ZipFile(archive) as package:
            self.assertEqual(package.read("workspace/app.txt"), b"edited source")
            self.assertEqual(package.read("workspace/new-page.tsx"), b"new component")
            self.assertNotIn("workspace/ignored.txt", package.namelist())
            self.assertIn("repository.bundle", package.namelist())
            for name in backup.RETAINED:
                self.assertIn(f"workspace/{name}/source.txt", package.namelist())

    def test_release_record_requires_browser_checks_for_the_same_build(self):
        (self.folder / "dist").mkdir()
        (self.folder / "dist/index.html").write_text("build one")
        script = ROOT / "scripts/build_record.mjs"
        subprocess.run(["node", str(script), "build"], cwd=self.folder, check=True, capture_output=True)
        record = json.loads((self.folder / ".qa/build.json").read_text())
        browser = {**record, "files": {"index.html": "another build"}}
        (self.folder / ".qa/browser.json").write_text(json.dumps(browser))
        result = subprocess.run(["node", str(script), "verify"], cwd=self.folder, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(json.loads((self.folder / ".qa/build.json").read_text())["verified"])
        (self.folder / ".qa/browser.json").write_text(json.dumps(record))
        subprocess.run(["node", str(script), "verify"], cwd=self.folder, check=True, capture_output=True)
        self.assertTrue(json.loads((self.folder / ".qa/build.json").read_text())["verified"])

        result = subprocess.run(
            ["node", str(ROOT / "scripts/verify_browser.mjs")], cwd=self.folder,
            env={**os.environ, "SHOWCASE_URL": "http://127.0.0.1:1/"}, capture_output=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"Release verification uses local dist", result.stderr)

    def test_restore_preserves_workspace_edits_and_deletions(self):
        modules = {}
        for name in ("backup_project", "restore_project"):
            spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
            modules[name] = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(modules[name])
        backup = modules["backup_project"]
        (self.folder / "removed.txt").write_text("deleted before backup")
        (self.folder / "staged.txt").write_text("staged deletion")
        (self.folder / "old-name.txt").write_text("renamed file")
        git(self.folder, "add", ".")
        git(self.folder, "commit", "-qm", "Files to remove")
        (self.folder / "removed.txt").unlink()
        git(self.folder, "rm", "staged.txt")
        git(self.folder, "mv", "old-name.txt", "new-name.txt")
        (self.folder / "app.txt").write_text("edited source")
        (self.folder / "new.txt").write_text("new file")
        for name in backup.RETAINED:
            target = self.folder / name
            target.mkdir(parents=True)
            (target / "source.txt").write_text("retained experiment")
        with patch.object(backup, "ROOT", self.folder), patch("sys.argv", ["backup"]):
            with contextlib.redirect_stdout(io.StringIO()):
                backup.main()
        archive = next((self.folder / ".qa/backups").glob("*.zip"))
        restored = modules["restore_project"].restore(archive, self.folder / "restored")
        self.assertFalse((restored / "removed.txt").exists())
        self.assertFalse((restored / "staged.txt").exists())
        self.assertFalse((restored / "old-name.txt").exists())
        self.assertEqual((restored / "new-name.txt").read_text(), "renamed file")
        self.assertEqual((restored / "app.txt").read_text(), "edited source")
        self.assertEqual((restored / "new.txt").read_text(), "new file")
        for name in backup.RETAINED:
            self.assertEqual((restored / name / "source.txt").read_text(), "retained experiment")
        git(restored, "log", "--all", "--oneline")
