import type {Journey} from '../journey';
import {Heading} from './ReportUI';
import MetricsChapter from './MetricsChapter';
import {notes,NoteSection} from './notes';
import RecordExplorer from './RecordExplorer';
import cleaning from './cleaning-data.json';
import './calculation.css';

export default function ExplanationChapter({data,address,feature}:{data:Journey;address:string;feature:number}){
  const params=new URLSearchParams(address.split('?')[1]??''),requested=params.get('note');
  const sensor=Math.max(0,Math.min(124,Math.floor(Number(params.get('feature')??feature)||0))),from=Math.max(0,Math.min(data.summary.cleanRows-64,Math.floor(Number(params.get('from')??5300)||0)));
  return <div className="explanation-page"><Heading title="数据与评估说明">数据来源、计算过程与评估规则。</Heading>
    <nav className="explanation-index" aria-label="说明目录">{notes.map((note,i)=><a key={note.id} href={'#/metrics?'+new URLSearchParams({...Object.fromEntries(params),note:note.id})} aria-current={requested===note.id?'location':undefined}><span>{String(i+1).padStart(2,'0')}</span>{note.title}</a>)}</nav>
    <NoteSection id="data-records"><p>选择测点和时间范围，对照原始记录与整理结果。点击曲线或拖动明细起点，可查看对应的逐条数值。</p><RecordExplorer key={`${params.get('feature')??'saved'}:${params.get('from')??'saved'}`} data={data} initialFeature={params.has('feature')?sensor:undefined} initialFrom={params.has('from')?from:undefined} requested={requested==='data-records'}/></NoteSection>
    <NoteSection id="data-source"><p>原始记录：converter.xlsx / Sheet8，共8,760条记录、136个测点。整理结果：converternew.xlsx / Sheet1，共7,992个时刻、125个测点。</p><p>移除768条无效时间记录与11个全缺失测点，保留范围中的170个缺失单元格填0。这些单元格分布在13个测点。</p><p>无效记录位于原始数据第3433—3456条与第8017—8760条，不含表头。前段位于2022-05-23 23:00与2022-05-25 00:00之间，后段位于2022-11-30 23:00之后，两段的时间与测点值均为“---”。记录条带按原始顺序排列，短缺失段放大至可辨识宽度；删除行后仍保留实际时间缺口。</p><p>移除测点：{data.removedFeatures.join('、')}。</p><div className="reference-table-scroll sensor-list" tabIndex={0} role="region" aria-label="保留的125个测点" aria-describedby="sensor-table-hint"><table><thead><tr><th>序号</th><th>测点名称</th><th>测点编号</th></tr></thead><tbody>{data.features.map((f,i)=><tr key={f.key}><td>{i+1}</td><th>{f.label}</th><td>{f.key}</td></tr>)}</tbody></table></div><p className="reference-table-hint" id="sensor-table-hint">左右滑动查看测点名称与编号。</p></NoteSection>
    <NoteSection id="data-split"><p>按时间顺序以70% / 30%划分完整的7,992条整理记录，训练段5,594条，测试段2,398条，均包含125个测点。</p><p>训练段：{cleaning.split.trainStart} 至 {cleaning.split.trainEnd}；测试段：{cleaning.split.testStart} 至 {cleaning.split.testEnd}。</p><p>当前归档训练数组5,593条，测试数组2,397条。整理表7,992条记录中，训练段与测试段各自首条未进入实验数组，对应{data.summary.omittedTimes.join('、')}。现有模型结果对应这7,990条输入记录。</p></NoteSection>
    <NoteSection id="normalization"><p className="reference-equation">归一化值 =（原值 − 训练最小值）÷（训练最大值 − 训练最小值）</p><p>每个测点分别使用训练段的最小值与最大值。测试集沿用同一统计量，低于0的结果取0，高于1的结果取1。训练段为常量的测点归一化为0。</p><p>重建误差与异常分数使用归一化后的输入值计算。</p></NoteSection>
    <NoteSection id="anomaly-cases"><p>八个案例来自真实清洁记录，按“替换 / 混合 × 四种素材”离线构造，各自配有已训练模型的重建结果。案例使用64×125完整输入，在32个选定测点上构造变化，沿用窗口判定阈值。案例与完整测试集分别评估。</p><ul><li>参考片段：取同一清洁测试集的片段，反转时间顺序，再以“1 − 数值”翻转幅值。</li><li>均匀值：区间内使用同一个构造值，形成持续平台。</li><li>峰值噪声：在第31点构造相反方向极值，标签覆盖第27—35点。</li><li>长度调整：第19—26点的8个值各重复3次，形成24点素材，写入第19—42点。</li></ul><p>替换直接使用素材值；混合使用“原值 ×（1 − 权重）+ 素材 × 权重”，中央权重为0.7，两端渐变。标签按构造规则生成，部分带有异常标签的边界位置保留原值。</p><p>标签矩阵与输入矩阵同形状。同一时刻任一测点标签为1，该时刻的真实标签即为异常；模型是否报警由异常分数和阈值决定。</p></NoteSection>
    <NoteSection id="length-sampling"><p>拉长按逐点重复：A、B、C → A、A、A、B、B、B、C、C、C。当前案例将8点变为24点，写入64点窗口的第19—42点，第43—64点保留原来的位置与数值。</p><p>缩短可按间隔采样：A、B、C、D、E、F、G、H → A、C、E、G，将8点中的变化压缩到4个位置，再写入预先选定的4点区间。</p></NoteSection>
    <NoteSection id="window-settings"><p>窗口长度64、步长1，每个窗口包含125个测点。2,397个测试时刻对应2,334个完整窗口。</p><p>当前完整窗口结果于2026年10月27日使用已有模型权重与正式测试输入导出。每个窗口保存64×125重建值及固定掩码，Global分支每个测点遮蔽16个位置，Local分支使用完整输入。</p><p>历史训练过程在序列开头重复首个观测值补齐窗口；页面训练窗口演示与测试评估遍历完整窗口。</p></NoteSection>
    <NoteSection id="score-calculation"><p className="reference-equation">时刻分数 = Σ（该时刻输入 − 该窗口重建）² <span className="formula-term">÷ 125</span></p><p>先对同一时刻125个测点逐项相减、平方，再将125项求和并除以125，得到均方误差MSE。一个64点窗口得到64个分数，每个时刻一个。</p><p>输入值来自包含构造异常的测试数据。选择测点可查看对应曲线，各时刻的评分均使用全部125个测点。平均输入与平均重建曲线呈现整体形态；评分先对各测点误差平方，再取平均。</p><p>求和、平均与阈值判定均使用完整精度，表格数值四舍五入至9位小数。</p></NoteSection>
    <NoteSection id="thresholds"><p>分数大于阈值时报警，否则不报警。</p><div className="evaluation-thresholds">{data.models.map(model=><div key={model.id}><h3>{model.name}</h3><dl><div><dt>独立窗口阈值</dt><dd>{model.windowThreshold.toFixed(9)}</dd></div><div><dt>完整序列阈值</dt><dd>{model.threshold.toFixed(9)}</dd></div></dl></div>)}</div><p>采用事后回看评估：对照测试标签，遍历全部可区分报警划分，选择区间点调整F1最高的阈值；并列时依次选择逐点F1更高、阈值更高的结果。</p><p>完整序列与独立窗口分别标定。窗口阈值统一基于全部2,334个窗口，各窗口单独进行区间点调整后汇总。</p></NoteSection>
    <NoteSection id="point-metrics"><p>检出、误报、漏检与正确正常均按时间点统计。回放的混淆矩阵与逐点F1累计已查看范围内的实际报警。</p><p>区间点调整规则：真实异常段内出现一次报警，该段全部时间点计为检出；整段未报警则计为漏检。此规则用于评估计分，保留原始报警结果。</p><MetricsChapter data={data}/></NoteSection>
    <NoteSection id="window-aggregation"><p className="reference-equation">回放时刻分数 = 覆盖该时刻的窗口分数合计 ÷ 实际覆盖窗口数</p><p>每个窗口先对该时刻的125项平方误差取平均，再平均各覆盖窗口的分数。这与先平均各测点的窗口平方误差、再平均125个测点完全等价。</p><p>中间时刻最多被64个窗口覆盖，首尾按实际数量合并。重建曲线独立平均各窗口重建值；评分平均的是平方误差。</p><p>回放依次呈现已保存的完整序列结果。“完整测试集”与“选定片段”两种播放范围均使用完整序列的合并分数与序列阈值。全覆盖合并包含后续窗口，属于离线回看。</p></NoteSection>

    <NoteSection id="model-design"><p>STAM-AD采用局部与全局双分支结构。SMST-AD在此基础上引入多尺度时间编码，并设计空间分支与时空融合，表达测点之间的关联。</p><p>当前归档实现中，空间分支及空间约束存在，重建解码器接收时间特征z_time，融合特征z_final未进入重建输出。现有结果对应这一实现。</p></NoteSection>
  </div>;
}
