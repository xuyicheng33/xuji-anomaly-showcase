import { SelectionIndicator } from './ReportUI';
import { methods, kinds } from './caseContent';
import { Footnote } from './notes';
import type { useCaseConstruction } from './useCaseConstruction';

export default function CaseNavigation({
  state,
}: {
  state: ReturnType<typeof useCaseConstruction>;
}) {
  const {
    method,
    construction,
    pickerOpen,
    setPlaying,
    setPickerOpen,
    insertion,
    kind,
    setInsertion,
    setKind,
  } = state;
  return (
    <aside className="case-navigation" aria-label="异常案例导航">
      <button
        className="case-selection-summary"
        aria-expanded={pickerOpen}
        aria-controls="case-navigation-options"
        onClick={() => {
          setPlaying(false);
          setPickerOpen((open) => !open);
        }}
      >
        <strong>
          {method.name} · {construction.name}
        </strong>
        <span>{pickerOpen ? '收起选择' : '更换方式'}</span>
      </button>
      <div
        id="case-navigation-options"
        className={'case-navigation-options' + (pickerOpen ? ' is-open' : '')}
      >
        <div className="case-nav-group">
          <h2>
            插入方式
            <Footnote note="anomaly-cases" />
          </h2>
          <div className="segmented case-methods" role="group" aria-label="插入方式">
            <SelectionIndicator />
            {methods.map((m) => (
              <button
                key={m.id}
                aria-pressed={insertion === m.id}
                onClick={() => {
                  setInsertion(m.id);
                  setPickerOpen(false);
                }}
              >
                <strong>{m.name}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="case-nav-group">
          <h2>构造方法</h2>
          <div className="case-kinds">
            {kinds.map((k, i) => (
              <button
                key={k.id}
                aria-pressed={kind === k.id}
                onClick={() => {
                  setKind(k.id);
                  setPickerOpen(false);
                }}
              >
                <span>0{i + 1}</span>
                <strong>{k.name}</strong>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
        <details className="case-explanation">
          <summary>查看构造说明与公式</summary>
          <p>{method.copy}</p>
          <p>{construction.copy}</p>
          <p>{method.formula}</p>
        </details>
      </div>
    </aside>
  );
}
