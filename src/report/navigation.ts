import { dataset } from '../datasets';
const converterChapters = [
  ['data', '数据整理', '监测数据预处理', '无效记录剔除、缺失填补与归一化'],
  ['anomalies', '异常构造', '异常样本构造', '四类异常的构造过程与标签'],
  ['models', '两种方法', '两种异常检测模型', '双分支结构与多尺度时空建模'],
  ['training', '模型训练', '模型训练过程', '训练窗口、参数更新与损失变化'],
  ['detection', '片段检测', '数据片段检测', '窗口重建、异常评分与阈值判定'],
  ['playback', '连续回放', '连续检测结果回放', '逐时刻检测与累计评估指标'],
];
export const chapters = converterChapters.map((chapter) => {
  if (chapter[0] === 'data' || chapter[0] === 'models')
    return [chapter[0], ...dataset.chapterText[chapter[0]]];
  return chapter;
});
export function route() {
  const path = location.hash.replace('#/', '').split('?')[0];
  if (chapters.some((c) => c[0] === path) || path === 'metrics') return path;
  return 'home';
}
