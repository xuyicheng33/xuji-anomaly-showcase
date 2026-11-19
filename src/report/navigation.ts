import { dataset } from '../datasets';
export const chapterContent = {
  data: { name: '数据整理', title: dataset.dataTitle },
  anomalies: { name: '异常构造', title: '异常样本构造' },
  models: { name: '检测模型', title: '异常检测模型' },
  training: { name: '模型训练', title: '模型训练过程' },
  detection: { name: '分数计算', title: '异常分数计算' },
  playback: { name: '连续回放', title: '检测结果回放' },
} as const;
export const chapters = Object.entries(chapterContent).map(([id, content]) => ({ id, ...content }));
export function route() {
  const path = location.hash.replace('#/', '').split('?')[0];
  if (chapters.some((c) => c.id === path) || path === 'metrics') return path;
  return 'home';
}
