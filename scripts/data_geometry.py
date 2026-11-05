"""Storage chunking is independent of the retained experiment window."""
INPUT_CHUNK_ROWS = 128
CONTRIBUTION_CHUNK_ROWS = 128


def geometry(manifest):
    features = len(manifest['features'])
    window = manifest['window']
    rows, columns = manifest['input']['shape']
    if columns != features or features < 1 or not 1 <= window <= rows:
        raise ValueError('Invalid dataset geometry')
    return rows, features, window
