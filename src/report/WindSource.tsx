import type { Journey } from '../journey';
import { featureName } from './featureNames';

export default function WindSource({ data }: { data: Journey }) {
  return (
    <>
      <p className="reading-copy">
        同一场站的实际功率、预测功率与天气记录按目标时刻对应，每 15 分钟一条，形成连续的 28 维输入。
      </p>
      <div className="model-details">
        {[
          ['功率记录', '实际功率与预测功率', '2 个字段'],
          ['实测天气', '温度、湿度、气压，以及不同高度的风速和风向', '13 个字段'],
          ['预测天气', '与实测天气对应的预报字段', '13 个字段'],
        ].map(([title, text, count], i) => (
          <section key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <p>{count}</p>
          </section>
        ))}
      </div>
      <div className="inline-facts">
        <strong>
          {data.summary.cleanRows.toLocaleString('zh-CN')}
          <span>连续时刻</span>
        </strong>
        <strong>
          15 分钟<span>目标时间间隔</span>
        </strong>
        <strong>
          0<span>选用字段缺失值</span>
        </strong>
      </div>
      <p className="reading-copy">
        整理后的输入保留实际数值。当前 28
        个字段没有缺失值，无需填补；目标时间轴连续，实际采集时间可能有秒级差异。
      </p>
      <details className="wind-fields">
        <summary>查看全部 28 个字段及来源</summary>
        <div
          className="reference-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="风电字段清单"
        >
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>字段</th>
                <th>来源</th>
                <th>原始名称</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((f) => (
                <tr key={f.key}>
                  <td>{f.index + 1}</td>
                  <td>{featureName(f)}</td>
                  <td>{f.group}</td>
                  <td>{f.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
