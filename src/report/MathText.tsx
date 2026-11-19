import { Fragment } from 'react';
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

export function MathText({ source }: { source: string }) {
  return (
    <>
      {mathParts(source).map((part, i) =>
        part.level === 'sub' ? (
          <sub key={i}>{part.text}</sub>
        ) : part.level === 'sup' ? (
          <sup key={i}>{part.text}</sup>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

export function FormulaLine({ formula }: { formula: Formula }) {
  if (typeof formula === 'string')
    return (
      <p className="model-formula">
        <span>
          <MathText source={formula} />
        </span>
      </p>
    );
  return (
    <p className="model-formula">
      <span>
        <MathText source={formula.lhs} />
      </span>
      <Fraction
        numerator={<MathText source={formula.num} />}
        denominator={<MathText source={formula.den} />}
      />
      {formula.rhs && (
        <span>
          <MathText source={formula.rhs} />
        </span>
      )}
    </p>
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
