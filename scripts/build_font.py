"""Build or verify the Chinese title font. Use --source with the upstream Noto Serif SC TTF."""
from pathlib import Path
import argparse
import hashlib
import re
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'public/fonts/NotoSerifSC-Subset.ttf'

def required_text():
    files = [p for p in (ROOT / 'src').rglob('*') if p.suffix in {'.ts', '.tsx', '.json'}]
    files += [ROOT / 'public/data/journey/manifest.json']
    content = ''.join(p.read_text(encoding='utf-8') for p in files)
    chinese = set(re.findall(r'[\u3400-\u9fff]', content))
    return chinese, chinese | set(chr(i) for i in range(32, 127)) | set('，。；：！？、（）【】《》“”‘’—–−…→↑↗×÷％℃')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    chinese, text = required_text()
    if args.source:
        font = TTFont(args.source)
        options = subset.Options()
        options.recalc_timestamp = False
        worker = subset.Subsetter(options=options)
        worker.populate(unicodes=[ord(c) for c in text])
        worker.subset(font)
        if 'fvar' in font:
            font = instantiateVariableFont(font, {'wght': 500}, inplace=True)
        font.save(TARGET)
        digest = hashlib.sha256(TARGET.read_bytes()).hexdigest()[:12]
        (ROOT / 'src/report/fonts.css').write_text(
            "@font-face {\n  font-family: 'Noto Serif SC';\n  font-style: normal; font-display: swap;\n"
            "  font-weight: 500;\n  src: url(/fonts/NotoSerifSC-Subset.ttf?v=" + digest + ") format('truetype');\n}\n",
            encoding='utf-8')
    font = TTFont(TARGET)
    missing = sorted(c for c in chinese if ord(c) not in font.getBestCmap())
    if missing:
        raise SystemExit('Missing Chinese glyphs: ' + ''.join(missing))
    print(f'Font coverage OK: {len(chinese)} Chinese characters; weight {font["OS/2"].usWeightClass}; {TARGET.stat().st_size} bytes')

if __name__ == '__main__':
    main()
