export const datasetConfigs = {
  converter: {
    title: '换流设备',
    brandSubtitle: '异常检测研究',
    titleSuffix: '',
    root: 'data/journey/',
    modelId: 'model1',
    alternate: 'wind',
    alternateTitle: '风电数据集',
    chapterText: {
      data: ['数据整理', '监测数据预处理', '无效记录剔除、缺失填补与归一化'],
      models: ['两种方法', '两种异常检测模型', '双分支结构与多尺度时空建模'],
    },
  },
  wind: {
    title: '风电设备',
    brandSubtitle: '风电异常检测研究',
    titleSuffix: ' · 风电数据集',
    root: 'data/wind/',
    modelId: 'model2',
    alternate: 'converter',
    alternateTitle: '换流数据集',
    chapterText: {
      data: ['数据整理', '风电数据预处理', '功率与天气对齐、字段选择与归一化'],
      models: ['检测方法', '方法二：异常检测模型', '多尺度时间分支、掩码与重建'],
    },
  },
} as const;
/** Dataset links keep separate page sessions and caches. */
export const datasetId =
  new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('dataset') ===
  'wind'
    ? 'wind'
    : 'converter';
export const isWind = datasetId === 'wind';
export const dataset = datasetConfigs[datasetId];
export const dataRoot = dataset.root;
export const dataUrl = (file: string) => import.meta.env.BASE_URL + dataRoot + file;
export const datasetHome = (id: 'wind' | 'converter') =>
  import.meta.env.BASE_URL + (id === 'wind' ? '?dataset=wind#/' : '#/');
