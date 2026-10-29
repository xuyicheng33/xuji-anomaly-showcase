import { describe, expect, it } from 'vitest';
import { curveDomain, curveTick, playbackEnvelope, shouldTightenDomain } from './curveScale';

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
  it('keeps nearby tick values distinct for narrow and large-unit ranges', () => {
    expect(curveTick(0.9751, 0.001)).not.toBe(curveTick(0.9752, 0.001));
    expect(curveTick(1500.1, 0.2)).not.toBe(curveTick(1500.2, 0.2));
    expect(curveTick(0.00000002, 0.00000004)).toContain('e-');
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
