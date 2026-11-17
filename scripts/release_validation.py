"""Check that a release uses the verified evaluation version, without choosing thresholds."""

import json
import re
from pathlib import Path

from evaluation_policy import POLICY


def config_entries(source):
    """Read top-level directives of this project's single server block."""
    match = re.search(r"^\s*server\s*\{", source, re.MULTILINE)
    if not match:
        raise ValueError("Missing dedicated server block")
    begin = match.end()
    entries = []
    depth, quote, comment, escaped = 0, None, False, False
    for position in range(begin, len(source)):
        char = source[position]
        if comment:
            if char == "\n":
                comment = False
            continue
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == "#":
            comment = True
        elif char == "{":
            depth += 1
        elif char == "}":
            if depth == 0:
                if source[position + 1 :].strip():
                    raise ValueError("Unexpected content outside the dedicated server")
                return entries, position
            depth -= 1
            if depth == 0:
                entries.append(source[begin : position + 1])
                begin = position + 1
        elif char == ";" and depth == 0:
            entries.append(source[begin : position + 1])
            begin = position + 1
    raise ValueError("Unclosed dedicated server block")


def config_key(entry):
    header = re.sub(r"(?m)^\s*#.*$", "", entry).strip()
    if header.startswith("location "):
        location = re.match(r"""location\s+(?:"[^"]*"|'[^']*'|[^{'"])*""", header)
        return " ".join(location.group(0).split())
    if header.startswith("include "):
        return " ".join(header.split(";", 1)[0].split())
    return header.split()[0]


def fallback_release(existing, current, target):
    """A repeated deployment retains the same preceding release."""
    if current != target:
        return current
    match = re.search(r"location @previous_assets\s*\{\s*root\s+([^;]+);", existing)
    fallback = match.group(1) if match else current
    if Path(fallback).parent != Path(current).parent:
        raise ValueError("Unexpected previous release path")
    return fallback


def site_config(existing, desired, previous=None):
    """Update all owned rules, retaining unrelated includes and locations."""
    for source in (existing, desired):
        if "listen 9010;" not in source or "root /var/www/xuji-showcase/current;" not in source:
            raise ValueError("Unexpected dedicated site configuration")
    if previous is not None:
        if Path(previous).parent != Path("/var/www/xuji-showcase/releases"):
            raise ValueError("Unexpected previous release path")
        desired = desired.replace("/var/www/xuji-showcase/previous", previous)
    current_entries, _ = config_entries(existing)
    wanted_entries, end = config_entries(desired)
    owned = {config_key(entry) for entry in wanted_entries}
    extra = [entry for entry in current_entries if config_key(entry) not in owned]
    if not extra:
        return desired
    return desired[:end].rstrip() + "".join(extra) + "\n" + desired[end:]


def validate_evaluation(
    folder, reference, manifest_file="manifest.json", evaluation_file="evaluation.json"
):
    folder = Path(folder)
    manifest = json.loads((folder / manifest_file).read_text(encoding="utf8"))
    evaluation = json.loads((folder / evaluation_file).read_text(encoding="utf8"))
    source = json.loads(Path(reference).read_text(encoding="utf8"))
    if not manifest["resultVersion"] == evaluation["version"] == source["resultVersion"]:
        raise ValueError("Evaluation versions differ")
    if evaluation["policy"] != {key: source["evaluation"][key] for key in POLICY}:
        raise ValueError("Evaluation policy differs")

    def models_by_id(models):
        result = {model["id"]: model for model in models}
        if not models or len(result) != len(models):
            raise ValueError("Empty or duplicate evaluation models")
        return result

    expected = models_by_id(source["models"])
    actual = models_by_id(manifest["models"])
    records = models_by_id(evaluation["models"])
    if not expected.keys() == actual.keys() == records.keys():
        raise ValueError("Evaluation model sets differ")
    for name, model in actual.items():
        for key in ("threshold", "windowThreshold", "scores", "metrics", "run"):
            if model[key] != expected[name][key]:
                raise ValueError(f"Evaluation result differs: {name}/{key}")
        if model["run"] != manifest["resultVersion"]:
            raise ValueError(f"Evaluation run differs: {name}")
        for key, threshold in [("sequence", "threshold"), ("window", "windowThreshold")]:
            if (
                records[name][key] != expected[name]["evaluation"][key]
                or model[threshold] != records[name][key]["value"]
            ):
                raise ValueError(f"Evaluation record differs: {name}/{key}")
