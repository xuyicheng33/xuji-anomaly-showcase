import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Journey } from './journeyTypes';
import { validateJourney } from './journeyValidation';
import { validateCases, type CaseCatalog } from './anomalyCases';
import {
  loadCalculationIndex,
  loadPointScores,
  validateCalculation,
  type CalculationIndex,
} from './calculationIndex';

for (const [id, folder] of [
  ['converter', 'journey'],
  ['wind', 'wind'],
]) {
  const data: Journey = JSON.parse(readFileSync(`public/data/${folder}/manifest.json`, 'utf8'));
  const raw = readFileSync(`public/data/${folder}/${data.calculation.file}`, 'utf8');
  const catalog: CalculationIndex = JSON.parse(raw);
  describe(`${id} manifest contract`, () => {
    it('accepts the shipped source geometry and calculation index', () => {
      expect(() => validateJourney(data, id)).not.toThrow();
      expect(() => validateCalculation(catalog, data)).not.toThrow();
    });

    it.each([
      'labels',
      'counts',
      'ratios',
      'run',
      'summary',
      'examples',
      'history',
      'missingShape',
    ])('rejects invalid %s without accepting plausible geometry', (field) => {
      const changed = structuredClone(data);
      if (field === 'labels') changed.labels.fill(2);
      if (field === 'counts') changed.models[0].metrics.point_wise.tp = -1;
      if (field === 'ratios') changed.models[0].metrics.point_wise.f1 = 42;
      if (field === 'run') changed.models[0].run += '-other';
      if (field === 'summary') changed.summary.anomalousRows++;
      if (field === 'examples') changed.models[0].examples[0].index = -1;
      if (field === 'history')
        changed.models[0].history[1].epoch = changed.models[0].history[0].epoch;
      if (field === 'missingShape') Reflect.deleteProperty(changed.input, 'shape');
      expect(() => validateJourney(changed, id)).toThrow('资料版本不匹配');
    });

    it('rejects internally consistent counts that disagree with the labels and scores', () => {
      const changed = structuredClone(data);
      const metrics = changed.models[0].metrics.point_wise;
      metrics.tp++;
      metrics.fn--;
      metrics.precision = metrics.tp / (metrics.tp + metrics.fp);
      metrics.recall = metrics.tp / (metrics.tp + metrics.fn);
      metrics.f1 = (2 * metrics.tp) / (2 * metrics.tp + metrics.fp + metrics.fn);
      expect(() => validateJourney(changed, id)).toThrow('资料版本不匹配');
    });

    it('validates case geometry and rejects missing cases, models and invalid metrics', () => {
      const cases: CaseCatalog = JSON.parse(
        readFileSync(`public/data/${folder}/${data.cases.file}`, 'utf8'),
      );
      expect(() => validateCases(cases, data)).not.toThrow();
      for (const field of ['case', 'model', 'metrics', 'bounds']) {
        const changed = structuredClone(cases);
        if (field === 'case') changed.cases.pop();
        if (field === 'model') changed.cases[0].models.pop();
        if (field === 'metrics') changed.cases[0].models[0].metrics.precision = -1;
        if (field === 'bounds') changed.cases[0].feature = data.features.length;
        expect(() => validateCases(changed, data)).toThrow('案例资料版本不匹配');
      }
    });

    it.each(['missing', 'gap', 'overlap', 'truncated', 'bytes'])(
      'rejects %s contribution coverage',
      (kind) => {
        const changed = structuredClone(data);
        const chunks = changed.models[0].contributions.chunks;
        if (kind === 'missing') chunks.length = 0;
        if (kind === 'gap') chunks[1].start++;
        if (kind === 'overlap') chunks[1].start--;
        if (kind === 'truncated') chunks.pop();
        if (kind === 'bytes') chunks[0].bytes -= 8;
        expect(() => validateJourney(changed, id)).toThrow('资料版本不匹配');
      },
    );

    it('rejects absent windows, missing row integrity, and a missing calculation model', () => {
      const changed = structuredClone(data);
      changed.models[0].windows.chunks.pop();
      expect(() => validateJourney(changed, id)).toThrow();
      const badHashes = structuredClone(data);
      badHashes.models[0].windows.chunks[0].integrity.bytes -= 32;
      expect(() => validateJourney(badHashes, id)).toThrow();
      const missing = structuredClone(catalog);
      delete missing.models[data.models[0].id];
      expect(() => validateCalculation(missing, data)).toThrow('计算索引版本不一致');
      const gap = structuredClone(catalog);
      gap.models[data.models[0].id].chunks[1].start++;
      expect(() => validateCalculation(gap, data)).toThrow('计算索引版本不一致');
    });

    it('loads exact first, boundary, interior and last scores and reuses adjacent chunks', async () => {
      const fetch = vi.fn(async (url: string) => {
        const file = url.split(/\/data\/(?:journey|wind)\//)[1].split('?')[0];
        return new Response(readFileSync(`public/data/${folder}/${file}`));
      });
      vi.stubGlobal('fetch', fetch);
      try {
        for (const model of data.models) {
          for (const index of [0, 31, 32, 132, 133, data.times.length - 1]) {
            const rows = await loadPointScores(catalog, model.id, index, data.times.length);
            expect(rows[0].start).toBe(Math.max(0, index - data.window + 1));
            expect(rows.at(-1)!.start).toBe(Math.min(index, model.windows.count - 1));
            expect(rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toBeCloseTo(
              model.scores[index],
              14,
            );
          }
        }
        expect(fetch).toHaveBeenCalledTimes(4 * data.models.length);
        await expect(loadPointScores(catalog, 'missing', 10, data.times.length)).rejects.toThrow(
          '没有对应的窗口分数',
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('rejects a changed model mapping or score hash, then retries verified bytes', async () => {
      const changed = structuredClone(catalog);
      const first = data.models[0].id;
      if (data.models.length > 1) changed.models[first] = changed.models[data.models[1].id];
      else changed.models[first].chunks[0].sha256 = '0'.repeat(64);
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(changed)))
        .mockResolvedValueOnce(new Response(raw));
      vi.stubGlobal('fetch', fetch);
      try {
        await expect(loadCalculationIndex(data)).rejects.toThrow(/数据文件/);
        expect(await loadCalculationIndex(data)).toEqual(catalog);
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
}
