import { loadBinary } from './assetRequests';
import { loadAsset, type Asset, type Journey, type Metrics } from './journey';
import { validMatrix, validMetrics } from './journeyValidation';

export type Insertion = 'replace' | 'blend';
export type Construction = 'reference' | 'uniform' | 'peak' | 'length';
export type CaseModel = {
  id: string;
  name: string;
  recon: Asset;
  scores: number[];
  threshold: number;
  metrics: Metrics;
};
export type AnomalyCase = {
  id: string;
  name: string;
  insertion: Insertion;
  kind: Construction;
  start: number;
  begin: number;
  end: number;
  feature: number;
  features: number[];
  times: string[];
  source: { referenceStart?: number; scale?: number; peak?: number };
  original: Asset;
  material: Asset;
  candidate: Asset;
  weights: Asset;
  input: Asset;
  labels: Asset;
  models: CaseModel[];
};
export type CaseArrays = {
  original: Float64Array;
  material: Float64Array;
  candidate: Float64Array;
  weights: Float64Array;
  input: Float64Array;
  labels: Float64Array;
};
export type CaseCatalog = { version: string; cases: AnomalyCase[] };
export function validateCases(catalog: CaseCatalog, data: Journey) {
  const kinds = ['reference', 'uniform', 'peak', 'length'];
  const insertions = ['replace', 'blend'];
  const index = (value: number, limit: number) =>
    Number.isSafeInteger(value) && value >= 0 && value < limit;
  if (
    !catalog ||
    typeof catalog.version !== 'string' ||
    !catalog.version ||
    !Array.isArray(catalog.cases) ||
    catalog.cases.length !== kinds.length * insertions.length ||
    new Set(catalog.cases.map((c) => c?.id)).size !== catalog.cases.length ||
    new Set(catalog.cases.map((c) => c && `${c.insertion}/${c.kind}`)).size !==
      catalog.cases.length ||
    catalog.cases.some(
      (c) =>
        !c ||
        !c.id ||
        !c.name ||
        !kinds.includes(c.kind) ||
        !insertions.includes(c.insertion) ||
        !index(c.start, data.times.length - data.window + 1) ||
        !index(c.begin, data.window) ||
        !Number.isSafeInteger(c.end) ||
        c.end <= c.begin ||
        c.end > data.window ||
        !Array.isArray(c.times) ||
        c.times.length !== data.window ||
        c.times.some((time, i) => time !== data.times[c.start + i]) ||
        !Array.isArray(c.features) ||
        !c.features.length ||
        new Set(c.features).size !== c.features.length ||
        !c.features.includes(c.feature) ||
        c.features.some((feature) => !index(feature, data.features.length)) ||
        !c.source ||
        (c.kind === 'reference' &&
          !index(c.source.referenceStart!, data.times.length - (c.end - c.begin) + 1)) ||
        [c.original, c.material, c.candidate, c.weights, c.input, c.labels].some(
          (asset) => !validMatrix(asset, data.window, data.features.length),
        ) ||
        !Array.isArray(c.models) ||
        c.models.length !== data.models.length ||
        new Set(c.models.map((model) => model?.id)).size !== data.models.length ||
        c.models.some(
          (model) =>
            !model ||
            !data.models.some((m) => m.id === model.id) ||
            !model.name ||
            !Number.isFinite(model.threshold) ||
            !Array.isArray(model.scores) ||
            model.scores.length !== data.window ||
            model.scores.some((score) => !Number.isFinite(score) || score < 0) ||
            !validMatrix(model.recon, data.window, data.features.length) ||
            !validMetrics(model.metrics, data.window),
        ),
    )
  )
    throw Error('案例资料版本不匹配');
}
export async function loadCases(data: Journey) {
  const raw = await loadBinary(data.cases);
  const catalog = JSON.parse(new TextDecoder().decode(raw)) as CaseCatalog;
  validateCases(catalog, data);
  return catalog;
}
export async function loadCaseArrays(c: AnomalyCase): Promise<CaseArrays> {
  const [original, material, candidate, weights, input, labels] = await Promise.all(
    [c.original, c.material, c.candidate, c.weights, c.input, c.labels].map(loadAsset),
  );
  return { original, material, candidate, weights, input, labels };
}
