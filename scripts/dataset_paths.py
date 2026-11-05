"""Explicit dataset roots shared by exporters, verification and deployment."""
import argparse
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
DATASETS = {
    'converter': (PROJECT / 'data/reference', PROJECT / 'public/data/journey'),
    'wind': (PROJECT / 'data/reference/wind', PROJECT / 'public/data/wind'),
}


def selected_paths():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', choices=DATASETS, default='converter')
    args = parser.parse_args()
    return DATASETS[args.dataset]
