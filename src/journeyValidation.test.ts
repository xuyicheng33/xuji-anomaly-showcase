import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Journey } from './journeyTypes';
import { validChunks, validateJourney } from './journeyValidation';
import { countMetrics, pointAdjusted } from './journeyNumerics';
import { loadCases, type CaseCatalog } from './anomalyCases';
import { loadCalculationIndex, loadPointScores, type CalculationIndex } from './calculationIndex';

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
      expect(catalog).toMatchObject({
        resultVersion: data.resultVersion,
        window: data.window,
        features: data.features.length,
      });
      expect(Object.keys(catalog.models).sort()).toEqual(data.models.map((m) => m.id).sort());
      for (const pack of Object.values(catalog.models)) {
        expect(validChunks(pack.chunks, data.times.length, data.window * 8)).toBe(true);
        for (const chunk of pack.chunks) expect(chunk.shape).toEqual([chunk.count, data.window]);
      }
    });

    it.each(['labels', 'run', 'missingShape'])(
      'rejects invalid %s at the data boundary',
      (field) => {
        const changed = structuredClone(data);
        if (field === 'labels') changed.labels.fill(2);
        if (field === 'run') changed.models[0].run += '-other';
        if (field === 'missingShape') Reflect.deleteProperty(changed.input, 'shape');
        expect(() => validateJourney(changed, id)).toThrow('资料版本不匹配');
      },
    );

    it('verifies published metrics, history and summary before release', () => {
      for (const model of data.models) {
        expect(model.metrics.point_wise).toEqual(
          countMetrics(data.labels, model.scores, model.threshold),
        );
        expect(model.metrics.point_adjusted).toEqual(
          countMetrics(
            data.labels,
            pointAdjusted(data.labels, model.scores, model.threshold).map(Number),
            0.5,
          ),
        );
        for (const [i, row] of model.history.entries()) {
          expect(row.epoch).toBeGreaterThan(i ? model.history[i - 1].epoch : 0);
          for (const value of [row.loss, row.lr]) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
      const s = data.summary;
      expect(s.rawRows - s.emptyRows).toBe(s.cleanRows);
      expect(s.rawFeatures - s.emptyFeatures).toBe(data.features.length);
      expect(s.features).toBe(data.features.length);
      expect(s.trainRows).toBe(data.datasets.train.shape[0]);
      expect(s.testRows).toBe(data.times.length);
      expect(s.anomalousRows).toBe(data.labels.reduce((sum, value) => sum + value, 0));
      expect(s.trainRows + s.testRows + s.omittedTimes.length).toBe(s.cleanRows);
      expect(s.emptyFeatures).toBe(data.removedFeatures.length);
      expect([s.testStart, s.testEnd]).toEqual([data.times[0], data.times.at(-1)]);
    });

    it('verifies published case coverage and geometry before release', () => {
      const cases: CaseCatalog = JSON.parse(
        readFileSync(`public/data/${folder}/${data.cases.file}`, 'utf8'),
      );
      expect(cases.cases.map((c) => `${c.insertion}/${c.kind}`).sort()).toEqual(
        ['replace', 'blend']
          .flatMap((mode) =>
            ['reference', 'uniform', 'peak', 'length'].map((kind) => `${mode}/${kind}`),
          )
          .sort(),
      );
      for (const c of cases.cases) {
        expect(c.times).toEqual(data.times.slice(c.start, c.start + data.window));
        expect(c.features).toContain(c.feature);
        expect(c.models.map((m) => m.id)).toEqual(data.models.map((m) => m.id));
        for (const asset of [
          c.original,
          c.material,
          c.candidate,
          c.weights,
          c.input,
          c.labels,
          ...c.models.map((m) => m.recon),
        ]) {
          expect(asset.shape).toEqual([data.window, data.features.length]);
        }
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

    it('rejects absent windows and missing row integrity', () => {
      const changed = structuredClone(data);
      changed.models[0].windows.chunks.pop();
      expect(() => validateJourney(changed, id)).toThrow();
      const badHashes = structuredClone(data);
      badHashes.models[0].windows.chunks[0].integrity.bytes -= 32;
      expect(() => validateJourney(badHashes, id)).toThrow();
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

    it('rejects altered case results by content hash and retries the published catalog', async () => {
      const raw = readFileSync(`public/data/${folder}/${data.cases.file}`);
      const changed: CaseCatalog = JSON.parse(raw.toString());
      changed.cases[0].models[0].metrics.precision = -1;
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json(changed))
        .mockResolvedValueOnce(new Response(raw));
      vi.stubGlobal('fetch', fetch);
      try {
        await expect(loadCases(data)).rejects.toThrow(/数据文件/);
        expect(await loadCases(data)).toEqual(JSON.parse(raw.toString()));
        expect(fetch.mock.calls[1][1].cache).toBe('reload');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
}
