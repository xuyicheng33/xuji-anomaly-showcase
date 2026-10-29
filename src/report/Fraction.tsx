import type { ReactNode } from 'react';

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
