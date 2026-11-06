"""Exercise interrupted release preparation and repeat publication."""
import hashlib
import gzip
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from release_files import hashes, prepare_release, install_config, restore_config


class ReleaseFileTests(unittest.TestCase):
    def test_failed_copy_can_retry_and_completed_release_is_reusable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            previous, target = root / 'old', root / 'new'
            previous.mkdir()
            (previous / 'obsolete.txt').write_text('removed in next release')
            source = root / 'index.html'
            source.write_text('verified content' * 1000)
            archive = root / 'changes.tar.gz'
            with tarfile.open(archive, 'w:gz') as package:
                package.add(source, arcname='index.html')
            expected = {'index.html': hashlib.sha256(source.read_bytes()).hexdigest()}
            with self.assertRaises(ValueError):
                prepare_release(previous, target, archive, {'index.html': 'wrong'}, ['index.html'])
            self.assertFalse(target.exists())
            self.assertTrue((previous / 'obsolete.txt').exists())
            prepare_release(previous, target, archive, expected, ['index.html'])
            self.assertEqual(hashes(target), expected)
            self.assertTrue((target / 'index.html.gz').exists())
            self.assertEqual(prepare_release(previous, target, archive, expected, []), target)
            self.assertEqual(prepare_release(target, target, archive, expected, []), target)
            (target / 'index.html.gz').write_bytes(gzip.compress(b'corrupted'))
            with self.assertRaises(ValueError):
                prepare_release(previous, target, archive, expected, [])

    def test_config_backup_and_restore_preserve_exact_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config, backup, replacement = [root / name for name in ('site.conf', 'backup.conf', 'next.conf')]
            config.write_bytes(b'original\n')
            replacement.write_bytes(b'updated\n')
            digest = hashlib.sha256(config.read_bytes()).hexdigest()
            with self.assertRaises(ValueError):
                install_config(config, backup, replacement, 'wrong digest')
            self.assertFalse(backup.exists())
            install_config(config, backup, replacement, digest)
            self.assertEqual(config.read_bytes(), b'updated\n')
            restore_config(config, backup)
            self.assertEqual(config.read_bytes(), b'original\n')
