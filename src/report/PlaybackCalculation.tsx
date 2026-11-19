import { coveringWindows } from '../dataGeometry';
import type { Journey, Model } from '../journey';
import { Footnote } from './notes';
import Fraction from './Fraction';
import { presentationMemory } from './presentationMemory';

const decimal = (value: number) => value.toFixed(9);

/** The current point's score; its full calculation lives on the score page. */
export function PlaybackCalculation({
  data,
  model,
  index,
  pause,
}: {
  data: Journey;
  model: Model;
  index: number | null;
  pause: () => void;
}) {
  const starts = index === null ? [] : coveringWindows(index, data.times.length, data.window);
  const score = index === null ? null : model.scores[index];
  return (
    <section className="playback-calculation">
      <div className="aggregation-summary">
        <div>
          <h2>
            当前时刻分数
            <Footnote note="window-aggregation" />
          </h2>
          {index !== null && (
            <p>
              第 {index + 1} 点，
              <span className="window-scope">{starts.length} 个窗口取平均</span>
            </p>
          )}
        </div>
        <div className="aggregation-formula" data-testid="aggregate-equation">
          {score !== null && index !== null && (
            <>
              <Fraction numerator={decimal(score * starts.length)} denominator={starts.length} />
              <span className="equation-result">
                <b>=</b>
                <strong>{decimal(score)}</strong>
              </span>
            </>
          )}
        </div>
        {index !== null && (
          <a
            className="inline-link"
            href="#/detection"
            onClick={() => {
              pause();
              presentationMemory.detectionTarget = index;
            }}
          >
            计算过程 →
          </a>
        )}
      </div>
    </section>
  );
}
