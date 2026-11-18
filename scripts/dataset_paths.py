"""Explicit dataset roots shared by exporters, verification and deployment."""

import argparse
import json
import os
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
RETAINED = ("data/source", "data/models", "data/reference")


def archive_root(project=PROJECT):
    project = Path(project).resolve()
    configured = os.environ.get("SHOWCASE_DATA_ROOT")
    settings = project / ".qa/data-location.json"
    if not configured and settings.is_file():
        configured = json.loads(settings.read_text(encoding="utf8"))["root"]
    if configured:
        root = Path(configured).expanduser()
        return (project / root).resolve() if not root.is_absolute() else root.resolve()
    if all((project / name).is_dir() for name in RETAINED):
        return project
    sibling = project.with_name(project.name + "-实验数据")
    return sibling if sibling.is_dir() else project


def retained_path(name, project=PROJECT):
    """Resolve a portable manifest path without changing its recorded spelling."""
    if (
        not isinstance(name, str)
        or "\\" in name
        or ":" in name
        or any(part in ("", ".", "..") for part in name.split("/"))
    ):
        raise ValueError(f"Invalid retained data path: {name}")
    is_retained = any(name == folder or name.startswith(folder + "/") for folder in RETAINED)
    root = archive_root(project) if is_retained else Path(project).resolve()
    target = root / name
    if not target.resolve().is_relative_to(root):
        raise ValueError(f"Retained data path escapes its directory: {name}")
    return target


DATASETS = {
    "converter": (retained_path("data/reference"), PROJECT / "public/data/journey"),
    "wind": (retained_path("data/reference/wind"), PROJECT / "public/data/wind"),
}


def dataset_info(source):
    """Normalize the legacy converter title at the source-reading boundary."""
    value = source.get("dataset")
    if isinstance(value, dict):
        return value
    return {"id": "converter", "title": value or "第一批换流设备", "samplingMinutes": 60}


def selected_dataset():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", choices=DATASETS, default="converter")
    return parser.parse_args().dataset


def selected_paths():
    return DATASETS[selected_dataset()]
