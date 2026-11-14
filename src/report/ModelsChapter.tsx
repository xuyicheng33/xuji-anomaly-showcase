import { type Journey, type Model } from '../journey';
import { Heading, Section, ModelSelect } from './ReportUI';
import { Footnote } from './notes';
import { modelName, modelNames } from './modelNames';
import InfoTip from './InfoTip';
import { chapterContent } from './navigation';

const windDescription = {
  title: '多尺度时间依赖与窗口重建',
  intro:
    'SMST-AD以多尺度局部时间分支和全局时间分支重建风电窗口，结合异常增强、时间掩码与有界异常损失学习数据变化。',
  details: [
    ['多尺度局部依赖', '不同空洞率的TCN提取窗口内不同范围的变化，Transformer组织时间关联。'],
    ['全局时间依赖', 'Global分支接收部分遮蔽的窗口，利用其余可见时刻还原风电功率与天气字段。'],
    [
      '融合与重建',
      '当前保留实现以局部与全局时间特征融合后的结果生成重建值；逐点平方误差汇总为异常评分。',
    ],
  ],
};
const descriptions = {
  model1: {
    title: '双分支自监督重建',
    intro:
      'STAM-AD以TCN与Transformer为主体，结合异常增强、时间掩码和有界异常损失，学习正常模式与异常变化之间的差异。',
    details: [
      [
        '局部时间依赖',
        'Local分支接收完整窗口，通过因果卷积提取短期变化，再由Transformer组织窗口内的时间关联。',
      ],
      [
        '全局时间依赖',
        'Global分支接收部分遮蔽的窗口，通过空洞卷积扩大感受野，结合Transformer提取较长范围的规律。',
      ],
      [
        '融合与重建',
        '拼接局部与全局特征，由共享解码器还原窗口。重建结果与输入逐点比较，形成异常评分。',
      ],
    ],
  },
  model2: {
    title: '多尺度时空依赖建模',
    intro:
      'SMST-AD在STAM-AD基础上，将多尺度时间依赖与显式空间依赖协同建模，同时观察不同时间范围的变化和测点之间的关联。',
    details: [
      [
        '多尺度时间分支',
        '不同空洞率的Local TCN并行提取短期波动、周期模式与中期趋势，再与Global分支共同形成时间表示。',
      ],
      [
        '显式空间分支',
        'Transformer在测点维度计算注意力，利用皮尔逊相关性引导空间掩码，并以异常感知空间正则抑制异常测点对正常测点的过度影响。',
      ],
      [
        '时空融合与重建',
        '拼接时间与空间特征后重建窗口，训练时联合优化有界异常损失与空间正则，测试时以重建误差形成异常评分。',
      ],
    ],
  },
};
export function ModelsChapter({
  data,
  model,
  setModel,
}: {
  data: Journey;
  model: Model;
  setModel: (value: string) => void;
}) {
  const multi = model.id === 'model2',
    wind = data.dataset?.id === 'wind',
    description = wind ? windDescription : descriptions[multi ? 'model2' : 'model1'];
  return (
    <div className="models-chapter">
      <Heading
        label={chapterContent.models.title}
        title={
          <>
            {chapterContent.models.title}
            <Footnote note="model-design" />
          </>
        }
      />
      {data.models.length > 1 && (
        <div className="model-selection-row">
          <ModelSelect data={data} value={model.id} onChange={setModel} />
        </div>
      )}
      <div className="model-intro">
        {data.models.length === 1 && <span>{modelName(model)}</span>}
        <h2>
          {description.title}
          <InfoTip label="模型设计说明">
            {modelNames[multi ? 'model2' : 'model1'].full}。{description.intro}
          </InfoTip>
        </h2>
      </div>
      <section aria-label="从输入到异常评分">
        <div className="model-flow" aria-label="模型处理流程">
          {[
            ['输入窗口', `${data.window}个时刻 × ${data.features.length}个测点`],
            [
              multi && !wind ? '时间与空间编码' : '局部与全局编码',
              multi && !wind ? '多尺度时间建模，测点间注意力' : 'TCN提取变化，Transformer学习关联',
            ],
            [multi && !wind ? '时空融合与重建' : '特征融合与重建', '还原各时刻的测点数值'],
            ['误差聚合与判定', '平方误差聚合为时刻分数'],
          ].map(([title, copy], i) => (
            <div key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="model-details">
        {description.details.map(([title, text]) => (
          <details key={title}>
            <summary>
              <h3>{title}</h3>
            </summary>
            <p>{text}</p>
          </details>
        ))}
      </div>

      <Section title="时间掩码与上下文学习">
        <div className="model-explanation">
          <div>
            <p>
              通过频域分析观察各测点的周期性，再对Global分支输入中的连续片段进行遮蔽，促使模型利用其余可见时刻建立时间关联。Local分支保留完整输入，补充细节。
            </p>
          </div>
          <div className="mask-example" aria-label="64点窗口中连续16点遮蔽">
            <div className="mask-example-top">
              <span>Global分支输入</span>
              <strong>64 点</strong>
            </div>
            <div className="mask-example-cells">
              {Array.from({ length: 64 }, (_, i) => (
                <i key={i} className={i >= 22 && i < 38 ? 'masked' : ''} />
              ))}
            </div>
            <div className="mask-example-key">
              <span>保留可见记录</span>
              <span>连续遮蔽 16 点</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="有界异常损失">
        <div className="loss-explanation">
          <div>
            <span>正常位置</span>
            <h3>减小重建误差</h3>
          </div>
          <div>
            <span>异常位置</span>
            <h3>形成足够的重建差异</h3>
            <p>误差低于设定边界时推动其增大；达到边界后停止继续推动，使训练保持稳定。</p>
          </div>
        </div>
      </Section>

      {!wind && (
        <Section title="两种方法的侧重点">
          <div className="model-comparison">
            <div>
              <span>STAM-AD</span>
              <h3>局部与全局互补</h3>
              <p>用两个时间分支分别捕捉短期变化与窗口整体规律。</p>
            </div>
            <div>
              <span>SMST-AD</span>
              <h3>多尺度时间与空间协同</h3>
              <p>在多尺度时间建模之外，显式学习测点之间的依赖，并融合时空特征。</p>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
