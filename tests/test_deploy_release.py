"""Exercise generated remote Python and rollback without connecting to a server."""
from pathlib import Path
import json
import shlex
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import deploy_release as deployment


class DeploymentTests(unittest.TestCase):
    def test_publish_builds_valid_sources_and_uses_public_dataset_paths(self):
        sources = []
        root = Path(__file__).resolve().parents[1]
        config = (root / 'deploy/nginx-9010.conf').read_text(encoding='utf8')

        def run(client, command):
            if command.startswith('readlink'):
                return '/var/www/xuji-showcase/releases/old'
            if command.startswith('curl'):
                return '200'
            if 'python3' in command:
                source = shlex.split(command)[-1]
                compile(source, '<remote-python>', 'exec')
                sources.append(source)
                if 'folder.rglob' in source:
                    return '{}'
                if 'print(Path' in source:
                    return config
            return ''

        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / 'deploy').mkdir()
            (folder / 'deploy/nginx-9010.conf').write_text(config, encoding='utf8')
            for name in ('journey', 'wind'):
                data = folder / 'dist/data' / name
                data.mkdir(parents=True)
                (data / 'manifest.json').write_text(json.dumps({
                    'models': [{'windows': {'chunks': [{'file': 'windows-v1/0.bin'}]}}],
                }), encoding='utf8')
            with patch.object(deployment, 'run', side_effect=run):
                deployment.publish(MagicMock(), folder, folder, 'abcdef0123', {}, 'test publication')
            probes = [source for source in sources if 'urlopen' in source]
            self.assertEqual(len(probes), 2)
            self.assertIn('data/journey/windows-v1/', probes[0])
            self.assertIn('data/wind/windows-v1/', probes[1])
            self.assertIn('shutil.rmtree', sources[-1])
            self.assertFalse(list(folder.glob('*.tar.gz')))

    def exercise_activation(self, failed_command=None, failed_probe=False, failed_browser=False):
        commands, functions = [], []

        def run(client, command):
            commands.append(command)
            if command == failed_command and commands.count(command) == 1:
                raise RuntimeError('simulated command failure')
            if 'python3' in command:
                source = shlex.split(command)[-1]
                compile(source, '<remote-python>', 'exec')
                if 'release_files.' in source:
                    functions.append(source.strip().splitlines()[-1])
                if failed_probe and 'urlopen' in source:
                    raise RuntimeError('range probe failed')
            return '200' if command.startswith('curl') else ''

        with patch.object(deployment, 'run', side_effect=run):
            arguments = (object(), '/tmp/staging', '/releases/new', '/releases/old',
                         '/backups/current.conf', 'digest', ['data/journey/windows-v1/0.bin'])
            verify = MagicMock(side_effect=RuntimeError('browser mismatch') if failed_browser else None)
            if failed_command or failed_probe or failed_browser:
                with self.assertRaises(RuntimeError):
                    deployment.activate(*arguments, verify)
                self.assertIn('restore_config', functions[-2])
                self.assertIn('/releases/old', functions[-1])
            else:
                deployment.activate(*arguments, verify)
                verify.assert_called_once()
                self.assertIn('/releases/new', functions[-1])
        return commands

    def test_successful_activation_and_remote_sources(self):
        self.exercise_activation()

    def test_config_reload_and_range_failures_roll_back(self):
        self.exercise_activation(failed_command='sudo -n nginx -t')
        self.exercise_activation(failed_command='sudo -n systemctl reload nginx')
        self.exercise_activation(failed_probe=True)
        self.exercise_activation(failed_browser=True)
