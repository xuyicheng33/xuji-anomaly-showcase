import { isWind, isLegacy } from '../datasets';
import { useEffect, type ReactNode } from 'react';
import { presentationMemory } from './presentationMemory';

// Stable reading order. Repeated references reuse the same number.
export const notes = [
  { id: 'data-records', title: '原始数据与处理例子', page: 'data' },
  { id: 'data-source', title: '数据来源与测点清单', page: 'data' },
  { id: 'data-split', title: '训练集与测试集划分', page: 'data' },
  { id: 'normalization', title: '归一化公式与边界', page: 'data' },
  { id: 'anomaly-process', title: '序列异常插入流程', page: 'anomalies' },
  { id: 'anomaly-labels', title: '测点标签与时刻标签', page: 'anomalies' },
  { id: 'anomaly-cases', title: '八种构造案例', page: 'anomalies' },
  { id: 'length-sampling', title: '长度调整与采样', page: 'anomalies' },
  { id: 'window-settings', title: '窗口、训练批次与结果来源', page: 'training' },
  { id: 'score-calculation', title: '单窗口异常分数计算', page: 'detection' },
  { id: 'thresholds', title: '阈值与评估规则', page: 'detection' },
  { id: 'point-metrics', title: '逐点指标与区间点调整', page: 'detection' },
  { id: 'window-aggregation', title: '连续回放与跨窗口合并', page: 'playback' },
  {
    id: 'model-design',
    title: isWind && isLegacy ? 'SMST-AD 的设计与结果' : '两种模型的设计与结果',
    page: 'models',
  },
  { id: 'training-mse', title: '训练重建误差与优化目标', page: 'training' },
] as const;
export type NoteId = (typeof notes)[number]['id'];
const noteLinks: Record<NoteId, string> = {
  'data-records': '数据说明',
  'data-source': '测点清单',
  'data-split': '划分说明',
  normalization: '计算方法',
  'anomaly-process': '插入方法',
  'anomaly-labels': '标签说明',
  'anomaly-cases': '案例说明',
  'length-sampling': '采样说明',
  'window-settings': '窗口说明',
  'score-calculation': '分数计算',
  thresholds: '阈值说明',
  'point-metrics': '评估口径',
  'window-aggregation': '合并规则',
  'model-design': '模型说明',
  'training-mse': '训练说明',
};
export function getNoteOrigin() {
  return presentationMemory.noteOrigin;
}
export function rememberNoteOrigin(reference = '') {
  if (location.hash.startsWith('#/metrics')) return;
  presentationMemory.noteOrigin = { hash: location.hash || '#/', y: window.scrollY, reference };
}
export function pausePresentation() {
  window.dispatchEvent(new Event('showcase:pause'));
}
export function usePauseOnNavigation(pause: () => void) {
  useEffect(() => {
    window.addEventListener('showcase:pause', pause);
    return () => window.removeEventListener('showcase:pause', pause);
  }, [pause]);
}
export function Footnote({ note, reference }: { note: NoteId; reference?: string }) {
  const index = notes.findIndex((item) => item.id === note),
    item = notes[index];
  const id = reference ?? `ref-${item.page}-${note}`;
  const params = new URLSearchParams({ note });
  return (
    <span className="footnote">
      <a
        id={id}
        href={'#/metrics?' + params}
        aria-label={`${noteLinks[note]}：${item.title}（注 ${index + 1}）`}
        title={item.title}
        onClick={() => {
          rememberNoteOrigin(id);
          pausePresentation();
        }}
      >
        <span aria-hidden="true">{noteLinks[note]} →</span>
      </a>
    </span>
  );
}
export function NoteSection({ id, children }: { id: NoteId; children: ReactNode }) {
  const origin = presentationMemory.noteOrigin;
  const index = notes.findIndex((item) => item.id === id),
    item = notes[index],
    target = new URLSearchParams(location.hash.split('?')[1] ?? '').get('note');
  return (
    <section
      className="explanation-entry"
      id={'note-' + id}
      tabIndex={-1}
      aria-labelledby={'note-title-' + id}
    >
      <div className="explanation-heading">
        <span className="explanation-number">{String(index + 1).padStart(2, '0')}</span>
        <h2 id={'note-title-' + id}>{item.title}</h2>
        {origin && target === id && (
          <a className="inline-link note-return" href={origin.hash}>
            返回引用处 ↑
          </a>
        )}
      </div>
      <div className="explanation-body">{children}</div>
    </section>
  );
}
