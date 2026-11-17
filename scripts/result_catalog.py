"""Frozen result registrations; legacy dataset paths remain independently usable."""

import json
from pathlib import Path

from dataset_paths import DATASETS, PROJECT

INDEX = PROJECT / "data/results-index.json"


def results(project=PROJECT):
    index = Path(project) / "data/results-index.json"
    return json.loads(index.read_text(encoding="utf8"))["results"] if index.is_file() else []


def registered_files(public):
    public = Path(public).resolve()
    return {
        name
        for result in results()
        if DATASETS[result["dataset"]][1].resolve() == public
        for name in result["published"]
    } | ({"results.json"} if (public / "results.json").is_file() else set())
