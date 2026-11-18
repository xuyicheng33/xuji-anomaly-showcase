"""Exercise generated remote Python and rollback without connecting to a server."""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import deploy_release as deployment


class DeploymentTests(unittest.TestCase):
    def test_large_remote_python_uses_stdin(self):
        source = "value = " + repr("展示数据" * 20000) + "\nprint(len(value))\n"
        self.assertGreater(len(source.encode("utf8")), 131072)
        for sudo in (False, True):
            with self.subTest(sudo=sudo):
                client = MagicMock()
                stdin, stdout, stderr = MagicMock(), MagicMock(), MagicMock()
                client.exec_command.return_value = stdin, stdout, stderr
                stdout.read.return_value = b"80000\n"
                stderr.read.return_value = b""
                stdout.channel.recv_exit_status.return_value = 0
                self.assertEqual(deployment.remote_python(client, source, sudo=sudo), "80000\n")
                client.exec_command.assert_called_once_with(
                    ("sudo -n " if sudo else "") + "python3 -B -", timeout=120
                )
                stdin.write.assert_called_once_with(source.encode("utf8"))
                stdin.channel.shutdown_write.assert_called_once()

    def test_invalid_new_result_stops_before_ssh_connection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            (root / ".qa").mkdir()
            (root / "data").mkdir()
            (root / ".qa/build.json").write_text(json.dumps({"commit": "abcdef0", "files": {}}))
            result = {
                "dataset": "wind",
                "reference": "reference/results/wind1",
                "manifest": {"file": "results-v1/m/manifest.json"},
                "evaluation": {"file": "results-v1/e/evaluation.json"},
            }
            (root / "data/results-index.json").write_text(json.dumps({"results": [result]}))
            datasets = {
                name: (root / "reference" / name, root / "public/data" / name)
                for name in ("converter", "wind")
            }

            def validate(*args):
                if len(args) == 4:
                    raise ValueError("New result evaluation differs")

            with (
                patch.object(deployment, "__file__", str(root / "scripts/deploy_release.py")),
                patch.object(deployment, "DATASETS", datasets),
                patch.object(deployment, "verify_archive_data"),
                patch.object(deployment, "validate_evaluation", side_effect=validate) as checked,
                patch.object(deployment.paramiko, "SSHClient") as ssh,
                patch.object(deployment.subprocess, "check_output", return_value=""),
                patch.object(deployment.subprocess, "run"),
                patch("sys.argv", ["deploy"]),
            ):
                with self.assertRaisesRegex(ValueError, "New result evaluation differs"):
                    deployment.main()
                ssh.assert_not_called()
                self.assertEqual(
                    checked.call_args.args,
                    (
                        root / "dist/data/wind",
                        root / result["reference"] / "manifest.json",
                        result["manifest"]["file"],
                        result["evaluation"]["file"],
                    ),
                )

    def test_entry_checks_evaluation_in_dist_data_before_connecting(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            (root / ".qa").mkdir()
            (root / ".qa/build.json").write_text(
                json.dumps(
                    {
                        "verified": True,
                        "commit": "abcdef0",
                        "files": {},
                    }
                ),
                encoding="utf8",
            )
            datasets = {
                name: (root / "reference" / name, root / "public/data" / name)
                for name in ("journey", "wind")
            }
            with (
                patch.object(deployment, "__file__", str(root / "scripts/deploy_release.py")),
                patch.object(deployment, "DATASETS", datasets),
                patch.object(deployment, "verify_archive_data") as verify_archive,
                patch.object(deployment, "validate_evaluation") as validate,
                patch.object(deployment, "publish") as publish,
                patch.object(deployment.paramiko, "SSHClient"),
                patch.object(deployment.subprocess, "check_output", return_value=""),
                patch.object(deployment.subprocess, "run"),
                patch("sys.argv", ["deploy", "--qa-dir", str(root / ".qa/deployment")]),
            ):
                deployment.main()
            verify_archive.assert_called_once_with(project=root)
            self.assertEqual(
                [call.args for call in validate.call_args_list],
                [
                    (root / "dist/data" / name, root / "reference" / name / "manifest.json")
                    for name in ("journey", "wind")
                ],
            )
            self.assertTrue(callable(publish.call_args.args[-1]))

    def test_publish_checks_public_datasets_and_reports_retention_failure_separately(self):
        sources = []
        root = Path(__file__).resolve().parents[1]
        config = (root / "deploy/nginx-9010.conf").read_text(encoding="utf8")

        def run(client, command, *, input_text=None):
            if command.startswith("readlink"):
                return "/var/www/xuji-showcase/releases/old"
            if command.startswith("curl"):
                return "200"
            if "python3" in command:
                source = input_text
                compile(source, "<remote-python>", "exec")
                sources.append(source)
                if "folder.rglob" in source:
                    return "{}"
                if "print(Path" in source:
                    return config
                if "print(rollback_config" in source:
                    return "/var/www/xuji-showcase/config-backups/abcdef0.conf"
                if "release_files.prune_releases" in source:
                    raise RuntimeError("simulated retention failure")
            return ""

        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary).resolve()
            (folder / "deploy").mkdir()
            (folder / "deploy/nginx-9010.conf").write_text(config, encoding="utf8")
            for name in ("journey", "wind"):
                data = folder / "dist/data" / name
                data.mkdir(parents=True)
                (data / "manifest.json").write_text(
                    json.dumps(
                        {
                            "models": [{"windows": {"chunks": [{"file": "windows-v1/0.bin"}]}}],
                        }
                    ),
                    encoding="utf8",
                )
            error = io.StringIO()
            with patch.object(deployment, "run", side_effect=run), redirect_stderr(error):
                deployment.publish_locked(
                    MagicMock(), folder, folder, "abcdef0123", {}, "test publication"
                )
            self.assertIn("Release abcdef0 is live; retention cleanup failed", error.getvalue())
            self.assertEqual(
                json.loads((folder / "deploy-result.json").read_text())["release"], "abcdef0"
            )
            probes = [source for source in sources if "urlopen" in source]
            self.assertEqual(len(probes), 2)
            self.assertIn("data/journey/windows-v1/", probes[0])
            self.assertIn("data/wind/windows-v1/", probes[1])
            self.assertIn("shutil.rmtree", sources[-1])
            self.assertFalse(list(folder.glob("*.tar.gz")))

    def exercise_activation(self, failed_command=None, failed_probe=False, failed_browser=False):
        commands, functions = [], []

        def run(client, command, *, input_text=None):
            commands.append(command)
            if command == failed_command and commands.count(command) == 1:
                raise RuntimeError("simulated command failure")
            if "python3" in command:
                source = input_text
                compile(source, "<remote-python>", "exec")
                if "release_files." in source:
                    functions.append(source.strip().splitlines()[-1])
                if failed_probe and "urlopen" in source:
                    raise RuntimeError("range probe failed")
            return "200" if command.startswith("curl") else ""

        with patch.object(deployment, "run", side_effect=run):
            arguments = (
                object(),
                "/tmp/staging",
                "/releases/new",
                "/releases/old",
                "/backups/current.conf",
                "digest",
                ["data/journey/windows-v1/0.bin"],
            )
            verify = MagicMock(
                side_effect=RuntimeError("browser mismatch") if failed_browser else None
            )
            if failed_command or failed_probe or failed_browser:
                with self.assertRaises(RuntimeError):
                    deployment.activate(*arguments, verify)
                self.assertIn("restore_config", functions[-1])
                if failed_command == "sudo -n nginx -t":
                    self.assertFalse(any("switch_release" in function for function in functions))
                else:
                    self.assertIn("/releases/old", functions[-2])
            else:
                deployment.activate(*arguments, verify)
                verify.assert_called_once()
                self.assertIn("/releases/new", functions[-1])
        return commands

    def test_successful_activation_and_remote_sources(self):
        self.exercise_activation()

    def test_config_reload_and_range_failures_roll_back(self):
        self.exercise_activation(failed_command="sudo -n nginx -t")
        self.exercise_activation(failed_command="sudo -n systemctl reload nginx")
        self.exercise_activation(failed_probe=True)
        self.exercise_activation(failed_browser=True)

    def test_failed_config_precondition_does_not_switch_or_restore(self):
        with patch.object(
            deployment, "release_call", side_effect=ValueError("configuration changed")
        ) as call:
            with self.assertRaisesRegex(ValueError, "configuration changed"):
                deployment.activate(None, "staging", "new", "old", "backup", "digest", [])
            self.assertEqual(call.call_count, 1)

    def test_lock_contention_stops_before_publication(self):
        client = MagicMock()
        stdin, stdout, stderr = MagicMock(), MagicMock(), MagicMock()
        client.exec_command.return_value = stdin, stdout, stderr
        stdout.readline.return_value = ""
        stderr.read.return_value = b"Another deployment owns the dedicated 9010 site"
        with patch.object(deployment, "publish_locked") as publish:
            with self.assertRaisesRegex(RuntimeError, "Another deployment"):
                deployment.publish(client, None, None, "", {}, "")
            publish.assert_not_called()
        stdin.channel.shutdown_write.assert_called_once()

    def test_rollback_failure_preserves_primary_error(self):
        with (
            patch.object(deployment, "release_call") as call,
            patch.object(deployment, "run") as run,
        ):
            call.side_effect = [None, RuntimeError("restore failed")]
            run.side_effect = RuntimeError("invalid nginx configuration")
            with self.assertRaisesRegex(RuntimeError, "invalid nginx configuration") as error:
                deployment.activate(None, "staging", "new", "old", "backup", "digest", [])
            self.assertIn("restore failed", error.exception.__notes__[0])
