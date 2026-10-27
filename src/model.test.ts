import { describe, expect, it } from 'vitest';
import { pageFromHash, pages, sourceIds, stepHash, chartWindow } from './model';
import type { Research } from './types';

describe('presentation contract', () => {
  it('has exactly 61 ordered steps and nine continuous stages', () => {
    expect(pages.map(p => p.id)).toEqual(Array.from({ length: 61 }, (_, i) => i + 1));
    expect(new Set(pages.map(p => p.stage)).size).toBe(9);
    expect(pages.every(p => p.title && p.description && sourceIds(p.id).length)).toBe(true);
  });
  it('handles direct URLs and invalid bounds deterministically', () => {
    expect(pageFromHash('#/step/57')).toBe(57);
    expect(pageFromHash('#/step/00')).toBe(1);
    expect(pageFromHash('#/step/99')).toBe(61);
    expect(pageFromHash('#other')).toBe(1);
    expect(stepHash(2)).toBe('#/step/02');
  });
  it('preserves alignment when clamping a selected data range', () => {
    const data = { times: ['a','b','c','d'], values: [[10,100],[20,200],[30,300],[40,400]] } as Research;
    expect(chartWindow(data, 99, 2, 1)).toEqual({ from: 2, times: ['c','d'], values: [300,400] });
    expect(chartWindow(data, -3, 2, 0)).toEqual({ from: 0, times: ['a','b'], values: [10,20] });
  });
});
