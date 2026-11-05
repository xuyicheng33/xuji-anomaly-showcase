import { loadCoveringPredictions, type Model } from './journey';

export function rankContributions(errors: Float64Array, features: number) {
  const rows = Array.from(errors, (error, feature) => ({
    feature,
    error,
    contribution: error / features,
  }));
  const total = rows.reduce((sum, row) => sum + row.contribution, 0);
  return {
    total,
    rows: rows.sort((a, b) => b.contribution - a.contribution || a.feature - b.feature),
  };
}

export async function sensorWindows(model: Model, index: number, feature: number, input: number) {
  const rows = await loadCoveringPredictions(model, index);
  return rows.map(({ start, predictions }) => {
    const prediction = predictions[feature];
    return { start, prediction, input, error: (input - prediction) ** 2 };
  });
}
export type SensorWindow = Awaited<ReturnType<typeof sensorWindows>>[number];

/** Linear interpolation over the explicitly labelled scale in the detail view. */
export function errorColor(error: number, maximum: number) {
  const amount = Math.max(0, Math.min(1, error / maximum));
  const pale = [237, 242, 247],
    blue = [38, 77, 112];
  return `rgb(${pale.map((value, i) => Math.round(value + (blue[i] - value) * amount)).join(',')})`;
}
