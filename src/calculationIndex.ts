import { loadBinary } from './assetRequests';
import type { Asset, Journey } from './journeyTypes';
import { validAsset } from './journeyValidation';

export type CalculationIndex = {
  resultVersion: string;
  window: number;
  features: number;
  models: Record<string, Asset>;
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
      const asset = catalog.models[model.id];
      return (
        !validAsset(asset) ||
        asset.shape.length !== 2 ||
        asset.shape[0] !== model.windows.count ||
        asset.shape[1] !== data.window ||
        asset.bytes !== model.windows.count * data.window * 8
      );
    })
  )
    throw Error('计算索引版本不一致');
}

export async function loadCalculationIndex(data: Journey) {
  const raw = await loadBinary(data.calculation);
  const catalog: CalculationIndex = JSON.parse(new TextDecoder().decode(raw));
  validateCalculation(catalog, data);
  return catalog;
}
