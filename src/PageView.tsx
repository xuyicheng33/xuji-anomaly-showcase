import { FeatureMap, Flow, ModelOverview, Outcomes, StreamOverview } from './components';
import type { Provenance, Research } from './types';

export interface ViewProps { id: number; data: Research; provenance: Provenance; field: number; onField: (n: number) => void; start: number; onStart: (n: number) => void }
export function PageView(props: ViewProps) {
  const { id, data, field, onField } = props;
  if (id === 2) return <StreamOverview data={data} />;
  if (id === 22) return <FeatureMap data={data} field={field} onField={onField} />;
  if (id === 43) return <ModelOverview />;
  if (id === 57) return <Outcomes {...props} />;
  return <Flow steps={[{ title: '原始数据', detail: '五类资料 · 817 份文件' }, { title: '研究输入', detail: '8,759 行 · 28 维' }, { title: '三种模型', detail: '时序 · 时空 · 记忆' }, { title: '异常判定', detail: '重建误差 · 阈值' }, { title: '报告成果', detail: 'Precision · Recall · F1 · AUC' }]} />;
}
