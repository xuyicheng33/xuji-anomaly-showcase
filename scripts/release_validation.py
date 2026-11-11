"""Check that a release uses the verified evaluation version, without choosing thresholds."""
import json
import re
from pathlib import Path


def config_entries(source):
    """Read top-level directives of this project's single server block."""
    match = re.search(r'^\s*server\s*\{', source, re.MULTILINE)
    if not match:
        raise ValueError('Missing dedicated server block')
    begin = match.end()
    entries = []
    depth, quote, comment, escaped = 0, None, False, False
    for position in range(begin, len(source)):
        char = source[position]
        if comment:
            if char == '\n':
                comment = False
            continue
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char == '#':
            comment = True
        elif char == '{':
            depth += 1
        elif char == '}':
            if depth == 0:
                if source[position + 1:].strip():
                    raise ValueError('Unexpected content outside the dedicated server')
                return entries, position
            depth -= 1
            if depth == 0:
                entries.append(source[begin:position + 1])
                begin = position + 1
        elif char == ';' and depth == 0:
            entries.append(source[begin:position + 1])
            begin = position + 1
    raise ValueError('Unclosed dedicated server block')


def config_key(entry):
    header = re.sub(r'(?m)^\s*#.*$', '', entry).strip()
    if header.startswith('location '):
        return ' '.join(header.split('{', 1)[0].split())
    if header.startswith('include '):
        return ' '.join(header.split(';', 1)[0].split())
    return header.split()[0]


def site_config(existing, desired):
    """Update all owned rules, retaining unrelated includes and locations."""
    for source in (existing, desired):
        if 'listen 9010;' not in source or 'root /var/www/xuji-showcase/current;' not in source:
            raise ValueError('Unexpected dedicated site configuration')
    current_entries, _ = config_entries(existing)
    wanted_entries, end = config_entries(desired)
    owned = {config_key(entry) for entry in wanted_entries}
    extra = [entry for entry in current_entries if config_key(entry) not in owned]
    if not extra:
        return desired
    return desired[:end].rstrip() + ''.join(extra) + '\n' + desired[end:]


def validate_evaluation(folder, reference):
    folder = Path(folder)
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
    evaluation = json.loads((folder / 'evaluation.json').read_text(encoding='utf8'))
    source = json.loads(Path(reference).read_text(encoding='utf8'))
    if not manifest['resultVersion'] == evaluation['version'] == source['resultVersion']:
        raise ValueError('Evaluation versions differ')
    if evaluation['policy']['id'] != source['evaluation']['id']:
        raise ValueError('Evaluation policy differs')
    expected = {model['id']: model for model in source['models']}
    actual = {model['id']: model for model in manifest['models']}
    records = {model['id']: model for model in evaluation['models']}
    if not expected.keys() == actual.keys() == records.keys():
        raise ValueError('Evaluation model sets differ')
    for name, model in actual.items():
        for key in ('threshold', 'windowThreshold', 'scores', 'metrics'):
            if model[key] != expected[name][key]:
                raise ValueError(f'Evaluation result differs: {name}/{key}')
        if (model['threshold'] != records[name]['sequence']['value'] or
                model['windowThreshold'] != records[name]['window']['value']):
            raise ValueError(f'Evaluation thresholds differ: {name}')
