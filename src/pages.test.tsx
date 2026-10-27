import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageView } from './PageView';
import { pages, sourceIds } from './model';
import type { Research, Provenance } from './types';

const data = JSON.parse(readFileSync('public/data/research.json', 'utf8')) as Research;
const provenance = JSON.parse(readFileSync('public/data/provenance.json', 'utf8')) as Provenance;
describe('complete static presentation', () => {
  for (const page of pages) {
    it(`renders step ${page.id}: ${page.title}`, () => {
      const html = renderToStaticMarkup(<PageView id={page.id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
      const text = html.replace(/<[^>]*>/g, '').trim();
      expect(text.length).toBeGreaterThan(35);
      expect(html).toMatch(/<(div|table|section|ol|figure)/);
      expect(html).not.toMatch(/NaN|undefined|placeholder-page|尚未完成/);
      expect(sourceIds(page.id).every(id => provenance.sources.some(s => s.id === id))).toBe(true);
    });
  }
  it('keeps every page distinct', () => {
    const views = pages.map(page => renderToStaticMarkup(<PageView id={page.id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />));
    expect(new Set(views).size).toBe(61);
  });
  it('keeps the 28D feature order separate from the historical 7D order', () => {
    expect(data.features.length).toBe(28);
    expect(data.old.features.length).toBe(7);
    expect(data.old.history.length).toBe(5);
    expect(data.metrics.map(m => m.f1)).toEqual([.8632, .8347, .8237]);
  });
});
