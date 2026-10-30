import { describe, it, expect } from 'vitest';
import {
  countMetrics,
  pointAdjusted,
  series,
  outcomeCode,
  meanSeries,
  metricPrefixes,
} from './journey';
describe('journey navigation and numerical chain', () => {
  it('keeps threshold equality normal and limits prefix statistics', () => {
    const y = [0, 1, 1, 0],
      s = [0.5, 0.7, 0.2, 0.9];
    expect(countMetrics(y, s, 0.5)).toEqual({
      tp: 1,
      fp: 1,
      fn: 1,
      tn: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
    expect(countMetrics(y, s, 0.5, 0, 1)).toEqual({
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 1,
      precision: null,
      recall: null,
      f1: null,
    });
    metricPrefixes(y, s, 0.5).forEach((result, end) =>
      expect(result).toEqual(countMetrics(y, s, 0.5, 0, end)),
    );
  });
  it('does not apply point adjustment to live decisions', () => {
    expect(pointAdjusted([0, 1, 1, 1, 0], [0, 0, 1, 0, 0], 0.5)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(outcomeCode(1, 0, 0.5)).toBe('fn');
  });
  it('reads row-major arrays without mixing feature dimensions', () => {
    const a = Float64Array.from({ length: 375 }, (_, i) => i);
    expect(series(a, 124, 1, 2)).toEqual([249, 374]);
  });
  it('keeps aggregate error when signed residuals cancel in the mean curve', () => {
    const input = Float64Array.from({ length: 250 }, (_, i) => (i < 125 ? (i % 2 ? 1 : -1) : 0));
    const error = Float64Array.from(input, (v) => v * v);
    expect(meanSeries(input, 0, 2)[0] ** 2).toBeLessThan(0.001);
    expect(meanSeries(error, 0, 2)).toEqual([1, 0]);
    expect(meanSeries(input, 1, 1)).toEqual([0]);
  });
});
