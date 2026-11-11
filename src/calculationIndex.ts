import { loadBinary } from './assetRequests';
import type { Asset, Journey, WindowChunk } from './journeyTypes';
import { validChunks } from './journeyValidation';
import { coveringWindows } from './dataGeometry';
import { loadAsset } from './journey';

export type CalculationIndex = {
  resultVersion: string;
  window: number;
  features: number;
  models: Record<string, { chunks: (WindowChunk & Asset)[] }>;
};

export function validateCalculation(catalog: CalculationIndex, data: Journey) {
  if (
    !catalog ||
    catalog.resultVersion !== data.resultVersion ||
    catalog.window !== data.window ||
    catalog.features !== data.features.length ||
    !catalog.models ||
    Object.keys(catalog.models).length !== data.models.length ||
    data.models.some((model) => {
      const pack = catalog.models[model.id];
      return (
        !pack ||
        !validChunks(pack.chunks, data.times.length, data.window * 8) ||
        pack.chunks.some(
          (chunk) =>
            chunk.shape.length !== 2 ||
            chunk.shape[0] !== chunk.count ||
            chunk.shape[1] !== data.window,
        )
      );
    })
  )
    throw Error('计算索引版本不一致');
}

export async function loadPointScores(
  catalog: CalculationIndex,
  modelId: string,
  index: number,
  rows: number,
) {
  const starts = coveringWindows(index, rows, catalog.window);
  const chunk = catalog.models[modelId]?.chunks.find(
    (part) => index >= part.start && index < part.start + part.count,
  );
  if (!starts.length || !chunk) throw Error('没有对应的窗口分数');
  const scores = await loadAsset(chunk);
  const offset = (index - chunk.start) * catalog.window;
  return starts.map((start, slot) => ({ start, score: scores[offset + slot] }));
}

export async function loadCalculationIndex(data: Journey) {
  const raw = await loadBinary(data.calculation);
  const catalog: CalculationIndex = JSON.parse(new TextDecoder().decode(raw));
  validateCalculation(catalog, data);
  return catalog;
}
