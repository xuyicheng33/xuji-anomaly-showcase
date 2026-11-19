import { describe, expect, it } from 'vitest';
import {
  curveDomain,
  indexTicks,
  playbackEnvelope,
  shouldTightenDomain,
  tickLabel,
  valueTicks,
} from './curveScale';

describe('shared curve scale', () => {
  it('reveals small differences near one without forcing a zero baseline', () => {
    const domain = curveDomain([0.974, 0.976, 0.978, 0.981]);
    expect(domain[0]).toBeGreaterThan(0.97);
    expect(domain[0]).toBeLessThan(0.974);
    expect(domain[1]).toBeGreaterThan(0.981);
    expect(domain[1] - domain[0]).toBeLessThan(0.01);
  });
  it('includes extrema and the threshold on one shared scale', () => {
    const domain = curveDomain([0.001, 0.004, 0.2, 0.031]);
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(0.2);
    expect(curveDomain([-8, -3])[0]).toBeLessThan(-8);
  });
  it('handles gaps, flat signals, empty data and explicit stable animation bounds', () => {
    expect(curveDomain([null, NaN, Infinity])).toEqual([0, 1]);
    const flat = curveDomain([0, 0]);
    expect(flat[1]).toBeGreaterThan(flat[0]);
    expect(curveDomain([0.99, null], [0.97, 1.01])).toEqual([0.97, 1.01]);
  });
  it('retains extrema when playback interrupts a scale transition', () => {
    expect(playbackEnvelope([0.6, 0.9], [0.45, 0.92], [0.63, 0.89])).toEqual([0.45, 0.92]);
    expect(playbackEnvelope([-4, 2], [-3, 6], [-8, 1])).toEqual([-8, 6]);
  });
  it('holds small scale fluctuations but allows meaningful tightening after a pause', () => {
    expect(shouldTightenDomain([0.45, 0.92], [0.46, 0.91])).toBe(false);
    expect(shouldTightenDomain([0.45, 0.92], [0.63, 0.81])).toBe(true);
  });
});

describe('round axis ticks', () => {
  it('places value ticks on round numbers inside the padded domain', () => {
    const { values, step } = valueTicks(0.9599, 1.0041);
    expect(step).toBe(0.02);
    expect(values.map((v) => tickLabel(v, step))).toEqual(['0.96', '0.98', '1.00']);
    const score = valueTicks(0.0013, 0.0387);
    expect(score.values.map((v) => tickLabel(v, score.step))).toEqual(['0.01', '0.02', '0.03']);
    const mse = valueTicks(0.016, 0.127);
    expect(mse.values.map((v) => tickLabel(v, mse.step))).toEqual(['0.05', '0.10']);
  });
  it('keeps index ticks evenly stepped and clear of both ends', () => {
    expect(indexTicks(1, 15, 5)).toEqual([1, 5, 10, 15]);
    expect(indexTicks(108, 123, 5)).toEqual([108, 115, 120, 123]);
    expect(indexTicks(1, 64, 5)).toEqual([1, 20, 40, 64]);
    expect(indexTicks(1, 64, 2)).toEqual([1, 64]);
  });
});
