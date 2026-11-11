"""Shared recovery format: one Git bundle plus content-addressed workspace additions."""

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


def sha256(file):
    with Path(file).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf8")


def git(root, *args, input=None):
    return subprocess.check_output(
        ["git", "-C", str(root), *args], input=input, stderr=subprocess.PIPE
    )


def safe_path(root, name):
    if (
        not isinstance(name, str)
        or not name
        or "\\" in name
        or ":" in name
        or "\0" in name
        or any(part in ("", ".", "..") or part.lower() == ".git" for part in name.split("/"))
    ):
        raise ValueError(f"Unexpected recovery path: {name}")
    file = Path(root) / name
    if not file.resolve().is_relative_to(Path(root).resolve()) or file.is_symlink():
        raise ValueError(f"Unexpected recovery path: {name}")
    return file


class GitObjects:
    """Read raw blobs through one Git process, without checkout filters or line conversions."""

    def __init__(self, root):
        self.process = subprocess.Popen(
            ["git", "-C", str(root), "cat-file", "--batch"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def __enter__(self):
        return self

    def read(self, oid):
        if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", oid):
            raise ValueError("Invalid recovery Git object")
        self.process.stdin.write((oid + "\n").encode())
        self.process.stdin.flush()
        header = self.process.stdout.readline().decode().strip().split()
        if len(header) != 3 or header[:2] != [oid, "blob"]:
            raise ValueError(f"Missing recovery Git blob: {oid}")
        raw = self.process.stdout.read(int(header[2]))
        if len(raw) != int(header[2]) or self.process.stdout.read(1) != b"\n":
            raise ValueError(f"Incomplete recovery Git blob: {oid}")
        return raw

    def __exit__(self, *_):
        self.process.stdin.close()
        self.process.stdout.close()
        self.process.stderr.close()
        self.process.wait(timeout=30)


def repository_state(root):
    branch = subprocess.run(
        ["git", "-C", str(root), "symbolic-ref", "--quiet", "--short", "HEAD"],
        capture_output=True,
        text=True,
    ).stdout.strip()
    refs = {}
    for line in (
        git(root, "for-each-ref", "--format=%(refname) %(objectname)").decode().splitlines()
    ):
        name, oid = line.split(" ", 1)
        if name.startswith(("refs/heads/", "refs/tags/")) or name == "refs/stash":
            refs[name] = oid
    return {
        "head": git(root, "rev-parse", "HEAD").decode().strip(),
        "branch": branch or None,
        "refs": refs,
    }


def tree_entries(root):
    entries = {}
    for item in filter(None, git(root, "ls-tree", "-r", "-z", "HEAD").split(b"\0")):
        meta, name = item.split(b"\t", 1)
        mode, kind, oid = meta.decode().split()
        if kind != "blob" or mode not in ("100644", "100755"):
            raise ValueError(
                "Recovery currently requires regular files, without submodules or symbolic links"
            )
        entries[name.decode("utf8")] = {"mode": mode, "oid": oid}
    return entries


def index_entries(root):
    entries = {}
    for item in filter(None, git(root, "ls-files", "--stage", "-z").split(b"\0")):
        meta, name = item.split(b"\t", 1)
        mode, oid, stage = meta.decode().split()
        if stage != "0" or mode not in ("100644", "100755"):
            raise ValueError("Resolve index conflicts and unsupported file types before backup")
        entries[name.decode("utf8")] = {"mode": mode, "oid": oid}
    return entries


def read_records(package):
    names = package.namelist()
    if len(names) != len(set(names)):
        raise ValueError("Duplicate recovery archive members")
    records = json.loads(package.read("manifest.json"))
    if set(names) != {
        "manifest.json",
        *(name for name, value in records.items() if value is not None),
    }:
        raise ValueError("Recovery archive members differ from the manifest")
    for name, expected in records.items():
        safe_path(Path(tempfile.gettempdir()) / "xuji-recovery-members", name)
        if expected is not None:
            with package.open(name) as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                    raise ValueError(f"Recovery archive checksum mismatch: {name}")
    return records


def extract_bundle(package, destination):
    with package.open("repository.bundle") as source, Path(destination).open("xb") as output:
        shutil.copyfileobj(source, output)


def read_content(package, objects, content, expected):
    raw = objects.read(content["git"]) if "git" in content else package.read(content["member"])
    if len(raw) != content["bytes"] or digest(raw) != expected:
        raise ValueError(f"Recovery content checksum mismatch: {expected}")
    return raw


def validate_workspace(workspace):
    if workspace.get("version") != 2:
        raise ValueError("Unsupported recovery workspace version")
    contents = workspace["contents"]
    for name, content in workspace["files"].items():
        safe_path(Path(tempfile.gettempdir()) / "xuji-recovery-files", name)
        if content not in contents:
            raise ValueError(f"Missing workspace recovery content: {name}")
    for name in workspace["deleted"]:
        safe_path(Path(tempfile.gettempdir()) / "xuji-recovery-files", name)
        if name in workspace["files"]:
            raise ValueError(f"Conflicting workspace deletion: {name}")
    for name, entry in workspace["index"].items():
        safe_path(Path(tempfile.gettempdir()) / "xuji-recovery-files", name)
        if entry["mode"] not in ("100644", "100755") or entry["content"] not in contents:
            raise ValueError(f"Invalid recovery index entry: {name}")
    if not set(workspace.get("intentToAdd", [])) <= workspace["index"].keys():
        raise ValueError("Invalid recovery intent-to-add entries")


def verify_archive(archive):
    with zipfile.ZipFile(archive) as package:
        records = read_records(package)
        if "workspace.json" not in records:
            return
        workspace = json.loads(package.read("workspace.json"))
        validate_workspace(workspace)
        with tempfile.TemporaryDirectory(prefix="xuji-backup-verify-") as temporary:
            bundle = Path(temporary) / "repository.bundle"
            repository = Path(temporary) / "repository.git"
            extract_bundle(package, bundle)
            git(temporary, "clone", "--bare", "--quiet", str(bundle), str(repository))
            with GitObjects(repository) as objects:
                for expected, content in workspace["contents"].items():
                    read_content(package, objects, content, expected)


def recovery_identity(package):
    if "workspace.json" in package.namelist():
        state = json.loads(package.read("workspace.json"))
        repository = json.loads(package.read("repository.json"))
        identity = {key: state[key] for key in ("files", "deleted", "index", "intentToAdd")}
        return digest(json_bytes({"repository": repository, **identity}))
    records = json.loads(package.read("manifest.json"))
    repository = json.loads(package.read("repository.json")) if "repository.json" in records else {}
    return "legacy-" + digest(json_bytes({"repository": repository, "files": records}))
