import { SelectionIndicator } from './ReportUI';
import { useId } from 'react';
import { usePresentationState } from './usePresentationState';
import TableScrollHint from './TableScrollHint';
import type { Journey } from '../journey';
import cleaning from './cleaning-data.json';
import InfoTip from './InfoTip';

const count = (n: number) => n.toLocaleString('zh-CN');
export function MissingExample({ data, example }: { data: Journey; example: number }) {
  const hint = useId();
  const sample = cleaning.missingExamples[example],
    point = data.features[sample.feature];
  return (
    <div className="missing-example" key={sample.key}>
      <div className="missing-context">
        <strong>{point.label}</strong>
        <code>{point.key}</code>
        <span>{sample.rows[0].time.slice(0, 10)}</span>
      </div>
      <div className="missing-comparison-hint">
        <TableScrollHint id={hint}>左右滑动查看处理前后。</TableScrollHint>
      </div>
      <div
        className="reference-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="缺失值填零前后对照，可左右滚动"
        aria-describedby={hint}
      >
        <table aria-label="缺失值填零前后对照">
          <thead>
            <tr>
              <th scope="col">时间</th>
              <th scope="col">处理前</th>
              <th scope="col">处理后</th>
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row) => (
              <tr key={row.time} className={row.before === null ? 'filled-row' : undefined}>
                <th scope="row">{row.time.slice(11)}</th>
                <td>
                  {row.before === null ? (
                    <span className="missing-value">缺失</span>
                  ) : (
                    row.before.toFixed(4)
                  )}
                </td>
                <td>
                  {row.before === null ? (
                    <strong className="filled-value">
                      0<span>已填补</span>
                    </strong>
                  ) : (
                    row.after.toFixed(4)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default function DataCleaning({ data }: { data: Journey }) {
  const [trimmed, setTrimmed] = usePresentationState('data:trimmed', false),
    [example, setExample] = usePresentationState('data:missing', 0);
  const blocks = cleaning.invalidBlocks;
  const spans = [
    { count: blocks[0].start, invalid: false },
    { count: blocks[0].count, invalid: true },
    { count: blocks[1].start - blocks[0].end, invalid: false },
    { count: blocks[1].count, invalid: true },
  ];
  return (
    <div className="cleaning-steps">
      <article className="cleaning-step">
        <div className="cleaning-intro">
          <h3>剔除 11 个全缺失测点</h3>
          <div className="cleaning-count">
            <strong>136</strong>
            <span aria-hidden="true">→</span>
            <strong>125</strong>
            <small>个测点</small>
          </div>
          <details className="removed-sensors">
            <summary>全缺失测点清单</summary>
            <ul>
              {cleaning.removedSensors.map((key) => (
                <li key={key}>
                  <code>{key}</code>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </article>
      <article className="cleaning-step record-cleaning">
        <div className="cleaning-intro">
          <h3>
            剔除 768 条无效记录
            <InfoTip label="无效记录处理说明">
              两段记录的时间与测点值全部缺失，删除对应行，保留其余记录的时间顺序。
            </InfoTip>
          </h3>
        </div>
        <div className="record-trimming">
          <div className="cleaning-caption trim-result" aria-live="polite">
            <span>{trimmed ? '整理后记录' : '原始记录'}</span>
            <strong>{trimmed ? '7,992' : '8,760'} 条</strong>
          </div>
          <div
            id="trimmed-records"
            className={'record-strip result-strip' + (trimmed ? ' is-trimmed' : '')}
            role="img"
            aria-label={
              trimmed
                ? '整理后保留 7992 条有效记录，5 月 24 日的时间缺口保留'
                : '原始记录依次为 3432 条有效、24 条无效、4560 条有效、744 条无效'
            }
          >
            {spans.map((span, i) => (
              <div
                key={i}
                className={span.invalid ? 'invalid' : 'valid'}
                style={{ flexGrow: span.invalid && trimmed ? 0 : span.count }}
              >
                <span>{i === 1 ? '' : count(span.count)}</span>
              </div>
            ))}
          </div>
          <div className="invalid-intervals">
            <div>
              <span>中间 24 条</span>
              <strong>第 3,433—3,456 条</strong>
              <p>05-23 23:00 与 05-25 00:00 之间</p>
            </div>
            <div>
              <span>末尾 744 条</span>
              <strong>第 8,017—8,760 条</strong>
              <p>11-30 23:00 之后，无时间记录</p>
            </div>
          </div>
          <div className="trim-action">
            <button
              onClick={() => setTrimmed((value) => !value)}
              aria-pressed={trimmed}
              aria-controls="trimmed-records"
            >
              {trimmed ? '还原无效记录' : '剔除无效记录'}
            </button>
          </div>
        </div>
      </article>
      <article className="cleaning-step missing-cleaning">
        <div className="cleaning-intro">
          <h3>170 个缺失值填 0</h3>
          <p>13 个测点的零散缺失填为 0，其余观测值保留。</p>
          <div className="segmented missing-switch" aria-label="缺失片段">
            <SelectionIndicator />
            {cleaning.missingExamples.map((entry, i) => (
              <button key={entry.key} aria-pressed={example === i} onClick={() => setExample(i)}>
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <MissingExample data={data} example={example} />
      </article>
    </div>
  );
}
