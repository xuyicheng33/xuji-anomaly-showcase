"""Build or verify the Chinese title font. Use --source with the upstream Noto Serif SC TTF."""

import argparse
import hashlib
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public/fonts/NotoSerifSC-Subset.woff2"


def required_text():
    files = [p for p in (ROOT / "src").rglob("*") if p.suffix in {".ts", ".tsx", ".json"}]
    files += list((ROOT / "public/data").glob("*/manifest.json"))
    content = "".join(p.read_text(encoding="utf-8") for p in files)
    chinese = set(re.findall(r"[\u3400-\u9fff]", content))
    return chinese, chinese | set(chr(i) for i in range(32, 127)) | set(
        "，。；：！？、（）【】《》“”‘’—–−…→↑↗×÷％℃"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    chinese, text = required_text()
    if args.source:
        font = TTFont(args.source)
        options = subset.Options()
        options.recalc_timestamp = False
        worker = subset.Subsetter(options=options)
        worker.populate(unicodes=[ord(c) for c in text])
        worker.subset(font)
        if "fvar" in font:
            font = instantiateVariableFont(font, {"wght": 500}, inplace=True)
        font.flavor = "woff2"
        font.save(TARGET)
        digest = hashlib.sha256(TARGET.read_bytes()).hexdigest()[:12]
        stylesheet = ROOT / "src/report/styles/base.css"
        stylesheet.write_text(
            re.sub(
                r"NotoSerifSC-Subset\.woff2\?v=[a-f0-9]+",
                "NotoSerifSC-Subset.woff2?v=" + digest,
                stylesheet.read_text(encoding="utf8"),
            ),
            encoding="utf8",
        )
        entry = ROOT / "index.html"
        entry.write_text(
            re.sub(
                r"NotoSerifSC-Subset\.woff2\?v=[a-f0-9]+",
                "NotoSerifSC-Subset.woff2?v=" + digest,
                entry.read_text(encoding="utf8"),
            ),
            encoding="utf8",
        )
    font = TTFont(TARGET)
    missing = sorted(c for c in chinese if ord(c) not in font.getBestCmap())
    if missing:
        raise SystemExit("Missing Chinese glyphs: " + "".join(missing))
    print(
        f"Font coverage OK: {len(chinese)} Chinese characters; weight {font['OS/2'].usWeightClass}; {TARGET.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
