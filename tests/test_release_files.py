"""Exercise interrupted release preparation and repeat publication."""

import gzip
import hashlib
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from release_files import (
    hashes,
    install_config,
    prune_releases,
    restore_config,
    rollback_config,
)
from release_files import (
    prepare_release as prepare_from_inventory,
)


def prepare_release(previous, target, archive, expected, changed):
    return prepare_from_inventory(previous, target, archive, expected, changed, hashes(previous))


class ReleaseFileTests(unittest.TestCase):
    def test_renamed_immutable_payload_reuses_previous_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            previous, target = root / "old", root / "new"
            previous.mkdir()
            original = previous / "data/windows-v1/model/0.bin"
            original.parent.mkdir(parents=True)
            original.write_bytes(b"exact retained float32" * 1000)
            checksum = hashlib.sha256(original.read_bytes()).hexdigest()
            name = f"data/windows-v1/{checksum}/model/0.bin"
            archive = root / "changes.tar.gz"
            with tarfile.open(archive, "w:gz"):
                pass
            prepare_release(previous, target, archive, {name: checksum}, [])
            self.assertEqual((target / name).read_bytes(), original.read_bytes())
            self.assertEqual((target / name).stat().st_ino, original.stat().st_ino)
            self.assertFalse((target / (name + ".gz")).exists())

    def test_repeat_deployment_keeps_predecessor_config_not_active_config(self):
        with tempfile.TemporaryDirectory() as temporary:
            site = Path(temporary).resolve()
            (site / "config-backups").mkdir()
            saved = site / "config-backups/original.conf"
            saved.write_text("configuration for previous release")
            current = str(site / "releases/current")
            previous = str(site / "releases/previous")
            (site / "deployment.json").write_text(
                json.dumps(
                    {
                        "releasePath": current,
                        "previousRelease": "previous",
                        "rollbackConfig": str(saved),
                    }
                )
            )
            self.assertEqual(
                rollback_config(site, current, current, previous, "new.conf"), str(saved)
            )
            self.assertEqual(
                rollback_config(site, previous, current, previous, "new.conf"), "new.conf"
            )
            saved.unlink()
            with self.assertRaises(ValueError):
                rollback_config(site, current, current, previous, "new.conf")

    def test_failed_copy_can_retry_and_completed_release_is_reusable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            previous, target = root / "old", root / "new"
            previous.mkdir()
            (previous / "obsolete.txt").write_text("removed in next release")
            source = root / "index.html"
            source.write_text("verified content" * 1000)
            archive = root / "changes.tar.gz"
            with tarfile.open(archive, "w:gz") as package:
                package.add(source, arcname="index.html")
            expected = {"index.html": hashlib.sha256(source.read_bytes()).hexdigest()}
            with self.assertRaises(ValueError):
                prepare_release(previous, target, archive, {"index.html": "wrong"}, ["index.html"])
            self.assertFalse(target.exists())
            self.assertTrue((previous / "obsolete.txt").exists())
            prepare_release(previous, target, archive, expected, ["index.html"])
            self.assertEqual(hashes(target), expected)
            self.assertTrue((target / "index.html.gz").exists())
            self.assertEqual(prepare_release(previous, target, archive, expected, []), target)
            self.assertEqual(prepare_release(target, target, archive, expected, []), target)
            (target / "index.html.gz").write_bytes(gzip.compress(b"corrupted"))
            with self.assertRaises(ValueError):
                prepare_release(previous, target, archive, expected, [])

    def test_config_backup_and_restore_preserve_exact_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            config, backup, replacement = [
                root / name for name in ("site.conf", "backup.conf", "next.conf")
            ]
            config.write_bytes(b"original\n")
            replacement.write_bytes(b"updated\n")
            digest = hashlib.sha256(config.read_bytes()).hexdigest()
            with self.assertRaises(ValueError):
                install_config(config, backup, replacement, "wrong digest")
            self.assertFalse(backup.exists())
            install_config(config, backup, replacement, digest)
            self.assertEqual(config.read_bytes(), b"updated\n")
            restore_config(config, backup)
            self.assertEqual(config.read_bytes(), b"original\n")

    def test_raw_range_windows_drop_inherited_gzip_and_never_generate_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            previous, target = root / "old", root / "new"
            previous.mkdir()
            window = previous / "data/wind/windows-v1/model2/windows-0000.bin"
            window.parent.mkdir(parents=True)
            window.write_bytes(b"\x00" * 4096)
            window.with_name(window.name + ".gz").write_bytes(gzip.compress(window.read_bytes()))
            contribution = previous / "data/wind/contributions-v1/model2/0.bin"
            contribution.parent.mkdir(parents=True)
            contribution.write_bytes(b"\x01" * 4096)
            expected = hashes(previous)
            archive = root / "changes.tar.gz"
            with tarfile.open(archive, "w:gz"):
                pass
            prepare_release(previous, target, archive, expected, [])
            self.assertEqual(hashes(target), expected)
            shipped_window = target / window.relative_to(previous)
            shipped_contribution = target / contribution.relative_to(previous)
            self.assertFalse(shipped_window.with_name(window.name + ".gz").exists())
            self.assertTrue(shipped_contribution.with_name(contribution.name + ".gz").exists())
            self.assertTrue(window.with_name(window.name + ".gz").exists())

    def test_unchanged_files_share_storage_and_replacements_never_mutate_previous(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            previous, target = root / "old", root / "new"
            previous.mkdir()
            (previous / "shared.bin").write_bytes(b"shared" * 1000)
            (previous / "shared.bin.gz").write_bytes(
                gzip.compress((previous / "shared.bin").read_bytes())
            )
            (previous / "index.html").write_bytes(b"old" * 1000)
            (previous / "index.html.gz").write_bytes(
                gzip.compress((previous / "index.html").read_bytes())
            )
            before = {p.name: p.read_bytes() for p in previous.iterdir()}
            fresh = root / "index.html"
            fresh.write_bytes(b"new" * 1000)
            archive = root / "changes.tar.gz"
            with tarfile.open(archive, "w:gz") as package:
                package.add(fresh, arcname="index.html")
            expected = {
                **hashes(previous),
                "index.html": hashlib.sha256(fresh.read_bytes()).hexdigest(),
            }
            prepare_release(previous, target, archive, expected, ["index.html"])
            self.assertEqual(
                (target / "shared.bin").stat().st_ino, (previous / "shared.bin").stat().st_ino
            )
            self.assertEqual(
                (target / "shared.bin.gz").stat().st_ino, (previous / "shared.bin.gz").stat().st_ino
            )
            self.assertNotEqual(
                (target / "index.html").stat().st_ino, (previous / "index.html").stat().st_ino
            )
            self.assertEqual(before, {p.name: p.read_bytes() for p in previous.iterdir()})
            broken = root / "broken"
            with self.assertRaises(ValueError):
                prepare_release(
                    previous,
                    broken,
                    archive,
                    {**expected, "index.html": "incorrect"},
                    ["index.html"],
                )
            self.assertFalse(broken.exists())
            self.assertFalse(list(root.glob(".broken-*")))
            self.assertEqual(before, {p.name: p.read_bytes() for p in previous.iterdir()})

    def test_archive_rejects_unlisted_members_without_touching_previous(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            previous, target = root / "old", root / "new"
            previous.mkdir()
            (previous / "index.html").write_text("old")
            archive = root / "changes.tar.gz"
            with tarfile.open(archive, "w:gz") as package:
                package.add(previous / "index.html", arcname="../outside.html")
            with self.assertRaises(ValueError):
                prepare_release(previous, target, archive, hashes(previous), [])
            self.assertFalse(target.exists())
            self.assertFalse((root / "outside.html").exists())
            self.assertEqual((previous / "index.html").read_text(), "old")

    def test_retention_keeps_current_previous_unknown_folders_and_config(self):
        with tempfile.TemporaryDirectory() as temporary:
            site = Path(temporary).resolve()
            releases = site / "releases"
            releases.mkdir()
            for name in ["aaaaaaa", "bbbbbbb", "ccccccc", "unrelated"]:
                (releases / name).mkdir()
                (releases / name / "index.html").write_text(name)
            # The current path is allowed to be a real directory in Windows tests.
            current = releases / "ccccccc"
            previous = releases / "bbbbbbb"
            (site / "config-backups").mkdir()
            backup = site / "config-backups/ccccccc-20261111000000000000.conf"
            backup.write_text("verified rollback")
            from unittest.mock import patch

            original_resolve = Path.resolve

            def resolve(path, *args, **kwargs):
                return (
                    current if path == site / "current" else original_resolve(path, *args, **kwargs)
                )

            with patch.object(Path, "resolve", resolve):
                result = prune_releases(site, current, previous, backup)
            self.assertEqual(result["removedReleases"], ["aaaaaaa"])
            self.assertEqual(
                {p.name for p in releases.iterdir()}, {"bbbbbbb", "ccccccc", "unrelated"}
            )
            self.assertEqual(backup.read_text(), "verified rollback")
