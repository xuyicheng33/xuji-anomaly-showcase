import WindExplanation from './WindExplanation';
import type { Journey } from '../journey';
import { Heading } from './ReportUI';
import MetricsChapter from './MetricsChapter';
import { NoteSection } from './notes';
import ExplanationIndex from './ExplanationIndex';
import RecordExamples from './RecordExamples';
import Fraction from './Fraction';
import cleaning from './cleaning-data.json';
import { featureName } from './featureNames';

export default function ExplanationChapter({ data, address }: { data: Journey; address: string }) {
  if (data.dataset?.id === 'wind') return <WindExplanation data={data} address={address} />;
  return (
    <div className="explanation-page">
      <Heading title="数据与评估说明">数据来源、计算过程与评估规则。</Heading>
      <ExplanationIndex address={address} />
      <NoteSection id="data-records">
        <RecordExamples data={data} />
      </NoteSection>
      <NoteSection id="data-source">
        <p>
          原始数据来自converter.xlsx的Sheet8：8,760条记录、136个测点。整理后的converternew.xlsx /
          Sheet1包含7,992个时刻、125个测点。
        </p>
        <p>整理时删除768条无效记录和11个全缺失测点，将13个保留测点中的170个缺失单元格填为0。</p>
        <p>报告第3.2节采用加权滑动平均填补与平滑；本版数据采用零值填补。</p>
        <p>
          无效记录是原表第3433—3456条和第8017—8760条，行号从表头下一行开始计数。这两段的时间与测点值均为“---”。中间一段位于2022-05-23
          23:00与2022-05-25 00:00之间，末尾一段位于2022-11-30
          23:00之后。删除后，其余记录按原来的时间顺序保留。
        </p>
        <p>删除的测点：{data.removedFeatures.join('、')}。</p>
        <p className="sensor-list-hint" id="sensor-table-hint">
          共 125 个测点，向下滚动查看完整列表；窄屏可左右滑动查看名称与编号。
        </p>
        <div
          className="reference-table-scroll sensor-list"
          tabIndex={0}
          role="region"
          aria-label="保留的125个测点"
          aria-describedby="sensor-table-hint"
        >
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>测点名称</th>
                <th>测点编号</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((f, i) => (
                <tr key={f.key}>
                  <td>{i + 1}</td>
                  <th>{featureName(f)}</th>
                  <td>{f.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </NoteSection>
      <NoteSection id="data-split">
        <p>
          整理后的7,992条记录按时间顺序划分：前70%为训练集，共5,594条；后30%为测试集，共2,398条。
        </p>
        <p>
          训练集：{cleaning.split.trainStart} 至 {cleaning.split.trainEnd}。测试集：
          {cleaning.split.testStart} 至 {cleaning.split.testEnd}。
        </p>
        <p>
          模型实际使用的数组为5,593条训练记录和2,397条测试记录。两段各从第二条开始，跳过的首条时间为
          {data.summary.omittedTimes.join('、')}。
        </p>
      </NoteSection>
      <NoteSection id="normalization">
        <p className="reference-equation">
          <span>归一化值 =</span>
          <Fraction numerator="原值 − 训练最小值" denominator="训练最大值 − 训练最小值" />
        </p>
        <p>
          每个测点单独计算训练集的最大值和最小值，训练集与测试集都使用这两个值归一化。结果低于0时取0，高于1时取1；训练集数值始终相同的测点取0。
        </p>
        <p>模型输入、重建值和平方误差均使用归一化后的数值。</p>
      </NoteSection>
      <NoteSection id="anomaly-process">
        <p>
          报告第3.3节按完整序列构造异常：先划分不重叠窗口，在选中的窗口内修改局部数据并生成标签，再按时间顺序拼回序列，最后生成模型使用的重叠窗口。
        </p>
        <ol>
          <li>将正常序列分为连续的64点窗口，末尾不足64点时补齐，拼回时取原序列长度。</li>
          <li>抽取待插入的窗口，再选择异常类型、测点、区间长度和起始位置。</li>
          <li>在选定位置构造异常，同时在标签矩阵中标记对应的时刻和测点。</li>
          <li>按原顺序连接各窗口，得到带异常的完整序列及对应标签矩阵。</li>
          <li>以步长1生成重叠窗口。同一时刻出现在多个窗口中时，共用序列中的数据和标签。</li>
        </ol>
        <p>
          训练阶段采用动态插入：每个训练轮次重新抽取位置并构造异常。测试阶段采用固定插入：一次生成数据和标签，测试时使用同一份序列；插入标签与原有标签逐单元格取或，形成最终测试标签。
        </p>
        <p>
          窗口注入比例控制抽取窗口的数量；异常时刻占比统计包含异常的行数，异常单元格占比统计标签矩阵中1的数量。
        </p>
      </NoteSection>
      <NoteSection id="anomaly-labels">
        <p>本页的实验异常标签包含人为构造异常，标签来源为实验记录，用于检测效果评估。</p>
        <p>
          <strong>标签矩阵的一行对应一个时刻，一列对应一个测点。</strong>
          单元格为0表示正常，为1表示该测点在这个时刻处于构造异常区间。
        </p>
        <p>
          以参考片段案例为例，测点5和测点6属于选中测点，测点8保留原值。第19—42点的选中测点标为1。
        </p>
        <div
          className="reference-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="参考片段案例的局部标签"
        >
          <table className="anomaly-label-table">
            <thead>
              <tr>
                <th>时刻</th>
                <th>测点5</th>
                <th>测点6</th>
                <th>测点8</th>
                <th>时刻标签</th>
              </tr>
            </thead>
            <tbody>
              {[
                [18, 0],
                [19, 1],
                [42, 1],
                [43, 0],
              ].map(([point, label]) => (
                <tr key={point}>
                  <th>第{point}点</th>
                  <td>{label}</td>
                  <td>{label}</td>
                  <td>0</td>
                  <td>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          对同一行的125个标签取或：只要有一个测点标为1，该时刻的标签就是1。整条测试序列的标签矩阵为2,397×125，包含18,869个异常单元格；按行汇总后有490个异常时刻，组成17段连续异常。
        </p>
        <p>
          标签覆盖范围由构造规则确定。峰值噪声同时标记峰值及邻近时刻；混合区间的两端权重可降到0，标签仍覆盖选定区间。
        </p>
      </NoteSection>
      <NoteSection id="anomaly-cases">
        <p>
          八个案例由“替换、混合”两种插入方式与四种素材组合而成。每个案例从清洁测试数据中取64个时刻，在32个选定测点上构造异常，再由两个模型分别重建和评估。
        </p>
        <ul>
          <li>参考片段：取一段真实记录，先反转时间顺序，再用“1 − 数值”翻转幅值。</li>
          <li>均匀值：在目标区间内写入同一个值，形成平台。</li>
          <li>峰值噪声：改变第31点的数值，将第27—35点标为异常。</li>
          <li>长度调整：将第19—26点的8个值各重复3次，写入第19—42点。</li>
        </ul>
        <p>
          替换直接写入素材值；混合按“原值 ×（1 − 权重）+ 素材 ×
          权重”计算，中央权重为0.7，两端逐渐降低。异常标签标记构造区间，也包括规则指定的边缘或邻近时刻。
        </p>
        <p>
          报告的四类构造为软替换、均匀替换、峰值噪声和长度调整。案例将素材生成与写入方式分开，使用固定区间展示替换和混合的过程；整条测试序列使用实验中生成的固定异常及标签。
        </p>
      </NoteSection>
      <NoteSection id="length-sampling">
        <p>
          拉长是重复采样：A、B、C →
          A、A、A、B、B、B、C、C、C。当前案例将8点变成24点，写入第19—42点，其余位置保留原值。
        </p>
        <p>缩短是间隔采样：A、B、C、D、E、F、G、H → A、C、E、G，将原来的8点变化压缩到4个位置。</p>
        <p>案例在选定区间和测点内完成采样；实验函数的长度调整还会移动窗口内的前后片段。</p>
      </NoteSection>
      <NoteSection id="window-settings">
        <p>
          <strong>64×125是一个窗口的形状：</strong>
          64个时刻，每个时刻125个测点。步长1表示下一个窗口向后移动一个时刻，例如第1—64点、第2—65点。2,397个测试时刻共形成2,334个完整窗口。
        </p>
        <p>
          训练时把多个窗口组成一批，整批形状是B×64×125，B表示窗口数量。当前训练配置每批128个窗口，最后一批按剩余数量组成；各窗口分别重建，整批计算损失并更新一次参数。
        </p>
        <p>
          窗口结果导出于2026年10月27日。每个窗口包含64×125个重建值，Global分支每个测点遮蔽16个位置，Local分支接收完整窗口。
        </p>
        <p>训练序列开头以首个观测值补齐窗口；片段检测使用连续64个观测值组成的完整窗口。</p>
      </NoteSection>
      <NoteSection id="score-calculation">
        <p>
          <strong>片段页展示当前选中窗口的重建结果。</strong>
          选择直流电流和第1—64点，就显示这个窗口重建出的直流电流64个值。选择“全部测点平均”时，曲线取125个测点的平均值。
        </p>
        <p>
          输入来自送入模型的测试数据，其中包含构造异常。上方曲线随测点选择变化，下方异常分数始终汇总全部125个测点。
        </p>
        <p className="reference-equation">
          <span>该时刻的窗口分数 =</span>
          <Fraction numerator="125个测点的平方误差合计" denominator="125" />
        </p>
        <p>
          对同一时刻的各测点分别计算“（输入 −
          该窗口重建）²”，将125项相加再除以125。一个窗口有64个时刻，因此得到64个分数。
        </p>
        <p>计算与阈值比较使用完整精度，明细表显示9位小数。</p>
      </NoteSection>
      <NoteSection id="thresholds">
        <p>
          <strong>分数大于阈值时报警，等于或低于阈值时判为正常。</strong>
        </p>
        <div className="evaluation-thresholds">
          {data.models.map((model) => (
            <div key={model.id}>
              <h3>{model.name}</h3>
              <dl>
                <div>
                  <dt>独立窗口阈值</dt>
                  <dd>{model.windowThreshold.toFixed(9)}</dd>
                </div>
                <div>
                  <dt>完整序列阈值</dt>
                  <dd>{model.threshold.toFixed(9)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
        <p>
          当前阈值通过扫描选择：对照测试标签，逐一比较不同阈值的报警结果，选择区间点调整F1最高的值。并列时先比较逐点F1，再选择较高的阈值。
        </p>
        <p>
          片段检测和连续回放分别选取阈值。片段页的阈值统一依据全部2,334个窗口选出，各窗口分别进行区间点调整后汇总；回放阈值依据完整序列的合并分数选出。
        </p>
        <p>报告第4.4节采用POT阈值：用训练集异常分数拟合尾部分布，再确定测试时的报警阈值。</p>
      </NoteSection>
      <NoteSection id="point-metrics">
        <p>
          每个时刻比较实验标签与模型报警，得到检出、漏检、误报或正确正常。回放中的混淆矩阵和逐点F1累计统计已经查看的时刻。
        </p>
        <p>
          区间点调整用于评估计分：一个实验异常标签区间内只要出现一次报警，就将整段计为检出；整段都没有报警则计为漏检。图中的报警点按模型实际判断显示。
        </p>
        <MetricsChapter data={data} />
      </NoteSection>
      <NoteSection id="window-aggregation">
        <h3>测点贡献与窗口明细</h3>
        <p>
          固定一个时刻与测点，输入值在各覆盖窗口中相同。将它与每个窗口的重建值分别相减、平方，再除以实际覆盖窗口数，得到该测点的平均平方误差。测点误差再除以{' '}
          {data.features.length}，就是贡献柱图中的单项数值；全部测点贡献之和等于回放分数。
        </p>
        <p>
          柱长表示占当前整体分数的比例，默认列出贡献最高的七个测点，其余测点按同一比例合计。点击柱条暂停回放并查看窗口明细；选择全部可以查看任意测点。排名随时刻变化，不改变保存的误差值。
        </p>
        <p>
          明细中的水平线是同一个输入值，圆点是各覆盖窗口的重建值。误差格子从左到右、从上到下按窗口起点排列，每格代表一个覆盖窗口在当前测点、当前时刻的平方误差，首尾按实际覆盖数展示。
        </p>
        <p>
          颜色使用当前这组覆盖窗口的最小与最大误差作为标尺，两端数值显示在色条旁，用于看清同组窗口的细微差异。颜色只在当前这一组内比较，不能用不同时间或测点的深浅判断绝对误差，也不表示报警；实际误差以点击后的数值为准。全部相同或差异小于
          10⁻¹² 时使用同一浅色。
        </p>
        <h3>连续序列的合并</h3>
        <p>
          <strong>“当前时刻分数”是当前选中时间点的异常分数。</strong>
          同一时刻出现在多个窗口中，每个窗口都会给它一个重建结果和一个分数。
        </p>
        <ul>
          <li>重建曲线：同一测点、同一时刻的各窗口重建值取平均。</li>
          <li>异常分数：每个窗口先平均该时刻125项平方误差，再平均各窗口的分数。</li>
        </ul>
        <p className="reference-equation">
          <span>回放时刻分数 =</span>
          <Fraction numerator="覆盖该时刻的窗口分数合计" denominator="实际覆盖窗口数" />
        </p>
        <p>
          例如第48点出现在第1—64点至第48—111点这48个窗口中，“48个覆盖窗口”就是这48份结果。序列中间最多有64份，首尾按实际数量取平均。
        </p>
        <p>
          两次平均可以交换顺序：先平均各窗口的平方误差，再平均125个测点，结果相同。48个窗口时，也就是将48×125项平方误差相加，除以48×125。
        </p>
        <p>
          重建值平均和误差平均是两项计算。例如输入0.5，两个窗口重建为0.4和0.6：平均重建值是0.5；两个平方误差均为0.01，平均误差仍为0.01。
        </p>
        <p>
          回放读取整条测试序列保存的结果，覆盖窗口包括当前时刻之后的观测。“完整测试集”和“选定片段”两种范围共用这份结果与回放阈值。
        </p>
      </NoteSection>
      <NoteSection id="model-design">
        <p>
          STAM-AD通过Local和Global两个时间分支学习短期变化与较长范围的规律，再融合特征重建窗口。
        </p>
        <p>
          报告中的SMST-AD增加多尺度时间建模和空间分支。这里的“空间”是测点之间的关联：在测点维度计算注意力，用相关性掩码与空间正则约束关联，再融合时间和空间特征重建。
        </p>
        <p>
          本版SMST-AD由时间特征生成重建，空间分支计算注意力和空间正则；报告的解码器融合时间与空间特征。
        </p>
      </NoteSection>
      <NoteSection id="training-mse">
        <p>
          训练重建误差（MSE）记录每轮的重建误差变化。每个批次先计算各窗口、各时刻、各测点的平方误差均值，再将这一轮各批次的均值取平均，得到曲线上的一个数值。
        </p>
        <p>
          参数更新使用有界异常损失：正常时刻减小重建误差，异常时刻将误差推动到设定边界；SMST-AD同时计算空间正则。训练曲线读取保存的MSE记录，学习率读取对应轮次的优化器记录。
        </p>
      </NoteSection>
    </div>
  );
}
