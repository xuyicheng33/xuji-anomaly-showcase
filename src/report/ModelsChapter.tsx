import { type Journey, type Model } from '../journey';
import { useLayoutEffect, useRef, useState } from 'react';
import { availableMethods } from '../resultCatalog';
import { Heading, ModelSelect, SelectionIndicator } from './ReportUI';
import { Footnote } from './notes';
import { chapterContent } from './navigation';
import { fullNames, type Architecture, type Phase } from './modelArchitecture';
import { ArchitectureFigure, FlowFigure, ModulePanel, figureNodes } from './ModelFigure';
import { usePresentationState } from './usePresentationState';
import { ReportFigure } from './ReportFigure';

/** Below this width the figure's labels drop under 11px, so the grouped rows take over. */
const FIGURE_WIDTH = 920;

function useWide() {
  const ref = useRef<HTMLDivElement>(null),
    [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWide(element.clientWidth >= FIGURE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, wide] as const;
}

export function ModelsChapter({
  data,
  model,
  setModel,
}: {
  data: Journey;
  model: Model;
  setModel: (value: string) => void;
}) {
  const architecture: Architecture = model.id === 'model2' ? 'smst' : 'stam';
  const comparing = availableMethods(data).length > 1;
  const [phase, setPhase] = usePresentationState<Phase>('models:phase', 'train');
  const [chosen, setChosen] = usePresentationState<string | null>('models:node', null);
  const [ref, wide] = useWide();
  // On wide screens the explanation sits under the figure; bring its opening lines into view.
  const select = (key: string | null) => {
    setChosen(key);
    if (!key || !wide) return;
    requestAnimationFrame(() => {
      const panel = ref.current?.querySelector('.model-panel');
      if (!panel) return;
      const shortfall = panel.getBoundingClientRect().top - (innerHeight - 240);
      if (shortfall > 0)
        scrollBy({
          top: shortfall,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
    });
  };
  // Keep the choice across models and stages when the same module exists there.
  const nodes = figureNodes(architecture, phase);
  const mapped =
    chosen === 'loss' && phase === 'test'
      ? 'pot'
      : chosen === 'pot' && phase === 'train'
        ? 'loss'
        : chosen;
  const current = nodes.find((node) => node.key === mapped);
  const selected = current && !(phase === 'test' && current.trainOnly) ? current.key : null;
  const props = {
    architecture,
    phase,
    selected,
    select,
    showAdded: comparing && architecture === 'smst',
  };
  const panel = (
    <ModulePanel {...props} context={{ window: data.window, features: data.features.length }} />
  );
  return (
    <div className="models-chapter" ref={ref}>
      <Heading
        label={chapterContent.models.title}
        title={
          <>
            {chapterContent.models.title}
            <Footnote note="model-design" />
          </>
        }
      />
      <div className="model-selection-row">
        <ModelSelect data={data} value={model.id} onChange={setModel} />
        <div className="segmented phase-select" role="group" aria-label="阶段">
          <SelectionIndicator />
          {(
            [
              ['train', '训练阶段'],
              ['test', '测试阶段'],
            ] as const
          ).map(([value, name]) => (
            <button key={value} aria-pressed={phase === value} onClick={() => setPhase(value)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="model-intro" key={'intro-' + architecture}>
        <div>
          <h2>
            {fullNames[architecture].map((phrase) => (
              <span key={phrase} className="title-phrase">
                {phrase}
              </span>
            ))}
          </h2>
          {props.showAdded && (
            <p className="model-added-key">
              <i aria-hidden="true" />
              相对 STAM-AD 新增
            </p>
          )}
        </div>
        <ReportFigure architecture={architecture} />
      </div>
      <div className="model-architecture" key={'figure-' + architecture}>
        {wide ? (
          <>
            <ArchitectureFigure {...props} />
            {panel}
          </>
        ) : (
          <FlowFigure {...props} panel={panel} />
        )}
      </div>
    </div>
  );
}
