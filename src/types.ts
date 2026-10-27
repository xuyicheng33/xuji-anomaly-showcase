export type Cell = string | number;

// ================= 换流设备 (Converter) 核心展示类型 =================
export interface ConverterFeature {
  index: number;
  key: string;
  label: string;
  group: string;
  unit: string;
}

export interface ConverterDatasetMeta {
  name: string;
  device: string;
  totalSamples: number;
  trainSamples: number;
  testSamples: number;
  featuresCount: number;
  timeRange: string;
  splitRatio: string;
  normalTraining: boolean;
  totalAnomalousPoints: number;
  anomalyRatio: number;
  anomalySegmentsCount: number;
}

export interface AnomalySegment {
  start: number;
  end: number;
  length: number;
  startTime: string;
  endTime: string;
}

export interface ModelMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
}

export interface ConverterModelInfo {
  key: string;
  name: string;
  title: string;
  threshold: number;
  scores: number[];
  recons: Record<string, number[]>;
  metrics: ModelMetrics;
}

export interface AnomalyStudioScenario {
  id: string;
  name: string;
  anomalyType: string;
  injectionMode: string;
  description: string;
  physicsMeaning: string;
  formula: string;
  cleanWave: number[];
  anomWave: number[];
  labels: number[];
}

export interface ConverterShowcaseData {
  datasetMeta: ConverterDatasetMeta;
  features: ConverterFeature[];
  coreFeatures: ConverterFeature[];
  times: string[];
  labels: number[];
  anomalySegments: AnomalySegment[];
  testRaw: Record<string, number[]>;
  models: Record<string, ConverterModelInfo>;
  anomalyStudio: AnomalyStudioScenario[];
}

// ================= 历史风电展示兼容类型 =================
export interface Feature {
  key: string;
  label: string;
  unit: string;
  group: string;
  min: number;
  max: number;
}

export interface Stream {
  id: string;
  name: string;
  files: number;
  rawRows: number;
  platformRows: number;
  stationRows: number;
  used: boolean;
  start: string;
  end: string;
  timeColumn: string;
  columns: string[];
  sample: Record<string, Cell>[];
  coverage: { start: string; end: string; points: number }[];
}

export interface Metric {
  model: string;
  features: number;
  window: number;
  rate: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
}

export interface Research {
  schemaVersion: number;
  version: string;
  features: Feature[];
  times: string[];
  values: number[][];
  columns: string[];
  split: number;
  labelShape: number[];
  initialPositiveLabels: number;
  streams: Stream[];
  duplicateWeather: Record<string, Cell>[];
  review: Record<string, unknown>;
  rawSample: Record<string, Cell>[];
  lineage: Record<string, Cell>[];
  midnight: Record<string, Cell>[];
  changes: Record<string, Cell>[];
  candidates: { start: string; end: string; rows: number }[];
  metrics: Metric[];
  checks: Record<string, number>;
  old: {
    data: number[][];
    processed: number[][];
    features: string[];
    inserted_values: number[][];
    inserted_labels: number[][];
    positiveCells: number;
    positiveTimes: number;
    history: [number, number][];
    checkpoint: { keys: string[]; epoch: number; state_entries: number };
  };
}

export interface Source {
  id: string;
  title: string;
  file: string;
  path: string;
  version: string;
  bytes: number;
  sha256: string;
  note: string;
  excerpt?: string;
}

export interface Provenance {
  schemaVersion: number;
  exportedOn: string;
  sources: Source[];
  assets: { file: string; bytes: number; sha256: string; sourceId?: string }[];
}

export interface Page {
  id: number;
  stage: number;
  title: string;
  description: string;
}
