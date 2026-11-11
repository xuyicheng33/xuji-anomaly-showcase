import { lazy, type ReactNode } from 'react';

/** Mount the lazy boundary immediately so code and the data request can overlap. */
export function lazyChapter<P extends object>(
  load: () => Promise<{ default: (props: P) => ReactNode }>,
) {
  return lazy(async () => {
    const { default: Chapter } = await load();
    return {
      default: function ReadyChapter({ content }: { content: P | null }) {
        return content ? (
          <Chapter {...content} />
        ) : (
          <div className="state-panel" role="status">
            正在读取研究资料…
          </div>
        );
      },
    };
  });
}
