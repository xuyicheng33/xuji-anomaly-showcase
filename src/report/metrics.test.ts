import {describe, expect, it} from 'vitest';
import {compareMetrics, exampleLabels, initialAlarms} from './MetricsChapter';

describe('the interactive metric example', () => {
  it('keeps false positives while completing the detected eight-point interval', () => {
    const result = compareMetrics(exampleLabels, initialAlarms);
    expect(result.pointWise).toMatchObject({tp: 2, fp: 2, fn: 6, tn: 10, f1: 1 / 3});
    expect(result.pointAdjusted).toMatchObject({tp: 8, fp: 2, fn: 0, tn: 10, f1: 16 / 18});
    expect(result.adjusted[2]).toBe(1);
    expect(result.adjusted[17]).toBe(1);
    expect(initialAlarms.filter(Boolean)).toHaveLength(4);
  });

  it('makes a single late hit perfect only after point adjustment', () => {
    const alarms = exampleLabels.map((_, i) => i === 12 ? 1 : 0);
    const result = compareMetrics(exampleLabels, alarms);
    expect(result.pointWise.f1).toBeCloseTo(2 / 9);
    expect(result.pointAdjusted.f1).toBe(1);
    expect(result.adjusted.slice(5, 13)).toEqual(Array(8).fill(1));
    expect(alarms.slice(5, 12)).toEqual(Array(7).fill(0));
  });

  it('leaves a completely missed segment unchanged and defines empty precision', () => {
    const result = compareMetrics(exampleLabels, Array(20).fill(0));
    expect(result.pointAdjusted).toEqual(result.pointWise);
    expect(result.pointWise).toMatchObject({tp: 0, fp: 0, fn: 8, tn: 12, precision: null, recall: 0, f1: 0});
  });

  it('does not spread a hit through a normal gap or into another abnormal segment', () => {
    const result = compareMetrics([1, 1, 0, 1, 1], [0, 1, 0, 0, 0]);
    expect(result.adjusted).toEqual([1, 1, 0, 0, 0]);
    expect(result.pointAdjusted).toMatchObject({tp: 2, fp: 0, fn: 2, tn: 1});
  });
});
