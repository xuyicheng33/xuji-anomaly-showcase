import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const css = readFileSync('src/report/report.css', 'utf8');
describe('chapter report design constraints', () => {
  it('uses shared type and color tokens across chapters', () => {
    expect(css).toMatch(/--paper:\s*#f8f7f3/);
    expect(css).toContain('--serif:');
    expect(css).toContain('--sans:');
    expect(css).toMatch(/font-family:\s*var\(--serif\)/);
  });
  it('supports reduced motion, keyboard focus and responsive navigation', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('.site-nav.open');
  });
  it('loads one active stylesheet for the new site', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain('report/styles.css');
    expect(main).not.toContain('journey.css');
  });
  it('keeps fonts local for static deployment', () => {
    expect(readFileSync('src/report/fonts.css', 'utf8')).toContain('/fonts/NotoSerifSC-Subset.ttf');
    expect(css).toContain('/fonts/InstrumentSerif-Regular.ttf');
  });
});
