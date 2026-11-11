"""Exercise recovery contents and the binding between browser checks and a build."""

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


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
            workspace = json.loads(package.read("workspace.json"))

            def content(name):
                return package.read(workspace["contents"][workspace["files"][name]]["member"])

            self.assertEqual(content("app.txt"), b"edited source")
            self.assertEqual(content("new-page.tsx"), b"new component")
            self.assertNotIn("ignored.txt", workspace["files"])
            self.assertIn("git", workspace["contents"][workspace["index"][".gitignore"]["content"]])
            self.assertIn("repository.bundle", package.namelist())
            for name in backup.RETAINED:
                self.assertEqual(content(f"{name}/source.txt"), b"retained experiment")

    def test_release_record_requires_browser_checks_for_the_same_build(self):
        (self.folder / "dist").mkdir()
        (self.folder / "dist/index.html").write_text("build one")
        script = ROOT / "scripts/build_record.mjs"
        subprocess.run(
            ["node", str(script), "build"], cwd=self.folder, check=True, capture_output=True
        )
        record = json.loads((self.folder / ".qa/build.json").read_text())
        browser = {**record, "files": {"index.html": "another build"}}
        (self.folder / ".qa/browser.json").write_text(json.dumps(browser))
        result = subprocess.run(
            ["node", str(script), "verify"], cwd=self.folder, capture_output=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(json.loads((self.folder / ".qa/build.json").read_text())["verified"])
        (self.folder / ".qa/browser.json").write_text(json.dumps(record))
        subprocess.run(
            ["node", str(script), "verify"], cwd=self.folder, check=True, capture_output=True
        )
        self.assertTrue(json.loads((self.folder / ".qa/build.json").read_text())["verified"])

        result = subprocess.run(
            ["node", str(ROOT / "scripts/verify_browser.mjs")],
            cwd=self.folder,
            env={**os.environ, "SHOWCASE_URL": "http://127.0.0.1:1/"},
            capture_output=True,
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

    def test_restore_recovers_all_local_branches_without_temporary_remote(self):
        modules = {}
        for name in ("backup_project", "restore_project"):
            spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
            modules[name] = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(modules[name])
        original_branch = subprocess.check_output(
            ["git", "-C", str(self.folder), "branch", "--show-current"], text=True
        ).strip()
        git(self.folder, "switch", "-c", "codex/restore-test")
        (self.folder / "app.txt").write_text("branch contents")
        git(self.folder, "commit", "-am", "Branch change")
        git(self.folder, "tag", "recovery-test")
        for name in modules["backup_project"].RETAINED:
            (self.folder / name).mkdir(parents=True, exist_ok=True)
        with (
            patch.object(modules["backup_project"], "ROOT", self.folder),
            patch("sys.argv", ["backup"]),
        ):
            with contextlib.redirect_stdout(io.StringIO()):
                modules["backup_project"].main()
        archive = next((self.folder / ".qa/backups").glob("*.zip"))
        restored = modules["restore_project"].restore(archive, self.folder / "restored")

        def output(*args):
            return subprocess.check_output(["git", "-C", str(restored), *args], text=True).strip()

        self.assertEqual(output("branch", "--show-current"), "codex/restore-test")
        self.assertEqual(output("remote"), "")
        git(restored, "show-ref", "--verify", f"refs/heads/{original_branch}")
        git(restored, "show-ref", "--verify", "refs/tags/recovery-test")
        with self.assertRaises(FileExistsError):
            modules["restore_project"].restore(archive, restored)

    def test_restore_preserves_crlf_without_false_working_tree_changes(self):
        modules = {}
        for name in ("backup_project", "restore_project"):
            spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
            modules[name] = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(modules[name])
        (self.folder / ".gitattributes").write_text("*.txt text eol=lf\n")
        (self.folder / "line.txt").write_bytes(b"original\n")
        git(self.folder, "add", ".")
        git(self.folder, "commit", "-qm", "Line ending policy")
        (self.folder / "line.txt").write_bytes(b"original\r\n")
        (self.folder / "app.txt").write_text("uncommitted content")
        for name in modules["backup_project"].RETAINED:
            (self.folder / name).mkdir(parents=True, exist_ok=True)
        with (
            patch.object(modules["backup_project"], "ROOT", self.folder),
            patch("sys.argv", ["backup"]),
        ):
            with contextlib.redirect_stdout(io.StringIO()):
                modules["backup_project"].main()
        archive = next((self.folder / ".qa/backups").glob("*.zip"))
        restored = modules["restore_project"].restore(archive, self.folder / "restored")
        self.assertEqual((restored / "line.txt").read_bytes(), b"original\r\n")
        status = subprocess.check_output(
            ["git", "-C", str(restored), "status", "--porcelain"], text=True
        )
        self.assertEqual(status, " M app.txt\n")
        self.assertEqual((restored / "app.txt").read_text(), "uncommitted content")

    def test_release_evaluation_allows_verified_new_version_and_rejects_mismatch(self):
        spec = importlib.util.spec_from_file_location(
            "release_validation", ROOT / "scripts/release_validation.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = {
            "id": "new-model",
            "threshold": 0.4,
            "windowThreshold": 0.5,
            "scores": [0.1, 0.7],
            "metrics": {"f1": 0.8},
            "run": "next-verified-version",
            "evaluation": {
                "sequence": {"value": 0.4, "pointAdjustedF1": 0.8},
                "window": {"value": 0.5},
            },
        }
        manifest = {"resultVersion": "next-verified-version", "models": [model]}
        source = {**manifest, "evaluation": module.POLICY}
        evaluation = {
            "version": manifest["resultVersion"],
            "policy": dict(module.POLICY),
            "models": [{"id": model["id"], **model["evaluation"]}],
        }
        (self.folder / "manifest.json").write_text(json.dumps(manifest))
        (self.folder / "reference.json").write_text(json.dumps(source))
        (self.folder / "evaluation.json").write_text(json.dumps(evaluation))
        module.validate_evaluation(self.folder, self.folder / "reference.json")
        original = json.dumps(evaluation)
        for changed in ["policy", "record", "duplicate"]:
            evaluation = json.loads(original)
            if changed == "policy":
                evaluation["policy"]["usesTestLabels"] = False
            if changed == "record":
                evaluation["models"][0]["sequence"]["pointAdjustedF1"] = -99
            if changed == "duplicate":
                evaluation["models"].append(evaluation["models"][0])
            (self.folder / "evaluation.json").write_text(json.dumps(evaluation))
            with self.assertRaises(ValueError):
                module.validate_evaluation(self.folder, self.folder / "reference.json")
        evaluation = json.loads(original)
        evaluation["models"][0]["sequence"]["value"] = 0.3
        (self.folder / "evaluation.json").write_text(json.dumps(evaluation))
        with self.assertRaises(ValueError):
            module.validate_evaluation(self.folder, self.folder / "reference.json")

    def test_site_config_updates_owned_rules_and_preserves_other_routes(self):
        spec = importlib.util.spec_from_file_location(
            "release_validation", ROOT / "scripts/release_validation.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source = (ROOT / "deploy/nginx-9010.conf").read_text()
        first = source.index("    location ^~ /data/wind/windows-v1/ {")
        last = source.index("\n    }", first) + len("\n    }")
        converter_only = source[:first] + source[last:]
        extra = "\n    include /etc/nginx/coffee-canvas-location.inc;\n    location /coffee/ {\n        if ($request_method = POST) { return 405; }\n        proxy_pass http://127.0.0.1:8080;\n    }\n"
        existing = converter_only[: converter_only.rfind("}")] + extra + "}\n"
        existing = existing.replace("gzip_comp_level 6;", "gzip_comp_level 2;")
        result = module.site_config(existing, source, "/var/www/xuji-showcase/releases/abcdef0")
        self.assertEqual(result.count("location ^~ /data/wind/windows-v1/ {"), 1)
        self.assertEqual(result.count("location ^~ /data/journey/windows-v1/ {"), 1)
        self.assertIn("location /assets/ {", result)
        self.assertIn(extra.strip(), result)
        self.assertIn("gzip_comp_level 6;", result)
        self.assertNotIn("gzip_comp_level 2;", result)
        self.assertIn("root /var/www/xuji-showcase/releases/abcdef0;", result)
        again = module.site_config(result, source, "/var/www/xuji-showcase/releases/abcdef0")
        self.assertEqual(again, result)
        with self.assertRaises(ValueError):
            module.site_config(source, "location / {\n deny all;\n}")
        with self.assertRaises(ValueError):
            module.site_config(source + "\nserver { listen 8080; }", source)
        self.assertEqual(
            module.fallback_release(
                result,
                "/var/www/xuji-showcase/releases/1234567",
                "/var/www/xuji-showcase/releases/1234567",
            ),
            "/var/www/xuji-showcase/releases/abcdef0",
        )
