import type { RefObject } from 'react';
import { series, meanSeries, type Journey } from '../journey';
import type { AnomalyCase, CaseArrays, CaseModel } from '../anomalyCases';
import Curve from './Curve';
import { Confusion, Rates, colors, ModelSelect, ResultSummary } from './ReportUI';
import type { useDataAsset } from './useDataAsset';

export default function AnomalyResult({
  data,
  selected,
  cm,
  arrays,
  reconstruction,
  feature,
  point,
  after,
  labels,
  setPoint,
  resultRef,
  setModel,
}: {
  data: Journey;
  selected: AnomalyCase;
  cm: CaseModel;
  arrays: CaseArrays;
  reconstruction: ReturnType<typeof useDataAsset>;
  feature: number;
  point: number;
  after: number[];
  labels: number[];
  setPoint: (n: number) => void;
  resultRef: RefObject<HTMLDivElement | null>;
  setModel: (id: string) => void;
}) {
  return (
    <div className="case-detection result-reveal" ref={resultRef} data-testid="case-detection">
      <div className="case-result-heading">
        <h2>案例检测结果</h2>
        <ModelSelect data={data} value={cm.id} onChange={setModel} />
      </div>
      <ResultSummary metrics={cm.metrics} scope={`案例窗口 ${selected.times.length} 个时刻`} />
      <div className="case-reconstruction" aria-busy={!reconstruction.data}>
        <Curve
          title="插入结果与重建"
          lines={[
            { name: '插入结果', values: after, color: colors.input },
            ...(reconstruction.data
              ? [
                  {
                    name: '模型重建',
                    values: series(
                      reconstruction.data,
                      feature,
                      0,
                      selected.times.length,
                      data.features.length,
                    ),
                    color: colors.recon,
                    dash: true,
                  },
                ]
              : []),
          ]}
          labels={labels}
          selected={point}
          onSelect={setPoint}
          height={230}
        />
        {!reconstruction.data && (
          <div
            className="case-reconstruction-status"
            role={reconstruction.error ? 'alert' : 'status'}
          >
            {reconstruction.error ? (
              <>
                {reconstruction.error}
                <button onClick={reconstruction.retry}>重试重建</button>
              </>
            ) : (
              '正在读取模型重建…'
            )}
          </div>
        )}
      </div>
      <Curve
        title={`${data.features.length} 测点异常分数`}
        lines={[{ name: '平均平方误差', values: cm.scores, color: colors.score }]}
        labels={meanSeries(arrays.labels, 0, selected.times.length, data.features.length).map((v) =>
          Number(v > 0),
        )}
        threshold={cm.threshold}
        selected={point}
        onSelect={setPoint}
        height={190}
      />
      <div className="case-score-pair">
        <span>
          当前时刻分数 <strong data-testid="case-score">{cm.scores[point].toFixed(6)}</strong>
        </span>
        <span>
          判定阈值 <strong>{cm.threshold.toFixed(6)}</strong>
        </span>
        <span>
          当前测点误差{' '}
          <strong>
            {reconstruction.data
              ? (
                  (after[point] - reconstruction.data[point * data.features.length + feature]) **
                  2
                ).toFixed(6)
              : '—'}
          </strong>
        </span>
      </div>
      <div className="statistics">
        <Confusion metrics={cm.metrics} />
        <Rates metrics={cm.metrics} />
      </div>
    </div>
  );
}
