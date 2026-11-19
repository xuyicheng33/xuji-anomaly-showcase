import { useId, type KeyboardEvent, type ReactNode } from 'react';
import {
  designRows,
  figures,
  flows,
  moduleText,
  type Architecture,
  type FigureNode,
  type Phase,
} from './modelArchitecture';
import { FormulaLine, SvgMath } from './MathText';
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

const nodeName = (node: FigureNode) => node.lines.join('').replace('⊕', '特征拼接');
const isOff = (node: FigureNode, phase: Phase) => phase === 'test' && !!node.trainOnly;

function pressKeys(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function NodeGlyph({ node }: { node: FigureNode }) {
  const { w, h } = node;
  if (node.shape === 'series')
    return (
      <g className="fig-glyph">
        {[
          'M12 46 C24 30 32 54 46 40 S70 22 92 36',
          'M12 32 C26 48 38 20 52 30 S76 46 92 26',
          'M12 54 C28 50 40 58 56 50 S80 56 92 48',
        ].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    );
  if (node.shape === 'insert') {
    const frame = (w - 24) / 4;
    return (
      <g className="fig-glyph">
        <rect x="12" y="34" width={w - 24} height="44" className="fig-glyph-frame" />
        {[1, 2, 3].map((i) => (
          <path key={i} d={`M${12 + frame * i} 34 V78`} className="fig-glyph-frame" />
        ))}
        <rect
          x={12 + frame + 6}
          y="35"
          width={frame - 12}
          height="42"
          className="fig-glyph-anomaly"
        />
        <path d={`M14 62 C30 46 44 70 60 56 S96 40 ${w - 14} 58`} />
      </g>
    );
  }
  if (node.shape === 'stack')
    return (
      <g className="fig-stack">
        {[2, 1, 0].map((k) => (
          <g key={k} transform={`translate(${24 + k * 10} ${40 + k * 8})`}>
            <rect width={w - 76} height="56" rx="8" className="fig-stack-card" />
            {k === 0 && (
              <>
                <rect x="14" y="12" width="120" height="32" rx="6" className="fig-stack-item" />
                <text x="74" y="33" textAnchor="middle">
                  Local TCN
                </text>
                <path d="M134 28 H170" className="fig-stack-link" />
                <rect x="170" y="12" width="168" height="32" rx="6" className="fig-stack-item" />
                <text x="254" y="33" textAnchor="middle">
                  Transformer Encoder
                </text>
              </>
            )}
          </g>
        ))}
      </g>
    );
  void h;
  return null;
}

function NodeText({ node }: { node: FigureNode }) {
  const { w, h } = node;
  if (node.shape === 'concat')
    return <path className="fig-concat-cross" d={`M${w / 2} 7 V${h - 7} M7 ${h / 2} H${w - 7}`} />;
  if (node.shape === 'series' || node.shape === 'insert')
    return (
      <text x={w / 2} y={h - 14} textAnchor="middle" className="fig-title">
        {node.lines[0]}
      </text>
    );
  if (node.shape === 'stack')
    return (
      <text x={w / 2} y={26} textAnchor="middle" className="fig-title">
        {node.lines[0]}
      </text>
    );
  if (node.shape === 'formula')
    return (
      <>
        <text x={w / 2} y={24} textAnchor="middle" className="fig-title">
          {node.lines[0]}
        </text>
        {node.formula && <SvgMath source={node.formula} x={w / 2} y={54} className="fig-math" />}
        {node.fraction && (
          <>
            <SvgMath source={node.fraction[0]} x={86} y={62} anchor="end" className="fig-math" />
            <SvgMath source={node.fraction[1]} x={(w + 92) / 2} y={50} className="fig-math" />
            <path className="fig-fraction" d={`M96 56 H${w - 10}`} />
            <SvgMath source={node.fraction[2]} x={(w + 92) / 2} y={74} className="fig-math" />
          </>
        )}
      </>
    );
  const lineHeight = 18,
    first = h / 2 - ((node.lines.length - 1) * lineHeight) / 2 + 5;
  return (
    <text textAnchor="middle" className="fig-label">
      {node.lines.map((text, i) => (
        <tspan key={text} x={w / 2} y={first + i * lineHeight}>
          {text}
        </tspan>
      ))}
    </text>
  );
}

function FigureNodeView({
  node,
  phase,
  selected,
  select,
  hidden = false,
  added,
}: {
  node: FigureNode;
  phase: Phase;
  selected: string | null;
  select: (key: string | null) => void;
  hidden?: boolean;
  added: boolean;
}) {
  const off = isOff(node, phase) || hidden;
  const pressed = selected === node.key;
  const toggle = () => select(pressed ? null : node.key);
  return (
    <g
      className={
        'fig-node' +
        (node.tone ? ' is-' + node.tone : '') +
        (node.shape ? ' shape-' + node.shape : '') +
        (pressed ? ' is-selected' : '') +
        (isOff(node, phase) ? ' is-off' : '') +
        (hidden ? ' is-hidden' : '')
      }
      transform={`translate(${node.x} ${node.y})`}
      role="button"
      tabIndex={off ? -1 : 0}
      aria-pressed={pressed}
      aria-disabled={off || undefined}
      aria-hidden={hidden || undefined}
      aria-label={nodeName(node)}
      data-node={node.key}
      onClick={off ? undefined : toggle}
      onKeyDown={off ? undefined : (event) => pressKeys(event, toggle)}
    >
      {node.shape === 'concat' ? (
        <circle className="fig-box" cx={node.w / 2} cy={node.h / 2} r={node.w / 2} />
      ) : (
        <rect className="fig-box" width={node.w} height={node.h} rx="8" />
      )}
      <NodeGlyph node={node} />
      <NodeText node={node} />
      {added && node.added && <circle className="fig-added" cx={node.w - 9} cy="9" r="3.5" />}
    </g>
  );
}

export function ArchitectureFigure({
  architecture,
  phase,
  selected,
  select,
  showAdded,
}: Selection & { showAdded: boolean }) {
  const figure = figures[architecture];
  const arrow = useId(),
    clayArrow = useId();
  return (
    <svg
      className={'model-figure is-' + phase}
      viewBox={`0 0 ${figure.width} ${figure.height}`}
      role="group"
      aria-label="模型结构图"
    >
      <defs>
        {[
          [arrow, 'fig-arrow'],
          [clayArrow, 'fig-arrow is-clay'],
        ].map(([id, className]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path className={className} d="M0 0.5 L7 4 L0 7.5 Z" />
          </marker>
        ))}
      </defs>
      {figure.regions.map((region) => (
        <g
          key={region.key}
          className={'fig-region' + (region.added && showAdded ? ' is-added' : '')}
        >
          <rect x={region.x} y={region.y} width={region.w} height={region.h} rx="12" />
          <text x={region.labelX} y={region.labelY} textAnchor={region.anchor}>
            {region.label}
          </text>
        </g>
      ))}
      {figure.edges.map((edge) => (
        <path
          key={edge.d}
          className={'fig-edge' + (edge.tone ? ' is-' + edge.tone : '')}
          d={edge.d}
          markerEnd={edge.arrow ? `url(#${edge.tone ? clayArrow : arrow})` : undefined}
        />
      ))}
      {figure.texts.map((text) => (
        <text key={text.text} className="fig-note" x={text.x} y={text.y} textAnchor={text.anchor}>
          {text.text}
        </text>
      ))}
      {figure.nodes.map((node) => (
        <FigureNodeView
          key={node.key}
          node={node}
          phase={phase}
          selected={selected}
          select={select}
          hidden={node.key === 'loss' && phase === 'test'}
          added={showAdded}
        />
      ))}
      <FigureNodeView
        node={figure.end}
        phase={phase}
        selected={selected}
        select={select}
        hidden={phase === 'train'}
        added={showAdded}
      />
    </svg>
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
  const open = flows[architecture].find((group) =>
    group.nodes.some((key) => (key === 'loss' && phase === 'test' ? 'pot' : key) === selected),
  );
  return (
    <div className="model-flow" role="group" aria-label="模型结构">
      {flows[architecture].map((group) => (
        <div key={group.key} className="model-flow-step">
          <div className={'model-flow-group' + (group.added && showAdded ? ' is-added' : '')}>
            {group.label && <span className="model-flow-label">{group.label}</span>}
            <div className="model-flow-items">
              {group.nodes.map((key) => {
                const node = nodes.get(key === 'loss' && phase === 'test' ? 'pot' : key)!;
                const off = isOff(node, phase);
                const pressed = selected === node.key;
                return (
                  <button
                    key={node.key}
                    className={
                      'model-flow-node' +
                      (node.tone ? ' is-' + node.tone : '') +
                      (node.shape === 'concat' ? ' is-concat' : '')
                    }
                    aria-pressed={pressed}
                    aria-label={nodeName(node)}
                    disabled={off}
                    data-node={node.key}
                    onClick={() => select(pressed ? null : node.key)}
                  >
                    {node.shape === 'concat' ? '拼接' : node.lines.join('')}
                    {showAdded && node.added && <i className="flow-added" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          {open === group && panel}
        </div>
      ))}
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
            {text.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
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
