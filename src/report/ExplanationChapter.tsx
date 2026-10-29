import type { Journey } from '../journey';
import { Heading } from './ReportUI';
import MetricsChapter from './MetricsChapter';
import { notes, NoteSection } from './notes';
import RecordExamples from './RecordExamples';
import Fraction from './Fraction';
import cleaning from './cleaning-data.json';

export default function ExplanationChapter({
  data,
  address,
}: {
  data: Journey;
  address: string;
  feature: number;
}) {
  const params = new URLSearchParams(address.split('?')[1] ?? ''),
    requested = params.get('note');
  return (
    <div className="explanation-page">
      <Heading title="数据与评估说明">数据来源、计算过程与评估规则。</Heading>
      <nav className="explanation-index" aria-label="说明目录">
        {notes.map((note, i) => (
          <a
            key={note.id}
            href={
              '#/metrics?' + new URLSearchParams({ ...Object.fromEntries(params), note: note.id })
            }
            aria-current={requested === note.id ? 'location' : undefined}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {note.title}
          </a>
        ))}
      </nav>
      <NoteSection id="data-records">
        <RecordExamples data={data} />
      </NoteSection>
      <NoteSection id="data-source">
        <p>
          原始数据来自converter.xlsx的Sheet8：8,760条记录、136个测点。整理后的converternew.xlsx /
          Sheet1包含7,992个时刻、125个测点。
        </p>
        <p>整理时删除768条无效记录和11个全缺失测点，将13个保留测点中的170个缺失单元格填为0。</p>
        <p>
          无效记录是原表第3433—3456条和第8017—8760条，行号从表头下一行开始计数。这两段的时间与测点值均为“---”。中间一段位于2022-05-23
          23:00与2022-05-25 00:00之间，末尾一段位于2022-11-30
          23:00之后。删除后，其余记录按原来的时间顺序保留。
        </p>
        <p>删除的测点：{data.removedFeatures.join('、')}。</p>
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
                  <th>{f.label}</th>
                  <td>{f.key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="reference-table-hint" id="sensor-table-hint">
          左右滑动查看测点名称与编号。
        </p>
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
          <strong>标签对应一个时刻、一个测点。</strong>
          0表示正常，1表示异常。例如“第133点的直流电流标签异常”，说的是这个单元格。
        </p>
        <p>
          同一时刻只要有一个测点的标签为1，这个时刻的真实状态就是异常。模型再根据该时刻的异常分数与阈值作出判断。
        </p>
      </NoteSection>
      <NoteSection id="length-sampling">
        <p>
          拉长是重复采样：A、B、C →
          A、A、A、B、B、B、C、C、C。当前案例将8点变成24点，写入第19—42点，其余位置保留原值。
        </p>
        <p>缩短是间隔采样：A、B、C、D、E、F、G、H → A、C、E、G，将原来的8点变化压缩到4个位置。</p>
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
          页面使用2026年10月27日由已有权重导出的窗口结果。每个窗口保存64×125个重建值，Global分支每个测点遮蔽16个位置，Local分支接收完整窗口。
        </p>
        <p>
          历史训练在序列开头重复首个观测值补齐窗口。页面的窗口演示和测试结果从完整窗口开始展示。
        </p>
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
      </NoteSection>
      <NoteSection id="point-metrics">
        <p>
          每个时刻比较真实标签与模型报警，得到检出、漏检、误报或正确正常。回放中的混淆矩阵和逐点F1累计统计已经查看的时刻。
        </p>
        <p>
          区间点调整用于评估计分：一个真实异常段内只要出现一次报警，就将整段计为检出；整段都没有报警则计为漏检。图中的报警点按模型实际判断显示。
        </p>
        <MetricsChapter data={data} />
      </NoteSection>
      <NoteSection id="window-aggregation">
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
          页面的模型介绍采用报告设计。当前保存的SMST-AD结果由时间特征生成重建；对应代码同时计算空间注意力和空间正则。
        </p>
      </NoteSection>
    </div>
  );
}
