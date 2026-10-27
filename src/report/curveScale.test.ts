import {describe, expect, it} from 'vitest';
import {curveDomain, curveTick} from './curveScale';

describe('shared curve scale', () => {
  it('reveals small differences near one without forcing a zero baseline', () => {
    const domain = curveDomain([.974, .976, .978, .981]);
    expect(domain[0]).toBeGreaterThan(.97);
    expect(domain[0]).toBeLessThan(.974);
    expect(domain[1]).toBeGreaterThan(.981);
    expect(domain[1] - domain[0]).toBeLessThan(.01);
  });
  it('includes extrema and the threshold on one shared scale', () => {
    const domain = curveDomain([.001, .004, .2, .031]);
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(.2);
    expect(curveDomain([-8, -3])[0]).toBeLessThan(-8);
  });
  it('handles gaps, flat signals, empty data and explicit stable animation bounds', () => {
    expect(curveDomain([null, NaN, Infinity])).toEqual([0, 1]);
    const flat = curveDomain([0, 0]);
    expect(flat[1]).toBeGreaterThan(flat[0]);
    expect(curveDomain([.99, null], [.97, 1.01])).toEqual([.97, 1.01]);
  });
  it('keeps nearby tick values distinct for narrow and large-unit ranges', () => {
    expect(curveTick(.9751, .001)).not.toBe(curveTick(.9752, .001));
    expect(curveTick(1500.1, .2)).not.toBe(curveTick(1500.2, .2));
    expect(curveTick(.00000002, .00000004)).toContain('e-');
  });
});
