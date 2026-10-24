"""Read-only SFTP synchronization. Supply XUJI_SSH_PASSWORD in the environment."""

import os, json, hashlib
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/manifest.json"
REMOTE = "/root/gpufree-data/DTAAD"
FOLDERS = {
    "model0": "DTAAD-main",
    "model1": "DTAAD_64_n",
    "model2": "DTAAD_64_n_method_2",
    "model3": "DTAAD_64_n_method_3",
}


def synchronize(client):
    sftp = client.open_sftp()
    targets = []
    for rel in [
        "dataset/converter.xlsx",
        "dataset/orgdata/converternew.xlsx",
        "dataset/orgdata/converter.xlsx",
        "dataset/prodata/converter_train.npy",
        "dataset/prodata/converter_test.npy",
        "dataset/prodata/converter_labels.npy",
    ]:
        targets.append((rel, ROOT / "data/source" / rel))
    for model, folder in FOLDERS.items():
        for entry in sftp.listdir_attr(REMOTE + "/" + folder + "/src"):
            if entry.filename.endswith(".py"):
                rel = folder + "/src/" + entry.filename
                targets.append(
                    (
                        rel,
                        ROOT / "data/source/research" / model / "src" / entry.filename,
                    )
                )
        for name in [
            "adaptive_mask.py",
            "demoNew03.py",
            "demo11.py",
            "BNDLosswithW_single.py",
            "newMain17.py",
            "newMainV801.py",
        ]:
            rel = folder + "/" + name
            try:
                sftp.stat(REMOTE + "/" + rel)
            except FileNotFoundError:
                continue
            targets.append((rel, ROOT / "data/source/research" / model / name))
        for dataset in ["converter", "xuji"]:
            rel = folder + "/checkpoints/DTAAD_" + dataset + "/model.ckpt"
            try:
                sftp.stat(REMOTE + "/" + rel)
            except FileNotFoundError:
                continue
            targets.append((rel, ROOT / "data/models" / dataset / model / "model.ckpt"))
        if model != "model0":
            rel = folder + "/processed/converter/converter_labels.npy"
            targets.append(
                (rel, ROOT / "data/source/results/converter" / model / "matrix.npy")
            )
            for name in ["testRaw", "recon", "lossPerFeat", "lossFinal", "labels"]:
                rel = folder + "/viz/data/" + name + ".npy"
                targets.append(
                    (
                        rel,
                        ROOT
                        / "data/source/results/converter"
                        / model
                        / (name + ".npy"),
                    )
                )
            rel = folder + "/viz/viz_best.py"
            targets.append(
                (rel, ROOT / "data/source/results/converter" / model / "viz_best.py")
            )
    for sub in ["data/xuji", "processed/xuji", "insertedData/xuji"]:
        for e in sftp.listdir_attr(REMOTE + "/DTAAD_64_n_method_3/" + sub):
            if e.filename.endswith(".npy") and e.st_size < 1000000:
                rel = "DTAAD_64_n_method_3/" + sub + "/" + e.filename
                targets.append((rel, ROOT / "data/source" / sub / e.filename))
    existing = json.loads(MANIFEST.read_text(encoding="utf-8-sig")) if MANIFEST.exists() else []
    manifest = {entry["local"]: entry for entry in existing}
    for i, (rel, dest) in enumerate(targets):
        dest.parent.mkdir(parents=True, exist_ok=True)
        stat = sftp.stat(REMOTE + "/" + rel)
        temporary = dest.with_name(dest.name + ".part")
        sftp.get(REMOTE + "/" + rel, str(temporary), max_concurrent_prefetch_requests=32)
        if temporary.stat().st_size != stat.st_size:
            raise ValueError(f"同步文件大小不一致：{rel}")
        sha = hashlib.sha256(temporary.read_bytes()).hexdigest()
        temporary.replace(dest)
        local = dest.relative_to(ROOT).as_posix()
        manifest[local] = {
            "remote": REMOTE + "/" + rel,
            "local": local,
            "bytes": stat.st_size,
            "sha256": sha,
        }
        if i % 20 == 0:
            print(f"Downloaded {i+1}/{len(targets)}", flush=True)
    MANIFEST.write_text(
        json.dumps(sorted(manifest.values(), key=lambda entry: entry["local"]), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sftp.close()
    print(
        f"Synchronized {len(targets)} server files; retained {len(manifest)} asset records",
        flush=True,
    )


if __name__ == "__main__":
    c = paramiko.SSHClient()
    c.load_system_host_keys()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        "183.147.142.40",
        port=31419,
        username="root",
        password=os.environ["XUJI_SSH_PASSWORD"],
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    try:
        synchronize(c)
    finally:
        c.close()
