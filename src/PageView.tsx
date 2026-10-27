import { DataPages } from './DataPages';
import { MethodPages } from './MethodPages';
import { ResultPages } from './ResultPages';
import type { Provenance, Research } from './types';

export interface ViewProps { id: number; data: Research; provenance: Provenance; field: number; onField: (n: number) => void; start: number; onStart: (n: number) => void }
export function PageView(props: ViewProps) {
  if (props.id >= 1 && props.id <= 29) return <DataPages {...props} />;
  if (props.id >= 30 && props.id <= 49) return <MethodPages {...props} />;
  if (props.id >= 50 && props.id <= 61) return <ResultPages {...props} />;
  throw new Error(`Unknown page ${props.id}`);
}
