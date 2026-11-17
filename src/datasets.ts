export const datasetConfigs = {
  converter: {
    title: '换流设备',
    titleSuffix: '',
    description: '换流设备的监测数据整理、异常构造、两种检测模型、训练记录与检测评估。',
    root: 'data/journey/',
    modelId: 'model1',
    alternate: 'wind',
    alternateTitle: '风电数据集',
    dataTitle: '监测数据预处理',
  },
  wind: {
    title: '风电设备',
    titleSuffix: ' · 风电数据集',
    description: '风电设备的功率与天气数据整理、异常构造、两种检测模型、训练记录与检测评估。',
    root: 'data/wind/',
    modelId: 'model1',
    alternate: 'converter',
    alternateTitle: '换流数据集',
    dataTitle: '风电数据预处理',
  },
} as const;
/** Dataset links keep separate page sessions and caches. */
export const datasetId =
  new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('dataset') ===
  'wind'
    ? 'wind'
    : 'converter';
export const isWind = datasetId === 'wind';
export const isLegacy =
  new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('version') ===
  'legacy';
export const dataset =
  isLegacy && isWind
    ? {
        ...datasetConfigs.wind,
        modelId: 'model2',
        description: '风电设备的功率与天气数据整理、异常构造、SMST-AD 模型训练记录与检测评估。',
      }
    : datasetConfigs[datasetId];
export const dataRoot = dataset.root;
export const dataUrl = (file: string) => import.meta.env.BASE_URL + dataRoot + file;
export const datasetHome = (id: 'wind' | 'converter', page = 'home') =>
  import.meta.env.BASE_URL +
  (id === 'wind' ? '?dataset=wind' : '') +
  (isLegacy ? (id === 'wind' ? '&' : '?') + 'version=legacy' : '') +
  '#/' +
  (page === 'home' ? '' : page);
