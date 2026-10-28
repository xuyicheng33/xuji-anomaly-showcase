"""Precompress production assets for nginx gzip_static without changing source bytes."""
from pathlib import Path
import gzip

root = Path(__file__).resolve().parents[1] / 'dist'
files = 0
for file in root.rglob('*'):
    if file.is_file() and file.suffix in {'.bin', '.json', '.js', '.css', '.svg', '.html'}:
        raw = file.read_bytes()
        if len(raw) < 1024:
            continue
        packed = gzip.compress(raw, compresslevel=6, mtime=0)
        if len(packed) < len(raw):
            file.with_name(file.name + '.gz').write_bytes(packed)
            files += 1
print(f'Precompressed {files} production assets')
