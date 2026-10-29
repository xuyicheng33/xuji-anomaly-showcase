import type { ReactNode } from 'react';
import './fraction.css';

export default function Fraction({
  numerator,
  denominator,
}: {
  numerator: ReactNode;
  denominator: ReactNode;
}) {
  return (
    <span className="math-fraction">
      <span>{numerator}</span>
      <span>{denominator}</span>
    </span>
  );
}
