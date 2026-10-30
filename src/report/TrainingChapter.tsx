import { useMemo, useState } from 'react';
import { type Journey, type Model, trainingScale } from '../journey';
import { Heading, Section, ModelSelect, colors } from './ReportUI';
import Curve from './Curve';
import { Footnote } from './notes';
import { useCurveData } from './useCurveData';

type TrainingProps = {
  data: Journey;
  model: Model;
  setModel: (value: string) => void;
  feature: number;
  setFeature: (value: number) => void;
};
export function TrainingChapter({ data, model, setModel, feature, setFeature }: TrainingProps) {
  const [windowStart, setWindowStart] = useState(5299),
    [epoch, setEpoch] = useState(0);

  const point = data.features[feature],
    train = data.datasets.train;
  const trainingAsset = useCurveData(train, train.keys.indexOf(point.key)),
    training = trainingAsset.data,
    error = trainingAsset.error;
  const stats = useMemo(() => (training ? trainingScale(training) : null), [training]);
  const length = train.shape[0],
    lastStart = length - 64,
    start = windowStart,
    contextLength = 192,
    contextStart = Math.max(0, Math.min(start - 64, length - contextLength));
  const values =
    training && stats
      ? Array.from({ length: contextLength }, (_, i) => {
          const value = training[contextStart + i];
          return stats.normalize(value);
        })
      : [];
  const activeEpoch = Math.min(epoch, model.history.length - 1),
    record = model.history[activeEpoch];
  return (
    <div className="chapter-refined training-chapter">
      <Heading title="模型训练过程">
        以{' '}
        <span className="note-anchor">
          64 × 125 数据窗口
          <Footnote note="window-settings" reference="ref-training-window-shape" />
        </span>
        为输入，通过重建损失优化模型参数。
      </Heading>
      <Section
        title={
          <>
            训练数据窗口
            <Footnote note="window-settings" />
          </>
        }
      >
        <div className="training-window-header">
          <label className="field">
            显示测点
            <select
              aria-label="训练测点"
              value={point.index}
              onChange={(e) => setFeature(+e.target.value)}
            >
              {data.features.map((f) => (
                <option key={f.index} value={f.index}>
                  {f.label}（{f.key}）
                </option>
              ))}
            </select>
          </label>
          <span>训练集，{length.toLocaleString('zh-CN')} 个时刻</span>
        </div>
        <div className="chapter-chart-panel">
          {error ? (
            <div className="chapter-loading" role="alert">
              <p>{error}</p>
              <button onClick={trainingAsset.retry}>重新读取</button>
            </div>
          ) : training && stats ? (
            <>
              <div className="chart-context">
                <span className="training-selection-key">
                  <i aria-hidden="true" />
                  选定窗口，64 点
                </span>
                <span>
                  {train.times[start]} — {train.times[start + 63]}
                </span>
              </div>
              <Curve
                title="归一化训练数据"
                lines={[{ name: point.label, values, color: colors.input }]}
                times={train.times.slice(contextStart, contextStart + contextLength)}
                selection={{ start: start - contextStart, end: start - contextStart + 63 }}
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
                  {start + 1}—{start + 64}
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
        <div className="window-rules">
          <div>
            <strong>64 × 125</strong>
            <span>每个窗口的输入形状</span>
          </div>
          <div>
            <strong>{(lastStart + 1).toLocaleString('zh-CN')}</strong>
            <span>步长为 1 时的完整窗口数</span>
          </div>
        </div>
      </Section>
      <Section title="参数优化流程">
        <ol className="training-steps">
          {[
            ['输入窗口', '输入数据、标签与掩码。'],
            ['序列重建', '根据当前参数生成重建结果。'],
            ['损失计算', '计算重建差异及模型约束。'],
            ['参数更新', '通过反向传播优化模型参数。'],
          ].map(([title, text], i) => (
            <li key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
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
          <p>{model.history.length} 轮训练</p>
        </div>
        <div className="chapter-chart-panel">
          <Curve
            axisUnit="轮"
            title="训练重建误差（MSE）"
            lines={[
              {
                name: model.name,
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
        <div className="training-metrics inline-facts">
          <strong>
            {record.loss.toFixed(5)}
            <span>当前轮次MSE</span>
          </strong>
          <strong>
            {record.lr.toExponential(2)}
            <span>当前学习率</span>
          </strong>
          <strong>
            {model.history.length}
            <span>训练轮次</span>
          </strong>
        </div>
      </Section>
    </div>
  );
}
