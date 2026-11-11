export type Asset = {
  file: string;
  shape: number[];
  bytes: number;
  sha256: string;
};
export type CurveAsset = Asset & { curves: Record<string, string> };
export type Metrics = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
};
export type WindowChunk = {
  start: number;
  count: number;
  file: string;
  bytes: number;
  sha256: string;
};
export type Model = {
  id: string;
  name: string;
  threshold: number;
  scores: number[];
  history: { epoch: number; loss: number; lr: number }[];
  recon: CurveAsset;
  focusFeatures: number[];
  metrics: { point_wise: Metrics; point_adjusted: Metrics; continuous_score_auc: number };
  windowThreshold: number;
  run: string;
  windows: {
    chunks: (WindowChunk & { integrity: Asset })[];
    count: number;
    length: number;
    features: number;
  };
  contributions: { chunks: WindowChunk[]; features: number };
  examples: { code: string; index: number; start: number; feature: number }[];
};
export type Feature = {
  group?: string;
  index: number;
  key: string;
  label: string;
  description: string;
};
export type Journey = {
  dataset?: {
    id: string;
    title: string;
    sourceDate: string;
    samplingMinutes: number;
    sourceFiles: string[];
    unmatchedRows: number;
    missingValues: number;
    labelCells: number;
    outsideUnitRange: number;
  };
  normalization?: { epsilon: number; clip: boolean };
  datasets: Record<string, CurveAsset & { keys: string[]; times: string[] }>;
  schemaVersion: number;
  resultVersion: string;
  window: number;
  inputChunkRows: number;
  inputRowHashes: string[];
  cases: Pick<Asset, 'file' | 'bytes' | 'sha256'>;
  features: Feature[];
  times: string[];
  labels: number[];
  models: Model[];
  input: CurveAsset;
  labelMatrix: CurveAsset;
  summary: {
    rawRows: number;
    rawFeatures: number;
    emptyFeatures: number;
    emptyRows: number;
    cleanRows: number;
    features: number;
    trainRows: number;
    testRows: number;
    anomalousRows: number;
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;
    omittedTimes: string[];
    cleanStart: string;
    cleanEnd: string;
  };
  removedFeatures: string[];
};
