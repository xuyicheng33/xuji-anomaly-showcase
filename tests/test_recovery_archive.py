"""Exercise exact staging recovery, output exclusion and backward-compatible restoration."""

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from backup_project import RETAINED, create_backup, prune_backups
from recovery_archive import digest, git, json_bytes, verify_archive
from restore_project import restore


class RecoveryArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "project"
        self.root.mkdir()
        git(self.root, "init", "-q")
        git(self.root, "config", "user.name", "Recovery test")
        git(self.root, "config", "user.email", "test@example.invalid")
        (self.root / ".gitignore").write_bytes(b".qa/\ndata/\n")
        (self.root / "app.txt").write_bytes(b"original\n")
        (self.root / "removed.txt").write_bytes(b"delete me\n")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "Initial")
        for name in RETAINED:
            (self.root / name).mkdir(parents=True, exist_ok=True)

    def test_recovery_preserves_staged_unstaged_deletions_and_intent_to_add(self):
        (self.root / "app.txt").write_bytes(b"staged edit\n")
        git(self.root, "add", "app.txt")
        (self.root / "app.txt").write_bytes(b"unstaged edit\n")
        git(self.root, "rm", "removed.txt")
        (self.root / "planned.txt").write_bytes(b"intent to add\n")
        git(self.root, "add", "-N", "planned.txt")
        (self.root / "new.txt").write_bytes(b"untracked\n")
        expected_status = git(self.root, "status", "--porcelain=v1", "-z")
        expected_staged = git(self.root, "diff", "--cached", "--binary")
        expected_unstaged = git(self.root, "diff", "--binary")
        backup = create_backup(self.root, self.root / ".qa/backups")
        destination = Path(self.temporary.name) / "restored"
        restore(backup["archive"], destination)
        self.assertEqual(git(destination, "status", "--porcelain=v1", "-z"), expected_status)
        self.assertEqual(git(destination, "diff", "--cached", "--binary"), expected_staged)
        self.assertEqual(git(destination, "diff", "--binary"), expected_unstaged)
        self.assertEqual((destination / "app.txt").read_bytes(), b"unstaged edit\n")
        self.assertEqual(git(destination, "remote").strip(), b"")

    def test_output_is_excluded_even_when_not_ignored_and_content_is_deduplicated(self):
        (self.root / "data/source/duplicate.txt").write_bytes(b"original\n")
        (self.root / "data/source/extra.txt").write_bytes(b"extra content")
        (self.root / "data/reference/same.txt").write_bytes(b"extra content")
        output = self.root / "recovery-copies"
        first = create_backup(self.root, output)
        second = create_backup(self.root, output)
        self.assertEqual(first["stateId"], second["stateId"])
        with zipfile.ZipFile(second["archive"]) as package:
            state = json.loads(package.read("workspace.json"))
            self.assertFalse(any(name.startswith("recovery-copies/") for name in state["files"]))
            self.assertEqual(state["files"]["app.txt"], state["files"]["data/source/duplicate.txt"])
            self.assertIn("git", state["contents"][state["files"]["app.txt"]])
            self.assertEqual(
                state["files"]["data/source/extra.txt"], state["files"]["data/reference/same.txt"]
            )
            self.assertEqual(
                len([name for name in package.namelist() if name.startswith("objects/")]), 1
            )

    def test_same_commit_different_workspace_states_survive_retention(self):
        output = self.root / ".qa/backups"
        first = create_backup(self.root, output)
        (self.root / "app.txt").write_bytes(b"new draft\n")
        second = create_backup(self.root, output)
        third = create_backup(self.root, output)
        self.assertEqual(first["release"], second["release"])
        self.assertNotEqual(first["stateId"], second["stateId"])
        self.assertEqual(second["stateId"], third["stateId"])
        prune_backups(output, 3, apply=True)
        self.assertTrue(Path(first["archive"]).exists())
        self.assertFalse(Path(second["archive"]).exists())
        self.assertTrue(Path(third["archive"]).exists())

    def test_failed_verification_leaves_no_archive_or_staging(self):
        output = self.root / ".qa/backups"
        with patch("backup_project.verify_archive", side_effect=ValueError("corrupt snapshot")):
            with self.assertRaisesRegex(ValueError, "corrupt snapshot"):
                create_backup(self.root, output)
        self.assertEqual(list(output.iterdir()), [])

    def test_legacy_archive_restores_and_bad_member_cannot_escape(self):
        bundle = Path(self.temporary.name) / "legacy.bundle"
        git(self.root, "bundle", "create", str(bundle), "--all")
        archive = Path(self.temporary.name) / "legacy.zip"
        members = {
            "repository.bundle": bundle.read_bytes(),
            "workspace/app.txt": b"legacy edit\r\n",
        }
        with zipfile.ZipFile(archive, "w") as package:
            records = {"workspace/removed.txt": None}
            for name, raw in members.items():
                package.writestr(name, raw)
                records[name] = digest(raw)
            package.writestr("manifest.json", json_bytes(records))
        verify_archive(archive)
        destination = Path(self.temporary.name) / "legacy-restored"
        restore(archive, destination)
        self.assertEqual((destination / "app.txt").read_bytes(), b"legacy edit\r\n")
        self.assertFalse((destination / "removed.txt").exists())
        bad = Path(self.temporary.name) / "bad.zip"
        with zipfile.ZipFile(bad, "w") as package:
            package.writestr("workspace/../../outside", b"bad")
            package.writestr(
                "manifest.json", json_bytes({"workspace/../../outside": digest(b"bad")})
            )
        with self.assertRaises(ValueError):
            restore(bad, Path(self.temporary.name) / "bad-restore")
        self.assertFalse((Path(self.temporary.name) / "outside").exists())
