import { loadJson } from './assetRequests';
import { loadAsset, type Asset, type Metrics } from './journey';

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
export function loadCases() {
  return loadJson<{ version: string; cases: AnomalyCase[] }>(
    'anomaly-cases-v1/manifest.json',
    (d) => {
      if (d.cases?.length !== 8) throw Error('案例资料不完整');
    },
  );
}
export async function loadCaseArrays(c: AnomalyCase): Promise<CaseArrays> {
  const [original, material, candidate, weights, input, labels] = await Promise.all(
    [c.original, c.material, c.candidate, c.weights, c.input, c.labels].map(loadAsset),
  );
  return { original, material, candidate, weights, input, labels };
}
