import { DataPages } from './DataPages';
import { MethodPages } from './MethodPages';
import { ResultPages } from './ResultPages';
import type { Provenance, Research } from './types';
import { pageIntroductions } from './content/copy';

export interface ViewProps { id: number; data: Research; provenance: Provenance; field: number; onField: (n: number) => void; start: number; onStart: (n: number) => void }
export function PageView(props: ViewProps) {
  const body = props.id >= 1 && props.id <= 29 ? <DataPages {...props} /> : props.id >= 30 && props.id <= 49 ? <MethodPages {...props} /> : props.id >= 50 && props.id <= 61 ? <ResultPages {...props} /> : null;
  if (!body) throw new Error(`Unknown page ${props.id}`);
  return <>{pageIntroductions[props.id] && <p className="page-intro">{pageIntroductions[props.id]}</p>}{body}</>;
}
