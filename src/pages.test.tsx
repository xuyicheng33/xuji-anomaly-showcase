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
  it('explains each page before presenting data or methods', () => {
    for (const page of pages) {
      const html = renderToStaticMarkup(<PageView id={page.id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
      expect(html).toMatch(/journey-dataset|dataset-intro|page-intro/);
      expect(html).not.toMatch(/grid-timeline|merge-destination|条形按比例|stream-total|flow-node/);
    }
  });
  it('shows business quality metrics and explains source field names', () => {
    const render = (id: number) => renderToStaticMarkup(<PageView id={id} data={data} provenance={provenance} field={0} onField={() => {}} start={0} onStart={() => {}} />);
    expect(render(5)).toMatch(/预测准确率/);
    expect(render(5)).toMatch(/合格率/);
    expect(render(5)).not.toMatch(/预测类别|点数/);
    expect(render(10)).toContain('forecastvaluetime（预测目标时间）');
    expect(render(7)).toContain('最后一个预测值对应的实际功率');
  });
  it('uses the four genuine duplicate pairs and observed time coverage', () => {
    const meteo = ['temperature', 'humidity', 'pressure', 'ws_10', 'wd_10', 'ws_30', 'wd_30', 'ws_50', 'wd_50', 'ws_70', 'wd_70', 'ws_hub', 'wd_hub'];
    expect(data.duplicateWeather).toHaveLength(8);
    const times = [...new Set(data.duplicateWeather.map(row => row.datatime))];
    expect(times).toHaveLength(4);
    for (const time of times) {
      const pair = data.duplicateWeather.filter(row => row.datatime === time);
      expect(pair).toHaveLength(2);
      expect(pair[0].id).not.toBe(pair[1].id);
      expect(meteo.map(field => pair[0][field])).toEqual(meteo.map(field => pair[1][field]));
    }
    const used = data.streams.filter(stream => stream.used);
    expect(used.map(stream => stream.coverage.length)).toEqual([24, 2, 2]);
    expect(used.map(stream => stream.coverage.reduce((sum, segment) => sum + segment.points, 0))).toEqual([57526, 20064, 21120]);
    for (const stream of used) {
      expect(stream.coverage[0].start).toBe(stream.start);
      expect(stream.coverage.at(-1)!.end).toBe(stream.end);
    }
  });
});
