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
  const point = data.features[feature];
  const normalizationRef = useRef<HTMLDivElement>(null),
    [normalizationVisible, setNormalizationVisible] = useState(false);
  const [sample, setSample] = useState(0);
  const { train } = data.datasets;
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
    const { min, max, normalize } = trainingScale(trainAsset.data);
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
  }, [trainAsset.data, train.shape]);
  const sampleIndex = sample;
  const split = cleaning.split;
  const operand = (value: number) =>
    value < 0 ? `(−${number(Math.abs(value), 4)})` : number(value, 4);
  return (
    <div className="chapter-refined data-chapter">
      <Heading title="监测数据预处理">筛选有效记录，完成缺失填补、数据划分与归一化。</Heading>
      <div className="data-ledger" aria-label="数据规模">
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
        <div>
          <span>
            训练集
            <Footnote note="data-split" reference="ref-data-training-count" />
          </span>
          <strong>{number(split.trainCount, 0)}</strong>
          <small>前 70%</small>
        </div>
        <div>
          <span>
            测试集
            <Footnote note="data-split" reference="ref-data-test-count" />
          </span>
          <strong>{number(split.testCount, 0)}</strong>
          <small>后 30%</small>
        </div>
      </div>
      <div className="data-page-intro">
        <span>
          原始数据与处理例子
          <Footnote note="data-records" />
        </span>
      </div>

      <Section
        title={
          <>
            无效记录与缺失值处理
            <Footnote note="data-source" />
          </>
        }
      >
        <DataCleaning data={data} />
      </Section>

      <Section
        title={
          <>
            训练集与测试集划分
            <Footnote note="data-split" />
          </>
        }
      >
        <p className="reading-copy">按时间顺序取前 70% 为训练集，后 30% 为测试集。</p>
        <div className="balanced-split">
          {(
            [
              ['01 / 训练集', '70%', split.trainCount, split.trainStart, split.trainEnd],
              ['02 / 测试集', '30%', split.testCount, split.testStart, split.testEnd],
            ] as const
          ).map(([title, ratio, total, begin, end]) => (
            <div key={title}>
              <span>
                {title}
                <span className="split-ratio">{ratio}</span>
              </span>
              <strong>
                {number(total, 0)}
                <small> 个时刻</small>
              </strong>
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
              各测点使用训练集的最小值和最大值归一化；测试集沿用训练参数，越界值截断到0—1。
            </p>
            <FeaturePicker
              features={data.features}
              value={point.index}
              onChange={setFeature}
              name="归一化测点"
            />
          </div>
          {norm ? (
            <>
              <div className="normalization-facts">
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
                  <strong className="sample-time">{train.times[norm.start + sampleIndex]}</strong>
                </div>
              </div>
              <div className="normalization-plots">
                <Curve
                  title="原始单位"
                  lines={[{ name: featureName(point), values: norm.values, color: colors.input }]}
                  times={train.times.slice(norm.start, norm.start + displaySettings.playbackPoints)}
                  selected={sampleIndex}
                  range={chartRange(norm.values)}
                  height={205}
                  onSelect={setSample}
                />
                <Curve
                  title="归一化后"
                  lines={[
                    { name: featureName(point), values: norm.normalized, color: colors.recon },
                  ]}
                  times={train.times.slice(norm.start, norm.start + displaySettings.playbackPoints)}
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
          ) : trainAsset.error ? (
            <div className="chapter-loading" role="alert">
              <p>{trainAsset.error}</p>
              <button onClick={trainAsset.retry}>重新读取训练样本</button>
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
