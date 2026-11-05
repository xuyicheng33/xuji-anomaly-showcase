import { describe, expect, it } from 'vitest';
import { coveringWindows, rowChunks } from './dataGeometry';
import { series, windowScores } from './journey';
import { errorColor, rankContributions } from './contributions';

describe('dataset geometry and contribution arithmetic', () => {
  it.each([7, 14, 28, 125])('keeps every column distinct with %i features', (features) => {
    const input = Float64Array.from({ length: 5 * features }, (_, i) => i % features);
    const prediction = Float32Array.from(input, (v) => v + 1);
    expect(series(input, features - 1, 1, 3, features)).toEqual(Array(3).fill(features - 1));
    expect(windowScores(input, prediction, 0, 5, features)).toEqual([1, 1, 1, 1, 1]);
    const ranked = rankContributions(
      Float64Array.from({ length: features }, () => 1),
      features,
    );
    expect(ranked.total).toBeCloseTo(1, 14);
    expect(ranked.rows[0].feature).toBe(0);
  });
  it('covers sequence edges and windows longer than a storage chunk', () => {
    expect(coveringWindows(0, 12, 4)).toEqual([0]);
    expect(coveringWindows(4, 12, 4)).toEqual([1, 2, 3, 4]);
    expect(coveringWindows(11, 12, 4)).toEqual([8]);
    expect(coveringWindows(0, 2, 4)).toEqual([]);
    expect(rowChunks(3, 10, 4)).toEqual([0, 4, 8, 12]);
  });
  it('keeps the remainder and zero errors truthful', () => {
    const { total, rows } = rankContributions(Float64Array.from([4, 3, 2, 1]), 4);
    expect(
      rows[0].contribution + rows.slice(1).reduce((sum, row) => sum + row.contribution, 0),
    ).toBe(total);
    expect(rankContributions(new Float64Array(7), 7).total).toBe(0);
    expect(errorColor(0.5, 1)).toBe('rgb(138,160,180)');
    expect(errorColor(2, 1)).toBe(errorColor(1, 1));
  });
});
