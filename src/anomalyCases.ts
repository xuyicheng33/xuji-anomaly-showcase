import { loadJsonAsset } from './assetRequests';
import { loadAsset, type Asset, type Journey, type Metrics } from './journey';

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
  source: {
    referenceStart?: number;
    scale?: number;
    peak?: number;
    patchSize?: number;
    sourceBegin?: number;
    sourceEnd?: number;
  };
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
export const loadCases = (data: Journey) => loadJsonAsset<CaseCatalog>(data.cases);
export async function loadCaseArrays(c: AnomalyCase): Promise<CaseArrays> {
  const [original, material, candidate, weights, input, labels] = await Promise.all(
    [c.original, c.material, c.candidate, c.weights, c.input, c.labels].map(loadAsset),
  );
  return { original, material, candidate, weights, input, labels };
}
