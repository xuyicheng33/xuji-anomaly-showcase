import { useRef } from 'react';
import { figures, type Architecture } from './modelArchitecture';

/**
 * Opens the report figure at full size. On wide screens it is a small corner button over the
 * interactive figure; on narrow screens the whole figure is the button.
 */
export function FigureZoom({
  architecture,
  variant,
}: {
  architecture: Architecture;
  variant: 'corner' | 'overview';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const figure = figures[architecture];
  return (
    <>
      {variant === 'corner' ? (
        <button
          type="button"
          className="figure-zoom"
          onClick={() => dialog.current?.showModal()}
          aria-label={`放大查看报告${figure.number}`}
          title="放大查看"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="figure-overview"
          onClick={() => dialog.current?.showModal()}
          aria-label={`放大查看报告${figure.number}`}
        >
          <img src={figure.src} alt="" width={figure.width} height={figure.height} />
        </button>
      )}
      <dialog
        ref={dialog}
        className="report-figure-dialog"
        aria-label={`报告${figure.number}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <figure>
          <img src={figure.src} alt={`报告${figure.number}：${figure.caption}`} />
          <figcaption>
            <span>
              {figure.number}
              <span className="report-figure-caption">{figure.caption}</span>
            </span>
            <button className="text-button" onClick={() => dialog.current?.close()}>
              关闭
            </button>
          </figcaption>
        </figure>
      </dialog>
    </>
  );
}
