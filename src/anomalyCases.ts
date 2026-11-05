import { dataUrl } from './datasets';
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
let manifest: Promise<{ version: string; cases: AnomalyCase[] }> | undefined;
export function loadCases() {
  return (manifest ??= fetch(dataUrl('anomaly-cases-v1/manifest.json'))
    .then(async (r) => {
      if (!r.ok) throw Error('案例读取失败');
      const d = await r.json();
      if (d.cases?.length !== 8) throw Error('案例资料不完整');
      return d;
    })
    .catch((e) => {
      manifest = undefined;
      throw e;
    }));
}
export async function loadCaseArrays(c: AnomalyCase): Promise<CaseArrays> {
  const [original, material, candidate, weights, input, labels] = await Promise.all(
    [c.original, c.material, c.candidate, c.weights, c.input, c.labels].map(loadAsset),
  );
  return { original, material, candidate, weights, input, labels };
}
