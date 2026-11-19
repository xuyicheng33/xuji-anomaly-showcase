import type { Journey } from '../journey';
import ModelDifferences from './ModelDifferences';
import { Heading } from './ReportUI';
import MetricsChapter from './MetricsChapter';
import { NoteSection } from './notes';
import ExplanationIndex from './ExplanationIndex';
import WindSource from './WindSource';
import Fraction from './Fraction';
import { caseGeometry } from '../resultCatalog';
import { modelName } from './modelNames';

export default function WindExplanation({ data, address }: { data: Journey; address: string }) {
  const model = data.models[0];
  const g = caseGeometry(data),
    span = g.end - g.begin;
  const sampleCount = g.sourceEnd - g.sourceBegin,
    window = data.window;
  const minutes = (window - 1) * (data.dataset?.samplingMinutes ?? 15);
  const duration = `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  return (
    <div className="explanation-page">
      <Heading title="数据与评估说明" />
      <ExplanationIndex address={address} />
      <NoteSection id="data-records">
        <WindSource data={data} />
      </NoteSection>
      <NoteSection id="data-source">
        <p>
          原始材料来自场站 41 的功率记录、实测天气和预测天气。整理表包含 8,759 个连续目标时刻，选取
          28 个输入字段；功率与天气字段逐行匹配到对应源文件，选用字段没有缺失值。
        </p>
        <p>
          时间轴使用目标时刻，范围为 {data.summary.cleanStart} 至 {data.summary.cleanEnd}，间隔 15
          分钟。实际功率采集时间存在秒级偏差，页面按已保存的目标时刻对应展示。
        </p>
        <p>
          保留的来源文件包括 all_short.csv、all_weather.csv、all_weather_forecast.csv
          的匹配记录，以及
          extracted_data.csv、字段选取脚本和归一化脚本。最初拼接过程未完整归档，因此不推断未保存的剔除或填补步骤。
        </p>
      </NoteSection>
      <NoteSection id="data-split">
        <p>
          按时间顺序取前 70% 的 6,131 行训练，后 30% 的 2,628 行测试。训练结束于{' '}
          {data.summary.trainEnd}，测试开始于 {data.summary.testStart}
          。没有随机打乱，也没有在该异常检测数据集中额外划分验证集。
        </p>
      </NoteSection>
      <NoteSection id="normalization">
        <p>每个字段独立使用训练段的最小值和最大值，测试段沿用相同参数。</p>
        <p className="reference-equation">
          <span>归一化值 =</span>
          <Fraction
            numerator="原始值 − 训练最小值"
            denominator="训练最大值 − 训练最小值 + 0.0001"
          />
        </p>
        <p>
          不截断超出 0—1 的数值。清洁测试集有 {data.dataset?.outsideUnitRange}{' '}
          个越界单元格；这些仍是原实验输入，页面保留其实际数值。
        </p>
        {data.methodResults && (
          <p>
            归一化后沿用实验保存的含噪训练与测试数组，不重新生成噪声。两种方法保留各自的测试输入；本版有
            565 个异常时刻，与此前 483 个异常时刻属于不同实验结果，不能据此直接判断方法改进幅度。
          </p>
        )}
      </NoteSection>
      <NoteSection id="anomaly-process">
        <p>
          原始测试标签全为
          0。实验在清洁测试数据中人为构造异常，保存了注入后的输入与标签；两者按原值导入。本页展示的是异常检测实验，不把构造标签称作现场真实故障。
        </p>
        <p>
          原实验没有完整保留每次构造的参考片段和随机操作记录。因此，构造章节使用独立保存的八个可追溯案例，展示同类操作；这些案例不会替换原测试集。
        </p>
      </NoteSection>
      <NoteSection id="anomaly-labels">
        <p>
          标签矩阵为 {data.times.length.toLocaleString('en-US')} × {data.features.length}，共有{' '}
          {data.dataset?.labelCells.toLocaleString('zh-CN')} 个标记单元格。每行只要有一个字段为
          1，该时刻就标为异常；合计 {data.summary.anomalousRows} 个异常时刻。
        </p>
        <p>
          指标使用保留标签。构造前后的数值变化范围与原标签范围不完全一致，不能把所有变化位置重新标为异常；也不能把未标记位置解释为已经确认的正常工况。
        </p>
      </NoteSection>
      <NoteSection id="anomaly-cases">
        <p>
          四类素材为参考片段、均匀值、峰值噪声和长度调整，分别用直接替换与 0.7
          权重混合，形成八个案例。每个案例保存原片段、素材、候选值、权重、输入、标签、掩码及
          {modelName(model)}的实际重建。
        </p>
        <p>
          案例以清洁风电测试集第 {g.start + 1}—{g.start + window} 点为底稿，目标区间为窗口第{' '}
          {g.begin + 1}—{g.end}
          点。参考片段来自清洁测试集第 {g.referenceStart + 1}—{g.referenceStart + span}{' '}
          点。混合计算为：原值 ×（1 − 权重）＋候选值 × 权重；峰值只改变一个时刻，标签覆盖其前后各{' '}
          {g.patchSize} 点。
        </p>
        <p>案例复用本版独立窗口阈值，不针对八个案例另外挑选阈值。</p>
      </NoteSection>
      <NoteSection id="length-sampling">
        <p>
          从目标区间取 {sampleCount} 个点，每点重复 {g.scale} 次形成 {span}
          点。仅改选定区间和字段，后续时间位置保持不变。每点的实际时间间隔仍为 15
          分钟，动画速度只影响展示速度。
        </p>
      </NoteSection>
      <NoteSection id="window-settings">
        <p>
          每个窗口包含 {data.window} 个时刻、{data.features.length} 个字段。步长为 1，2,628
          个测试时刻形成 {model.windows.count.toLocaleString('zh-CN')}{' '}
          个完整窗口；每个窗口首尾时间相差 {duration}。
        </p>
        <p>
          {data.methodResults
            ? `主训练 ${model.history.length} 轮。展示数据在 2026 年 11 月 16 日用保留权重经 GPU 推理导出`
            : '检查点保存于 2026 年 10 月 27 日，主训练 5 轮。展示数据在 2026 年 11 月 5 日用保留权重经 CPU 推理导出'}
          ，没有重新训练。Local 分支接收完整窗口，Global 分支每个字段连续遮蔽 {window / 4}
          个位置；掩码固定并保存。
        </p>
        <p>
          新导出使用全部完整窗口，按源时刻正确聚合。它是可重复核查的展示版本，不声称还原当年随机掩码和前缀填充下的逐次推理。
        </p>
      </NoteSection>
      <NoteSection id="score-calculation">
        <p>
          独立窗口内，每个时刻逐项计算“输入 − 当前窗口重建”的平方，28
          项取平均，得到该时刻的异常分数。分数严格大于阈值时判定为异常。
        </p>
        <p className="reference-equation">
          <span>时刻分数 =</span>
          <Fraction numerator="28 个字段的平方误差合计" denominator="28" />
        </p>
        <p>
          “全部测点平均”只改变上方曲线的显示，分数始终由各字段平方误差汇总；不能用两条平均曲线的差代替。
        </p>
      </NoteSection>
      <NoteSection id="thresholds">
        <p>
          沿用换流数据集的事后回看规则：在本版测试结果上遍历可区分的阈值，优先选择区间点调整 F1
          最高的值；并列时比较逐点
          F1，再取更高阈值。规则使用测试标签，适合回看展示，不等同于未经标注的新数据上线效果。
        </p>
        <p>
          独立窗口阈值为 {model.windowThreshold.toPrecision(12)}，连续回放阈值为{' '}
          {model.threshold.toPrecision(12)}。两种评分方式分别评估，因此阈值分别保存。
        </p>
      </NoteSection>
      <NoteSection id="point-metrics">
        <MetricsChapter data={data} />
      </NoteSection>
      <NoteSection id="window-aggregation">
        <p>
          同一时刻可被多个窗口覆盖。重建曲线取这些窗口的重建均值；评分取这些窗口的平方误差均值，再对
          28 个字段取平均。首尾各由一个窗口覆盖，中间最多 {window} 个。
        </p>
        <p>
          测点贡献为该字段平均平方误差除以 28，28
          项相加等于时刻分数。展开任一字段，可查看全部覆盖窗口的重建值和原始平方误差。
        </p>
        <p>
          重建均值与误差均值是两项独立计算。例如输入为 0.5，两次重建分别是 0.4 和 0.6，平均重建为
          0.5，但平均平方误差仍为 0.01。
        </p>
        <p>
          连续回放使用完整测试序列，其中覆盖窗口可能包含当前时刻之后的观测。播放按钮逐步展示已保存结果，不在浏览器中训练或在线预测。
        </p>
      </NoteSection>
      <NoteSection id="model-design">
        <ModelDifferences data={data} />
        <p>
          检查点、输入、标签、固定掩码和全部窗口结果均独立保留；重建按 float32 保存，误差与聚合按
          float64 计算。网站内各处使用同一份结果与精度。
        </p>
      </NoteSection>
      <NoteSection id="training-mse">
        <p>
          训练曲线读取检查点中的 {model.history.length} 条 MSE 与学习率记录，轮次显示为 1—
          {model.history.length}。MSE
          是记录的重建误差，训练优化还含有界异常损失等约束，二者不是同一个数。移动训练窗口只改变显示，不会触发训练。
        </p>
      </NoteSection>
    </div>
  );
}
