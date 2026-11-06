import { loadBinary, RequestCache } from './assetRequests';
import { fetchRanges, type ByteRange } from './rangeAssets';
import { coveringWindows } from './dataGeometry';
import type { Asset, Model, WindowChunk } from './journeyTypes';
export type * from './journeyTypes';
export * from './journeyNumerics';

export async function loadAsset(asset: Pick<Asset, 'file' | 'bytes' | 'sha256'>) {
  return new Float64Array(await loadBinary(asset));
}
const rangeCache = new RequestCache<ArrayBuffer[]>(4 * 1024 * 1024);
function windowRanges(chunk: WindowChunk, ranges: ByteRange[]) {
  const key =
    `${chunk.file}:${chunk.sha256}:` +
    ranges.map((range) => `${range.start}/${range.bytes}`).join(',');
  return rangeCache.get(
    key,
    ranges.reduce((sum, range) => sum + range.bytes, 0),
    () => fetchRanges(chunk, ranges, () => loadBinary(chunk)),
  );
}
export async function loadWindow(m: Model, start: number) {
  const pack = m.windows,
    chunk = pack.chunks.find((c) => start >= c.start && start < c.start + c.count);
  if (!chunk) throw Error('没有对应的完整窗口');
  const size = pack.length * pack.features;
  const offset = (start - chunk.start) * size;
  const [raw] = await windowRanges(chunk, [{ start: offset * 4, bytes: size * 4 }]);
  return {
    start,
    modelId: m.id,
    recon: new Float32Array(raw),
  };
}

/** One row per covering window holds every sensor at this source time. */
export async function loadCoveringPredictions(model: Model, index: number) {
  const pack = model.windows;
  const starts = coveringWindows(index, model.scores.length, pack.length);
  const groups = new Map<WindowChunk, { start: number; range: ByteRange }[]>();
  for (const start of starts) {
    const chunk = pack.chunks.find(
      (item) => start >= item.start && start < item.start + item.count,
    );
    if (!chunk) throw Error('没有对应的覆盖窗口');
    const group = groups.get(chunk) ?? [];
    group.push({
      start,
      range: {
        start: ((start - chunk.start) * pack.length + index - start) * pack.features * 4,
        bytes: pack.features * 4,
      },
    });
    groups.set(chunk, group);
  }
  const parts = await Promise.all(
    Array.from(groups, async ([chunk, rows]) => {
      const raw = await windowRanges(
        chunk,
        rows.map((row) => row.range),
      );
      return rows.map((row, i) => ({ start: row.start, predictions: new Float32Array(raw[i]) }));
    }),
  );
  return parts.flat();
}
