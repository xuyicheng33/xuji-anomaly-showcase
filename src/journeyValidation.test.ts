import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Journey } from './journeyTypes';
import { validateJourney } from './journeyValidation';
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
