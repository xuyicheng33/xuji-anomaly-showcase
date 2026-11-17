import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe.each(['converter', 'wind'])('%s frozen method packages', (dataset) => {
  it('loads each complete package and keeps its own geometry and inputs', async () => {
    const root = resolve('public/data', dataset === 'wind' ? 'wind' : 'journey');
    vi.stubGlobal('location', { search: dataset === 'wind' ? '?dataset=wind' : '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const target = new URL(url, 'http://localhost');
        const filename = target.pathname.split(
          dataset === 'wind' ? '/data/wind/' : '/data/journey/',
        )[1];
        return new Response(readFileSync(resolve(root, filename)));
      }),
    );
    vi.resetModules();
    const { readResult, validateResultCatalog } = await import('./resultCatalog');
    const catalog = JSON.parse(readFileSync(resolve(root, 'results.json'), 'utf8'));
    validateResultCatalog(catalog, dataset);
    expect(catalog.defaultModel).toBe('model1');
    const first = await readResult(dataset, 'model1');
    const second = await readResult(dataset, 'model2');
    expect(first.models.map((model) => model.id)).toEqual(['model1']);
    expect(second.models.map((model) => model.id)).toEqual(['model2']);
    expect([first.window, second.window]).toEqual(dataset === 'wind' ? [96, 96] : [16, 64]);
    expect(first.input.sha256 === second.input.sha256).toBe(dataset !== 'wind');
    expect(first.methodResults).toHaveLength(2);
    await expect(readResult(dataset, 'model3')).rejects.toThrow('没有对应的方法结果');
    const wrong = structuredClone(catalog);
    wrong.methods[0].window = 0;
    expect(() => validateResultCatalog(wrong, dataset)).toThrow('结果清单不匹配');
  });
});
