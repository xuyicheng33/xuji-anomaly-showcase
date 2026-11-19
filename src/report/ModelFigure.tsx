import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  designRows,
  figures,
  flows,
  type FlowGroup,
  moduleText,
  type Architecture,
  type Box,
  type Figure,
  type FigureNode,
  type Phase,
} from './modelArchitecture';
import { FormulaLine } from './MathText';
import { ModelVisual } from './ModelVisuals';

type Selection = {
  architecture: Architecture;
  phase: Phase;
  selected: string | null;
  select: (key: string | null) => void;
};

export function figureNodes(architecture: Architecture, phase: Phase) {
  const figure = figures[architecture];
  return phase === 'test'
    ? figure.nodes.map((node) => (node.key === 'loss' ? figure.end : node))
    : figure.nodes;
}

/** Join wrapped lines; Latin words keep their space, Chinese runs join directly. */
export const nodeName = (node: FigureNode) =>
  node.lines.reduce((name, line) =>
    /[A-Za-z]$/.test(name) && /^[A-Za-z]/.test(line) ? name + ' ' + line : name + line,
  );
const isOff = (node: FigureNode, phase: Phase) => phase === 'test' && !!node.trainOnly;

/** Position of an image-pixel box as percentages of the figure. */
const place = (figure: Figure, [x, y, w, h]: Box): CSSProperties => ({
  left: (x / figure.width) * 100 + '%',
  top: (y / figure.height) * 100 + '%',
  width: (w / figure.width) * 100 + '%',
  height: (h / figure.height) * 100 + '%',
});

/**
 * The report's own figure with a clickable area over each module. The chosen module stays
 * clear while the rest of the figure recedes; in the test stage training-only parts are veiled.
 */
export function ImageFigure({
  architecture,
  phase,
  selected,
  select,
  showAdded,
}: Selection & { showAdded: boolean }) {
  const figure = figures[architecture];
  const mask = useId();
  const nodes = figureNodes(architecture, phase);
  const chosen = nodes.find((node) => node.key === selected);
  const lit = chosen
    ? nodes.filter((node) => node === chosen || (chosen.group && node.group === chosen.group))
    : [];
  const veiled = phase === 'test' ? figure.nodes.filter((node) => node.trainOnly) : [];
  return (
    <div
      className={'image-figure is-' + phase + (chosen ? ' has-selection' : '')}
      role="group"
      aria-label={'模型结构图，报告' + figure.number}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selected) {
          event.stopPropagation();
          select(null);
        }
      }}
    >
      <img src={figure.src} alt="" width={figure.width} height={figure.height} draggable={false} />
      <svg
        className="image-figure-shade"
        viewBox={`0 0 ${figure.width} ${figure.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {veiled.map((node) =>
          node.boxes.map((box) => (
            <rect
              key={node.key + box.join()}
              className="figure-veil"
              x={box[0]}
              y={box[1]}
              width={box[2]}
              height={box[3]}
            />
          )),
        )}
        {lit.length > 0 && (
          <>
            <mask id={mask}>
              <rect width={figure.width} height={figure.height} fill="white" />
              {lit.flatMap((node) =>
                node.boxes.map((box) => (
                  <rect
                    key={node.key + box.join()}
                    x={box[0] - 4}
                    y={box[1] - 4}
                    width={box[2] + 8}
                    height={box[3] + 8}
                    rx="8"
                    fill="black"
                  />
                )),
              )}
            </mask>
            <rect
              className="figure-dim"
              width={figure.width}
              height={figure.height}
              mask={`url(#${mask})`}
            />
          </>
        )}
      </svg>
      {nodes.map((node) => {
        const off = isOff(node, phase);
        const pressed = selected === node.key;
        const active = lit.includes(node);
        const toggle = () => select(pressed ? null : node.key);
        return node.boxes.map((box, i) => (
          <button
            key={node.key + i}
            type="button"
            className={
              'figure-hotspot' +
              (node.branch ? ' is-branch' : '') +
              (node.key === 'pot' ? ' is-pot' : '') +
              (active ? ' is-active' : '')
            }
            style={place(figure, box)}
            aria-pressed={i === 0 ? pressed : undefined}
            aria-label={i === 0 ? nodeName(node) : undefined}
            aria-hidden={i === 0 ? undefined : true}
            tabIndex={off || i > 0 ? -1 : undefined}
            disabled={off}
            data-node={i === 0 ? node.key : undefined}
            onClick={toggle}
          >
            {node.key === 'pot' && i === 0 && (
              <span className="figure-pot">
                <strong>重建误差 → POT 阈值</strong>
                <span>异常分数超过阈值判为异常</span>
              </span>
            )}
            {showAdded && node.added && i === 0 && <i className="figure-added" />}
          </button>
        ));
      })}
    </div>
  );
}

/** Narrow screens: the same modules as grouped rows; the explanation opens under its group. */
export function FlowFigure({
  architecture,
  phase,
  selected,
  select,
  showAdded,
  panel,
}: Selection & { showAdded: boolean; panel: ReactNode }) {
  const nodes = new Map(figureNodes(architecture, phase).map((node) => [node.key, node]));
  const resolve = (key: string) => nodes.get(key === 'loss' && phase === 'test' ? 'pot' : key)!;
  const groups = flows[architecture].flatMap((step) =>
    'parallel' in step ? step.parallel : [step],
  );
  const open = groups.find((group) =>
    group.rows.flat().some((key) => resolve(key).key === selected),
  );
  const renderGroup = (group: FlowGroup) => (
    <div key={group.key} className="model-flow-step">
      <div className={'model-flow-group' + (group.added && showAdded ? ' is-added' : '')}>
        {group.label && <span className="model-flow-label">{group.label}</span>}
        {group.rows.map((row) => (
          <div key={row.join()} className="model-flow-items">
            {row.map((key) => {
              const node = resolve(key);
              const pressed = selected === node.key;
              return (
                <button
                  key={node.key}
                  className={'model-flow-node' + (node.trainOnly ? ' is-train-only' : '')}
                  aria-pressed={pressed}
                  aria-label={nodeName(node)}
                  disabled={isOff(node, phase)}
                  data-node={node.key}
                  onClick={() => select(pressed ? null : node.key)}
                >
                  {nodeName(node)}
                  {showAdded && node.added && <i className="flow-added" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {open === group && panel}
    </div>
  );
  return (
    <div className="model-flow" role="group" aria-label="模型结构">
      {flows[architecture].map((step) =>
        'parallel' in step ? (
          <div key={step.key} className="model-flow-parallel">
            {step.parallel.map(renderGroup)}
          </div>
        ) : (
          renderGroup(step)
        ),
      )}
      {!open && panel}
    </div>
  );
}

export function ModulePanel({
  architecture,
  phase,
  selected,
  select,
  context,
}: Selection & { context: { window: number; features: number } }) {
  const node = selected
    ? figureNodes(architecture, phase).find((value) => value.key === selected)
    : undefined;
  if (!node) {
    const design = designRows[architecture];
    return (
      <section className="model-panel" aria-label="设计思路">
        <div className="model-panel-body" key={architecture}>
          <h3>设计思路</h3>
          <p className="model-lead">{design.lead}</p>
          <ol className="design-rows">
            {design.rows.map((row) => {
              const target = figureNodes(architecture, phase).find((n) => n.key === row.node);
              const off = !target || isOff(target, phase);
              return (
                <li key={row.design}>
                  <button disabled={off} onClick={() => select(row.node)}>
                    <span className="design-problem">{row.problem}</span>
                    <span className="design-answer">
                      <strong>{row.design}</strong>
                      <span>{row.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  }
  const text = moduleText(node.module, architecture, context);
  return (
    <section className="model-panel" aria-label={text.title}>
      <div className="model-panel-body" key={node.key + architecture}>
        <div className="model-panel-heading">
          <h3>{text.title}</h3>
          <button className="text-button" onClick={() => select(null)}>
            返回设计思路
          </button>
        </div>
        <div className={'model-panel-grid' + (text.visual ? ' has-visual' : '')}>
          <div className="model-panel-text">
            <p>{text.role}</p>
            {text.formulas?.map((formula, i) => (
              <FormulaLine key={i} formula={formula} />
            ))}
          </div>
          {text.visual && (
            <div className="model-panel-visual">
              <ModelVisual visual={text.visual} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
