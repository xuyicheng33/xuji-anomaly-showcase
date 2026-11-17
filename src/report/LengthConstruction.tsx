import { useState, type CSSProperties } from 'react';
import { Footnote } from './notes';

/** The eight source samples are mapped onto existing destination positions. */
export default function LengthConstruction({
  values,
  insertion,
  begin,
  end,
  length,
  scale,
}: {
  values: number[];
  insertion: 'replace' | 'blend';
  begin: number;
  end: number;
  length: number;
  scale: number;
}) {
  const [sample, setSample] = useState(0);
  return (
    <section
      className="length-construction"
      aria-labelledby="length-title"
      style={
        { '--source-count': values.length, '--destination-count': end - begin } as CSSProperties
      }
    >
      <h3 id="length-title">
        采样与写入位置
        <Footnote note="length-sampling" />
      </h3>
      <p>
        取第 {begin + 1}—{begin + values.length} 点的 {values.length} 个值，每个值重复 {scale}{' '}
        次，得到 {end - begin} 点素材，写入第 {begin + 1}—{end} 点。
      </p>
      <div className="length-sampling">
        <div className="length-row-label">
          <span>
            来源：第 {begin + 1}—{begin + values.length} 点
          </span>
          <span>{values.length} 个值</span>
        </div>
        <div className="length-source">
          {values.map((v, i) => (
            <button
              key={i}
              aria-label={`查看来源第 ${begin + 1 + i} 点`}
              aria-pressed={sample === i}
              onClick={() => setSample(i)}
            >
              <strong>{String.fromCharCode(65 + i)}</strong>
              <span>{v.toFixed(3)}</span>
            </button>
          ))}
        </div>
        <div className="length-repeat">
          每点重复 {scale} 次 <span aria-hidden="true">↓</span>
        </div>
        <div
          className="length-destination"
          aria-label={`${values.length} 个值重复为 ${end - begin} 个值`}
        >
          {Array.from({ length: end - begin }, (_, i) => (
            <button
              key={i}
              aria-label={`素材第 ${i + 1} 点来自 ${String.fromCharCode(65 + Math.floor(i / scale))}`}
              aria-pressed={sample === Math.floor(i / scale)}
              onClick={() => setSample(Math.floor(i / scale))}
            >
              {String.fromCharCode(65 + Math.floor(i / scale))}
            </button>
          ))}
        </div>
        <p className="length-mapping" aria-live="polite">
          {String.fromCharCode(65 + sample)} = {values[sample]?.toFixed(4)}，对应写入第{' '}
          {begin + 1 + sample * scale}—{begin + (sample + 1) * scale} 点。
        </p>
      </div>
      <div className="length-window" aria-label={`${length} 点窗口的写入范围`}>
        <span>
          第 1—{begin} 点
          <br />
          <strong>保留原值</strong>
        </span>
        <span>
          第 {begin + 1}—{end} 点
          <br />
          <strong>
            {insertion === 'replace'
              ? `覆盖原来的 ${end - begin} 个值`
              : `与原来的 ${end - begin} 个值混合`}
          </strong>
        </span>
        <span>
          第 {end + 1}—{length} 点
          <br />
          <strong>保留原值</strong>
        </span>
      </div>
      <p className="length-total">写入后，窗口长度为 {length} 点。</p>
    </section>
  );
}
