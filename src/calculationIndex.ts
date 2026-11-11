import { loadJsonAsset } from './assetRequests';
import type { Asset, Journey, WindowChunk } from './journeyTypes';
import { coveringWindows } from './dataGeometry';
import { loadAsset } from './journey';

export type CalculationIndex = {
  resultVersion: string;
  window: number;
  features: number;
  models: Record<string, { chunks: (WindowChunk & Asset)[] }>;
};

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

export const loadCalculationIndex = (data: Journey) =>
  loadJsonAsset<CalculationIndex>(data.calculation);
