"""Frozen result registrations; legacy dataset paths remain independently usable."""

import json
from pathlib import Path

from dataset_paths import DATASETS, PROJECT

INDEX = PROJECT / "data/results-index.json"


def results(project=PROJECT):
    index = Path(project) / "data/results-index.json"
    return json.loads(index.read_text(encoding="utf8"))["results"] if index.is_file() else []


def result_method(reference, result):
    data = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
    model = data["models"][0]
    cases = json.loads((reference / "cases" / f"{model['id']}.json").read_text(encoding="utf8"))[
        "cases"
    ]
    example = next(case for case in cases if case["kind"] == "reference")
    peak = next(case for case in cases if case["kind"] == "peak")
    length = next(case for case in cases if case["kind"] == "length")
    return {
        "id": model["id"],
        "name": "STAM-AD" if result["method"] == 1 else "SMST-AD",
        "manifest": result["manifest"],
        "window": data["window"],
        "epochs": len(model["history"]),
        "maskSpan": model["windows"]["maskPolicy"]["zeroSpan"],
        "metrics": model["metrics"],
        "threshold": model["threshold"],
        "windowThreshold": model["windowThreshold"],
        "decoder": "spatiotemporal" if result["id"] == "wind2" else "temporal",
        "caseGeometry": {
            "start": example["start"],
            "begin": example["begin"],
            "end": example["end"],
            "referenceStart": example["source"]["referenceStart"],
            "peak": peak["source"]["peak"],
            "patchSize": peak["source"]["patchSize"],
            "sourceBegin": length["source"]["sourceBegin"],
            "sourceEnd": length["source"]["sourceEnd"],
            "scale": length["source"]["scale"],
        },
    }


def write_catalog(public, dataset, methods):
    catalog = {
        "schemaVersion": 1,
        "dataset": dataset,
        "defaultModel": "model1",
        "methods": sorted(methods, key=lambda method: method["id"]),
    }
    (public / "results.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\r\n"
    )


def registered_files(public):
    public = Path(public).resolve()
    return {
        name
        for result in results()
        if DATASETS[result["dataset"]][1].resolve() == public
        for name in result["published"]
    } | ({"results.json"} if (public / "results.json").is_file() else set())
