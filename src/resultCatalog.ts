import { loadJson, loadJsonAsset } from './assetRequests';
import { validAsset, validateJourney } from './journeyValidation';
import type { Journey, Model, ResultCatalog } from './journeyTypes';

export function validateResultCatalog(catalog: ResultCatalog, dataset: string) {
  if (
    !catalog ||
    catalog.schemaVersion !== 1 ||
    catalog.dataset !== dataset ||
    catalog.defaultModel !== 'model1' ||
    !Array.isArray(catalog.methods) ||
    catalog.methods.length !== 2 ||
    new Set(catalog.methods.map((m) => m?.id)).size !== 2 ||
    catalog.methods.some(
      (method) =>
        !method ||
        !['model1', 'model2'].includes(method.id) ||
        !validAsset(method.manifest) ||
        !Number.isSafeInteger(method.window) ||
        method.window < 1 ||
        !Number.isSafeInteger(method.epochs) ||
        method.epochs < 1 ||
        !Number.isSafeInteger(method.maskSpan) ||
        method.maskSpan < 1 ||
        method.maskSpan >= method.window ||
        !['temporal', 'spatiotemporal'].includes(method.decoder) ||
        !method.caseGeometry ||
        !(
          method.caseGeometry.begin >= 0 &&
          method.caseGeometry.begin < method.caseGeometry.end &&
          method.caseGeometry.end <= method.window
        ),
    )
  )
    throw Error('结果清单不匹配');
}

export async function readResult(dataset: string, methodId: string) {
  const catalog = await loadJson<ResultCatalog>('results.json', (value) =>
    validateResultCatalog(value, dataset),
  );
  const method = catalog.methods.find((value) => value.id === methodId);
  if (!method) throw Error('没有对应的方法结果');
  const data = await loadJsonAsset<Journey>(method.manifest);
  validateJourney(data, dataset);
  const model = data.models[0];
  if (
    data.models.length !== 1 ||
    model.id !== method.id ||
    data.window !== method.window ||
    model.history.length !== method.epochs ||
    model.threshold !== method.threshold ||
    model.windowThreshold !== method.windowThreshold ||
    JSON.stringify(model.metrics) !== JSON.stringify(method.metrics)
  )
    throw Error('方法与结果不匹配');
  return { ...data, methodResults: catalog.methods };
}

export const availableMethods = (data: Journey) => data.methodResults ?? data.models;

export function caseGeometry(data: Journey, model: Pick<Model, 'id'> = data.models[0]) {
  return (
    data.methodResults?.find((method) => method.id === model.id)?.caseGeometry ?? {
      start: 107,
      begin: 18,
      end: 42,
      referenceStart: 175,
      peak: 30,
      patchSize: 4,
      sourceBegin: 18,
      sourceEnd: 26,
      scale: 3,
    }
  );
}
