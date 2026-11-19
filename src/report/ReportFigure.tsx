import { useRef } from 'react';
import figure41 from './figures/report-figure-4-1.png';
import figure43 from './figures/report-figure-4-3.png';
import type { Architecture } from './modelArchitecture';

const figures: Record<Architecture, { src: string; number: string; caption: string }> = {
  stam: {
    src: figure41,
    number: '图 4-1',
    caption: '基于自适应掩码和有界异常损失的自监督 TCN-Transformer 异常检测框架',
  },
  smst: {
    src: figure43,
    number: '图 4-3',
    caption: '多尺度时空依赖建模的自监督 TCN-Transformer 异常检测框架',
  },
};

/** The report's original figure, kept small beside the redrawn one and opened full size on demand. */
export function ReportFigure({ architecture }: { architecture: Architecture }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const figure = figures[architecture];
  return (
    <>
      <button
        className="report-figure-thumb"
        onClick={() => dialog.current?.showModal()}
        aria-label={`查看报告${figure.number}原图`}
      >
        <img src={figure.src} alt="" />
        <span>报告{figure.number}</span>
      </button>
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
