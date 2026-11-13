import type { Model } from '../journey';

/** Presentation names follow the report; retained manifests keep their original identity. */
export const modelNames = {
  model1: {
    short: 'STAM-AD',
    full: '基于自适应掩码与有界异常损失的自监督 TCN-Transformer 异常检测模型',
  },
  model2: {
    short: 'SMST-AD',
    full: '多尺度时空依赖建模的自监督 TCN-Transformer 异常检测模型',
  },
};

export function modelName(model: Pick<Model, 'id' | 'name'>) {
  return modelNames[model.id as keyof typeof modelNames]?.short ?? model.name;
}
