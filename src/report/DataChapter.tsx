import WindSource from './WindSource';
import { displaySettings } from '../dataGeometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Journey, trainingScale } from '../journey';
import { useCurveData } from './useCurveData';
import { Heading, Section, colors } from './ReportUI';
import Curve from './Curve';
import { Footnote } from './notes';
import DataCleaning from './DataCleaning';
import Fraction from './Fraction';
import cleaning from './cleaning-data.json';
import FeaturePicker from './FeaturePicker';
import { featureName } from './featureNames';
import { useTrainingTimes } from './useTrainingTimes';
import { usePresentationState } from './usePresentationState';
import { chapterContent } from './navigation';

type Props = { data: Journey; feature: number; setFeature: (feature: number) => void };
const number = (value: number, digits = 3) =>
  value.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const chartRange = (values: number[]): [number, number] => {
  const min = Math.min(...values),
    max = Math.max(...values);
  const pad = (max - min) * 0.12 || Math.max(Math.abs(max) * 0.02, 0.1);
  return [min - pad, max + pad];
};

export default function DataChapter({ data, feature, setFeature }: Props) {
  const wind = data.dataset?.id === 'wind';
  const point = data.features[feature];
  const normalizationRef = useRef<HTMLDivElement>(null),
    [normalizationVisible, setNormalizationVisible] = useState(false);
  const [sample, setSample] = usePresentationState('data:sample', 0);
  const { train } = data.datasets;
  const timeline = useTrainingTimes(data, normalizationVisible),
    times = timeline.data;
  const trainAsset = useCurveData(
    normalizationVisible ? train : null,
    train.keys.indexOf(point.key),
  );
  useEffect(() => {
    if (!normalizationRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNormalizationVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(normalizationRef.current);
    return () => observer.disconnect();
  }, []);
  const norm = useMemo(() => {
    if (!trainAsset.data) return null;
    const { min, max, normalize } = trainingScale(trainAsset.data, data.normalization?.epsilon);
    const start = Math.min(5299, Math.max(0, train.shape[0] - displaySettings.playbackPoints));
    const values = Array.from(
      { length: Math.min(displaySettings.playbackPoints, train.shape[0] - start) },
      (_, i) => trainAsset.data![start + i],
    );
    return {
      min,
      max,
      start,
      values,
      normalized: values.map(normalize),
    };
  }, [trainAsset.data, train.shape, data.normalization?.epsilon]);
  const sampleIndex = sample;
  const split = wind
    ? {
        trainCount: data.summary.trainRows,
        testCount: data.summary.testRows,
        trainStart: data.summary.trainStart,
        trainEnd: data.summary.trainEnd,
        testStart: data.summary.testStart,
        testEnd: data.summary.testEnd,
      }
    : cleaning.split;
  const operand = (value: number) =>
    value < 0 ? `(−${number(Math.abs(value), 4)})` : number(value, 4);
  return (
    <div className="data-chapter">
      <Heading
        label={chapterContent.data.title}
        title={
          <>
            {chapterContent.data.title}
            <Footnote note="data-records" />
          </>
        }
      />
      <div className="data-ledger facts" aria-label="数据规模">
        {data.summary.rawRows === data.summary.cleanRows &&
        data.summary.rawFeatures === data.summary.features ? (
          <div>
            <span>建模记录</span>
            <strong>{number(data.summary.cleanRows, 0)}</strong>
            <small>{data.summary.features} 个测点</small>
          </div>
        ) : (
          <>
            <div>
              <span>原始记录</span>
              <strong>{number(data.summary.rawRows, 0)}</strong>
              <small>{data.summary.rawFeatures} 个测点</small>
            </div>
            <div>
              <span>整理后记录</span>
              <strong>{number(data.summary.cleanRows, 0)}</strong>
              <small>{data.summary.features} 个保留测点</small>
            </div>
          </>
        )}
        <div>
          <span>训练集</span>
          <strong>{number(split.trainCount, 0)}</strong>
          <small>前 70%</small>
        </div>
        <div>
          <span>测试集</span>
          <strong>{number(split.testCount, 0)}</strong>
          <small>后 30%</small>
        </div>
      </div>
      <Section
        title={
          <>
            {wind ? '功率与天气数据构成' : '无效记录与缺失值处理'}
            <Footnote note="data-source" />
          </>
        }
      >
        {wind ? <WindSource data={data} /> : <DataCleaning data={data} />}
      </Section>

      <Section
        title={
          <>
            训练集与测试集划分
            <Footnote note="data-split" />
          </>
        }
      >
        <div className="balanced-split">
          {(
            [
              ['训练集', '前 70%', split.trainStart, split.trainEnd],
              ['测试集', '后 30%', split.testStart, split.testEnd],
            ] as const
          ).map(([title, ratio, begin, end]) => (
            <div key={title}>
              <span>
                {title}
                <span className="split-ratio">{ratio}</span>
              </span>
              <p className="split-dates">
                <time dateTime={begin.replace(' ', 'T')}>{begin}</time>
                <span>—</span>
                <time dateTime={end.replace(' ', 'T')}>{end}</time>
              </p>
            </div>
          ))}
        </div>
      </Section>

      <div ref={normalizationRef} className="normalization-section">
        <Section
          title={
            <>
              测点数值归一化
              <Footnote note="normalization" />
            </>
          }
        >
          <div className="normalization-heading">
            <p className="reading-copy">
              {wind ? (
                <>
                  沿用训练集的最小值和最大值，分母加 0.0001，保留超出{' '}
                  <span className="nowrap">0—1</span> 的测试值。
                </>
              ) : (
                <>
                  沿用训练集的最小值和最大值，将测试值截断至 <span className="nowrap">0—1</span>。
                </>
              )}
            </p>
            <FeaturePicker
              features={data.features}
              value={point.index}
              onChange={setFeature}
              name="归一化测点"
            />
          </div>
          {norm && times ? (
            <>
              <div className="normalization-facts facts">
                <div>
                  <span>训练段最小值</span>
                  <strong>{number(norm.min, 4)}</strong>
                </div>
                <div>
                  <span>训练段最大值</span>
                  <strong>{number(norm.max, 4)}</strong>
                </div>
                <div>
                  <span>当前样本时间</span>
                  <strong className="sample-time">{times[norm.start + sampleIndex]}</strong>
                </div>
              </div>
              <div className="normalization-plots">
                <Curve
                  title="原始单位"
                  legend={false}
                  lines={[{ name: featureName(point), values: norm.values, color: colors.input }]}
                  times={times.slice(norm.start, norm.start + displaySettings.playbackPoints)}
                  selected={sampleIndex}
                  range={chartRange(norm.values)}
                  height={205}
                  onSelect={setSample}
                />
                <Curve
                  title="归一化后"
                  legend={false}
                  lines={[
                    { name: featureName(point), values: norm.normalized, color: colors.input },
                  ]}
                  times={times.slice(norm.start, norm.start + displaySettings.playbackPoints)}
                  selected={sampleIndex}
                  height={205}
                  onSelect={setSample}
                />
              </div>
              <label className="slider-label">
                选择样本
                <input
                  aria-label="归一化样本"
                  type="range"
                  min="0"
                  max={norm.values.length - 1}
                  value={sampleIndex}
                  onChange={(e) => setSample(+e.target.value)}
                />
                <span>
                  {sampleIndex + 1} / {norm.values.length}
                </span>
              </label>
              <div className="normalization-equation" aria-label="当前样本归一化计算">
                {norm.min === norm.max ? (
                  <span className="constant-equation">
                    训练段为常量 {number(norm.min, 4)}，归一化取值
                  </span>
                ) : (
                  <Fraction
                    numerator={
                      <>
                        {operand(norm.values[sampleIndex])} − {operand(norm.min)}
                      </>
                    }
                    denominator={
                      <>
                        {operand(norm.max)} − {operand(norm.min)}
                        {wind ? ' + 0.0001' : ''}
                      </>
                    }
                  />
                )}
                <span className="equation-result">
                  <span>=</span>
                  <strong>{norm.normalized[sampleIndex].toFixed(4)}</strong>
                </span>
              </div>
            </>
          ) : trainAsset.error || timeline.error ? (
            <div className="chapter-loading" role="alert">
              <p>{trainAsset.error || timeline.error}</p>
              <button
                onClick={() => {
                  trainAsset.retry();
                  timeline.retry();
                }}
              >
                重新读取训练样本
              </button>
            </div>
          ) : (
            <p className="chapter-loading" role="status">
              正在读取训练样本…
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
