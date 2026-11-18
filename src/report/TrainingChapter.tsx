import { displaySettings } from '../dataGeometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Journey, type Model, trainingScale } from '../journey';
import { Heading, Section, ModelSelect, colors } from './ReportUI';
import Curve from './Curve';
import { Footnote } from './notes';
import { useCurveData } from './useCurveData';
import FeaturePicker from './FeaturePicker';
import { featureName } from './featureNames';
import { useTrainingTimes } from './useTrainingTimes';
import { modelName } from './modelNames';
import { usePresentationState } from './usePresentationState';
import { chapterContent } from './navigation';

type TrainingProps = {
  data: Journey;
  model: Model;
  setModel: (value: string) => void;
  feature: number;
  setFeature: (value: number) => void;
};
export function TrainingChapter({ data, model, setModel, feature, setFeature }: TrainingProps) {
  const [windowStart, setWindowStart] = usePresentationState(
      'training:window',
      Math.min(5299, Math.max(0, data.datasets.train.shape[0] - data.window)),
    ),
    [epoch, setEpoch] = usePresentationState('training:epoch', 0);
  const chartPanel = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1100);
  useEffect(() => {
    if (!chartPanel.current) return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width));
    observer.observe(chartPanel.current);
    return () => observer.disconnect();
  }, []);

  const point = data.features[feature],
    train = data.datasets.train,
    normalized = data.datasets.normalizedTrain;
  const trainingAsset = useCurveData(normalized ?? train, train.keys.indexOf(point.key)),
    training = trainingAsset.data,
    timeline = useTrainingTimes(data),
    times = timeline.data,
    error = trainingAsset.error || timeline.error;
  const stats = useMemo(
    () => (training ? trainingScale(training, data.normalization?.epsilon) : null),
    [training, data.normalization?.epsilon],
  );
  const length = train.shape[0],
    lastStart = length - data.window,
    start = Math.min(windowStart, lastStart),
    contextLength = Math.min(
      length,
      Math.max(
        data.window,
        chartWidth < 480 ? Math.ceil(data.window * 1.5) : displaySettings.trainingPoints,
      ),
    ),
    contextStart = Math.max(
      0,
      Math.min(start - Math.floor((contextLength - data.window) / 2), length - contextLength),
    );
  const values =
    training && stats
      ? Array.from({ length: contextLength }, (_, i) => {
          const value = training[contextStart + i];
          return normalized ? value : stats.normalize(value);
        })
      : [];
  const activeEpoch = Math.min(epoch, model.history.length - 1),
    record = model.history[activeEpoch];
  return (
    <div className="training-chapter">
      <Heading title={chapterContent.training.title} />
      <Section
        title={
          <>
            训练数据窗口
            <Footnote note="window-settings" />
          </>
        }
      >
        <div className="training-window-header">
          <FeaturePicker
            features={data.features}
            value={point.index}
            onChange={setFeature}
            name="训练测点"
          />
          {training && times && (
            <span>
              {times[start]} — {times[start + data.window - 1]}
            </span>
          )}
        </div>
        <div className="chapter-chart-panel" ref={chartPanel}>
          {error ? (
            <div className="chapter-loading" role="alert">
              <p>{error}</p>
              <button
                onClick={() => {
                  trainingAsset.retry();
                  timeline.retry();
                }}
              >
                重新读取
              </button>
            </div>
          ) : training && stats && times ? (
            <>
              <Curve
                title="归一化训练数据"
                selectionLabel={`选定窗口，${data.window} 点`}
                lines={[{ name: featureName(point), values, color: colors.input }]}
                times={times.slice(contextStart, contextStart + contextLength)}
                selection={{
                  start: start - contextStart,
                  end: start - contextStart + data.window - 1,
                }}
                height={260}
              />
              <label className="slider-label">
                移动窗口
                <input
                  aria-label="训练窗口位置"
                  type="range"
                  min="0"
                  max={lastStart}
                  value={start}
                  onChange={(e) => setWindowStart(+e.target.value)}
                />
                <span>
                  {(start + 1).toLocaleString('en-US')}—
                  {(start + data.window).toLocaleString('en-US')}
                </span>
              </label>
              <div className="window-position-actions">
                <button onClick={() => setWindowStart(0)} disabled={start === 0}>
                  首个窗口
                </button>
                <button
                  onClick={() => setWindowStart((value) => Math.max(0, value - 1))}
                  disabled={start === 0}
                >
                  前移 1 点
                </button>
                <button
                  onClick={() => setWindowStart((value) => Math.min(lastStart, value + 1))}
                  disabled={start === lastStart}
                >
                  后移 1 点
                </button>
                <button onClick={() => setWindowStart(lastStart)} disabled={start === lastStart}>
                  末个窗口
                </button>
              </div>
            </>
          ) : (
            <p className="chapter-loading" role="status">
              正在读取真实训练数据…
            </p>
          )}
        </div>
        <div className="window-rules facts">
          <div>
            <span>训练集时刻</span>
            <strong>{length.toLocaleString('zh-CN')}</strong>
          </div>
          <div>
            <span>窗口形状（时刻 × 测点）</span>
            <strong>
              {data.window} × {data.features.length}
            </strong>
          </div>
          <div>
            <span>完整窗口数</span>
            <strong>{(lastStart + 1).toLocaleString('zh-CN')}</strong>
            <small>步长 1</small>
          </div>
        </div>
      </Section>
      <Section
        title={
          <>
            训练重建误差与学习率
            <Footnote note="training-mse" reference="ref-training-mse-section" />
          </>
        }
      >
        <div className="model-selection-row">
          <ModelSelect
            data={data}
            value={model.id}
            onChange={(value) => {
              setModel(value);
              setEpoch(0);
            }}
          />
        </div>
        <div className="chapter-chart-panel">
          <Curve
            axisUnit="轮"
            title="训练重建误差（MSE）"
            legend={false}
            lines={[
              {
                name: modelName(model),
                values: model.history.map((item) => item.loss),
                color: colors.input,
              },
            ]}
            selected={activeEpoch}
            height={245}
            onSelect={setEpoch}
          />
          <label className="slider-label">
            轮次
            <input
              aria-label="训练轮次"
              type="range"
              min="0"
              max={model.history.length - 1}
              value={activeEpoch}
              onChange={(e) => setEpoch(+e.target.value)}
            />
            <span>
              {record.epoch} / {model.history.length}
            </span>
          </label>
        </div>
        <div className="training-metrics facts">
          <div>
            <span>当前轮次 MSE</span>
            <strong>{record.loss.toFixed(5)}</strong>
          </div>
          <div>
            <span>当前学习率</span>
            <strong>{record.lr.toExponential(2)}</strong>
          </div>
        </div>
      </Section>
    </div>
  );
}
