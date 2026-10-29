import type { ReactNode } from 'react';

export default function TableScrollHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="reference-table-hint" id={id}>
      {children}
    </p>
  );
}
