import { Fragment, type ReactNode } from 'react';
import type { Formula } from './modelArchitecture';
import Fraction from './Fraction';

type Part = { text: string; level: 'base' | 'sub' | 'sup' };

/** Mini markup: `x_k`, `x_{k,c}`, `W^{(t)}` for sub- and superscripts. */
export function mathParts(source: string): Part[] {
  const parts: Part[] = [];
  let base = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char !== '_' && char !== '^') {
      base += char;
      continue;
    }
    let text: string;
    if (source[i + 1] === '{') {
      const end = source.indexOf('}', i + 2);
      text = source.slice(i + 2, end);
      i = end;
    } else {
      const [next] = Array.from(source.slice(i + 1));
      text = next;
      i += next.length;
    }
    if (base) parts.push({ text: base, level: 'base' });
    base = '';
    parts.push({ text, level: char === '_' ? 'sub' : 'sup' });
  }
  if (base) parts.push({ text: base, level: 'base' });
  return parts;
}

/** Renders the mini markup; a Σ followed by limits sets them above and below the operator. */
export function MathText({ source }: { source: string }) {
  const parts = mathParts(source);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.level === 'base' && part.text.endsWith('Σ') && parts[i + 1]?.level === 'sub') {
      const lower = parts[i + 1].text,
        upper = parts[i + 2]?.level === 'sup' ? parts[i + 2].text : '';
      if (part.text.length > 1)
        nodes.push(<Fragment key={i + 'b'}>{part.text.slice(0, -1)}</Fragment>);
      nodes.push(
        <span key={i} className="math-op">
          <span className="math-limit">{upper || '\u00a0'}</span>
          <span className="math-op-symbol">Σ</span>
          <span className="math-limit">{lower}</span>
        </span>,
      );
      i += upper ? 2 : 1;
      continue;
    }
    nodes.push(
      part.level === 'sub' ? (
        <sub key={i}>{part.text}</sub>
      ) : part.level === 'sup' ? (
        <sup key={i}>{part.text}</sup>
      ) : (
        <Fragment key={i}>{part.text}</Fragment>
      ),
    );
  }
  return <>{nodes}</>;
}

export type EquationRow = { lhs?: ReactNode; expr: ReactNode; result?: ReactNode };

/**
 * A displayed equation: centred, one row per step, equals signs aligned.
 * `math` sets symbols in the math face; numeric substitutions keep the metric face.
 */
export function Equation({
  rows,
  label,
  className = '',
  math = false,
}: {
  rows: EquationRow[];
  label?: string;
  className?: string;
  math?: boolean;
}) {
  return (
    <div
      className={'equation' + (math ? ' is-math' : '') + (className ? ' ' + className : '')}
      role={label ? 'group' : undefined}
      aria-label={label}
    >
      {rows.map((row, i) => (
        <div key={i} className="equation-row">
          <span className="equation-lhs">{row.lhs}</span>
          <span className="equation-sign">{row.lhs !== undefined || i > 0 ? '=' : ''}</span>
          <span className="equation-expr">{row.expr}</span>
          {row.result !== undefined && (
            <span className="equation-result">
              <span>=</span>
              <strong>{row.result}</strong>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** A formula from the model texts, displayed as an equation. */
export function FormulaLine({ formula }: { formula: Formula }) {
  if (typeof formula === 'string') {
    const at = formula.indexOf(' = ');
    return (
      <Equation
        math
        className="model-formula"
        rows={[
          at < 0
            ? { expr: <MathText source={formula} /> }
            : {
                lhs: <MathText source={formula.slice(0, at)} />,
                expr: <MathText source={formula.slice(at + 3)} />,
              },
        ]}
      />
    );
  }
  return (
    <Equation
      math
      className="model-formula"
      rows={[
        {
          lhs: <MathText source={formula.lhs.replace(/\s*=\s*$/, '')} />,
          expr: (
            <>
              <Fraction
                numerator={<MathText source={formula.num} />}
                denominator={<MathText source={formula.den} />}
              />
              {formula.rhs && <MathText source={' ' + formula.rhs} />}
            </>
          ),
        },
      ]}
    />
  );
}

/** The same markup inside SVG, using relative shifts so every renderer agrees. */
export function SvgMath({
  source,
  x,
  y,
  anchor = 'middle',
  className,
}: {
  source: string;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  className?: string;
}) {
  const shift = { base: 0, sub: 4, sup: -6 };
  let level: Part['level'] = 'base';
  return (
    <text x={x} y={y} textAnchor={anchor} className={className}>
      {mathParts(source).map((part, i) => {
        const dy = shift[part.level] - shift[level];
        level = part.level;
        return (
          <tspan
            key={i}
            dy={dy || undefined}
            className={part.level === 'base' ? undefined : 'small'}
          >
            {part.text}
          </tspan>
        );
      })}
    </text>
  );
}
