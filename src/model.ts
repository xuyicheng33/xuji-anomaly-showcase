import pages from './content/pages.json';
import type { Research } from './types';

export { pages };
export const stages = ['开始', '原始数据', '筛选与合并', '数据集准备', '异常构造', '窗口输入', '模型与训练', '测试与判定', '成果与来源'];
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const number = (value: number, digits = 0) => value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export function pageFromHash(hash: string) {
  const match = /^#\/step\/(\d{1,2})$/.exec(hash);
  return match ? clamp(Number(match[1]), 1, pages.length) : 1;
}
export const stepHash = (id: number) => `#/step/${String(clamp(id, 1, pages.length)).padStart(2, '0')}`;
export function sourceIds(id: number): string[] {
  if (id === 1) return ['final', 'report', 'data-report', 'weather', 'forecast', 'short', 'powerstat', 'ultrashort'];
  if (id <= 10) return id >= 3 && id <= 7 ? [...[['weather'], ['forecast'], ['powerstat'], ['short'], ['ultrashort']][id - 3], 'data-report'] : ['weather', 'forecast', 'short', 'powerstat', 'ultrashort', 'data-report', 'review'];
  if (id <= 20) return ['raw-merge', 'lineage', 'review', ...(id === 19 ? ['report'] : [])];
  if (id === 21) return ['changes', 'final', 'raw-merge'];
  if (id <= 25 || id >= 27 && id <= 29) return ['final', 'new-train', 'new-test', 'new-labels'];
  if (id === 26) return ['old-data', 'old-processed', 'report'];
  if (id <= 39) return ['anomaly-code', 'window-code', 'report', 'old-inserted-values', 'old-inserted-labels'];
  if (id === 40) return ['final', 'train-code', 'report'];
  if (id <= 42) return ['train-code', 'window-code', 'report', 'checkpoint'];
  if (id === 43) return ['model1', 'model2', 'model3', 'report'];
  if (id === 48) return ['checkpoint', 'old-training-graph', 'train-code'];
  if (id === 49) return ['checkpoint', 'train-code'];
  if (id === 50) return ['new-test', 'new-labels', 'train-code'];
  if (id <= 53) return ['train-code', 'model3', 'report'];
  if (id === 56) return ['old-inserted-labels', 'pot-code'];
  if (id === 57) return ['final', 'report'];
  if (id <= 59) return ['pot-code', 'report'];
  return ['report', 'final', 'checkpoint'];
}
export function chartWindow(data: Research, start: number, count: number, field: number) {
  const from = clamp(Math.floor(start), 0, Math.max(0, data.times.length - count));
  return { from, times: data.times.slice(from, from + count), values: data.values.slice(from, from + count).map(row => row[field]) };
}
