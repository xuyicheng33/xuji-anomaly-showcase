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
  it('applies the approved editorial rules to every page', () => {
    for (const page of pages) {
      const html = renderToStaticMarkup(<PageView id={page.id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
      expect(html).not.toMatch(/保留原表|本次保留|样例直接读取|未配齐|未保存|不代表|不填入|不生成|SHA-256|sha256|模型字段/);
      expect(html).not.toMatch(/温度 °C|湿度 %|气压 hPa|功率 MW|m\/s/);
    }
    expect(data.features.every(feature => feature.unit === '')).toBe(true);
  });
  it('uses exact, common-scale proportions for the source counts', () => {
    const html = renderToStaticMarkup(<PageView id={2} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
    const widths = [...html.matchAll(/style="width:([\d.]+)%"/g)].map(match => Number(match[1]));
    const maxRows = Math.max(...data.streams.map(stream => stream.rawRows));
    expect(widths).toHaveLength(5);
    widths.forEach((width, index) => expect(width).toBeCloseTo(data.streams[index].rawRows / maxRows * 100, 10));
  });
  it('keeps dataset introductions and edited numeric tables substantive', () => {
    const render = (id: number) => renderToStaticMarkup(<PageView id={id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
    for (const id of [3, 4, 5, 6, 7]) expect(render(id)).toContain('dataset-intro');
    expect(render(3)).toContain('每 5 分钟');
    expect(render(7)).toContain('16 个预测值');
    expect(render(1)).not.toContain('dataset-symbol');
    expect(render(21)).not.toContain('empty-value');
    expect(render(21)).toContain('949.810');
  });
});
