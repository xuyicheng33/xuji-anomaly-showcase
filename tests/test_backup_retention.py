"""Backup retention preserves recovery versions and defaults to a preview."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from backup_project import prune_backups


class BackupRetentionTests(unittest.TestCase):
    def test_preview_and_prune_keep_distinct_releases(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            for name, release in [('01', 'a'), ('02', 'b'), ('03', 'b'), ('04', 'c')]:
                archive = folder / f'xuji-{name}.zip'
                with zipfile.ZipFile(archive, 'w') as package:
                    package.writestr('content', release)
                    package.writestr('manifest.json', json.dumps({
                        'content': hashlib.sha256(release.encode()).hexdigest(),
                    }))
                archive.with_suffix('.json').write_text(json.dumps({
                    'release': release, 'bytes': archive.stat().st_size,
                    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'verified': True,
                }), encoding='utf8')
            result = prune_backups(folder, 2)
            self.assertFalse(result['applied'])
            self.assertEqual(len(list(folder.glob('*.zip'))), 4)
            self.assertEqual([Path(r['archive']).name for r in result['archives'] if r['action'] == 'keep'],
                             ['xuji-04.zip', 'xuji-03.zip'])
            damaged = folder / 'xuji-01.zip'
            original = damaged.read_bytes()
            damaged.write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                prune_backups(folder, 2, apply=True)
            self.assertEqual(len(list(folder.glob('*.zip'))), 4)
            damaged.write_bytes(original)
            prune_backups(folder, 2, apply=True)
            self.assertEqual(sorted(p.name for p in folder.glob('*.zip')), ['xuji-03.zip', 'xuji-04.zip'])

    def test_unknown_archive_is_retained_without_a_verification_record(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            archive = folder / 'xuji-unknown.zip'
            archive.write_bytes(b'unverified legacy backup')
            result = prune_backups(folder, 1, apply=True)
            self.assertEqual(result['archives'][0]['action'], 'keep')
            self.assertTrue(archive.exists())
