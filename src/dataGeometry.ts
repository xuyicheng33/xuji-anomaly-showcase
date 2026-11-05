/** Experiment geometry and display choices are intentionally separate. */
export const displaySettings = { playbackPoints: 64, pointsBeforeCursor: 40, trainingPoints: 192 };

export function coveringWindows(index: number, rows: number, window: number) {
  if (!Number.isInteger(index) || index < 0 || index >= rows || window < 1 || window > rows)
    return [];
  const first = Math.max(0, index - window + 1);
  const last = Math.min(index, rows - window);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export function rowChunks(start: number, length: number, chunkRows: number) {
  const first = Math.floor(start / chunkRows) * chunkRows;
  const last = Math.floor((start + length - 1) / chunkRows) * chunkRows;
  return Array.from({ length: (last - first) / chunkRows + 1 }, (_, i) => first + i * chunkRows);
}
