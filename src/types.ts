export type Cell = string | number;
export interface Feature { key: string; label: string; unit: string; group: string; min: number; max: number }
export interface Stream { id: string; name: string; files: number; rawRows: number; platformRows: number; stationRows: number; used: boolean; start: string; end: string; timeColumn: string; columns: string[]; sample: Record<string, Cell>[]; coverage: { start: string; end: string; points: number }[] }
export interface Metric { model: string; features: number; window: number; rate: number; precision: number; recall: number; f1: number; auc: number }
export interface Research {
  schemaVersion: number; version: string; features: Feature[]; times: string[]; values: number[][];
  columns: string[]; split: number; labelShape: number[]; initialPositiveLabels: number;
  streams: Stream[]; duplicateWeather: Record<string, Cell>[]; review: Record<string, unknown>; rawSample: Record<string, Cell>[];
  lineage: Record<string, Cell>[]; midnight: Record<string, Cell>[]; changes: Record<string, Cell>[];
  candidates: { start: string; end: string; rows: number }[]; metrics: Metric[];
  checks: Record<string, number>;
  old: { data: number[][]; processed: number[][]; features: string[]; inserted_values: number[][]; inserted_labels: number[][]; positiveCells: number; positiveTimes: number; history: [number, number][]; checkpoint: { keys: string[]; epoch: number; state_entries: number } };
}
export interface Source { id: string; title: string; file: string; path: string; version: string; bytes: number; sha256: string; note: string; excerpt?: string }
export interface Provenance { schemaVersion: number; exportedOn: string; sources: Source[]; assets: { file: string; bytes: number; sha256: string; sourceId?: string }[] }
export interface Page { id: number; stage: number; title: string; description: string }
