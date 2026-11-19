/**
 * Model structure from the report: figure 4-1 (STAM-AD) and figure 4-3 (SMST-AD) are shown as
 * the original images, with clickable areas measured in image pixels.
 * Texts follow sections 2.3, 3.3, 4.1, 4.2 and 4.4; experiment differences live on the notes page.
 */
import figure41 from './figures/report-figure-4-1.png';
import figure43 from './figures/report-figure-4-3.png';

export type Architecture = 'stam' | 'smst';
export type Phase = 'train' | 'test';
export type ModuleId =
  | 'input'
  | 'window'
  | 'insert'
  | 'mask'
  | 'gtcn'
  | 'encoder'
  | 'ltcn'
  | 'multiscale'
  | 'fusion'
  | 'spatial'
  | 'attention'
  | 'regularizer'
  | 'concat'
  | 'decoder'
  | 'loss'
  | 'pot'
  | 'globalBranch'
  | 'localBranch'
  | 'timeBranch'
  | 'spatialBranch';
export type Visual = 'fft' | 'tcn' | 'causal' | 'multiscale' | 'loss' | 'spatial' | 'regularizer';

/** x, y, width, height in pixels of the report image. */
export type Box = [number, number, number, number];
export type FigureNode = {
  key: string;
  module: ModuleId;
  lines: string[];
  /** The first box takes focus; further boxes belong to the same module in the image. */
  boxes: Box[];
  /** Nodes sharing a group light up together, such as an encoder and its feed-forward block. */
  group?: string;
  /** Branch backgrounds sit under the module areas. */
  branch?: boolean;
  tone?: 'clay' | 'gray';
  trainOnly?: boolean;
  /** Present in SMST-AD and not in STAM-AD. */
  added?: boolean;
};
export type Figure = {
  src: string;
  number: string;
  caption: string;
  width: number;
  height: number;
  nodes: FigureNode[];
  /** In the test stage the loss is replaced by the threshold judgement, in the same place. */
  end: FigureNode;
};

const node = (
  key: string,
  module: ModuleId,
  label: string | string[],
  boxes: Box[],
  extra: Partial<FigureNode> = {},
): FigureNode => ({
  key,
  module,
  lines: typeof label === 'string' ? [label] : label,
  boxes,
  ...extra,
});

/** Figure 4-1, 1377 × 704. Listed in data-flow order, which is also the keyboard order. */
const stam: Figure = {
  src: figure41,
  number: '图 4-1',
  caption: '基于自适应掩码和有界异常损失的自监督 TCN-Transformer 异常检测框架',
  width: 1377,
  height: 704,
  nodes: [
    node('global-branch', 'globalBranch', 'Global 分支', [[787, 215, 379, 99]], { branch: true }),
    node('local-branch', 'localBranch', 'Local 分支', [[787, 458, 387, 97]], { branch: true }),
    node('input', 'input', '时间序列', [[4, 350, 186, 130]]),
    node('insert', 'insert', '异常插入模块', [[198, 170, 192, 430]], {
      tone: 'clay',
      trainOnly: true,
    }),
    node('window', 'window', '重叠窗口划分', [
      [390, 356, 78, 60],
      [596, 215, 156, 130],
      [596, 458, 156, 130],
    ]),
    node(
      'mask',
      'mask',
      ['自适应', '掩码'],
      [
        [496, 239, 79, 53],
        [466, 13, 578, 182],
      ],
      { trainOnly: true },
    ),
    node('gtcn', 'gtcn', 'Global TCN', [[804, 239, 80, 53]]),
    node('genc', 'encoder', 'Transformer Encoder', [[903, 239, 124, 53]], { group: 'genc' }),
    node('gff', 'encoder', 'Feed Forward', [[1050, 239, 95, 53]], { group: 'genc' }),
    node('ltcn', 'ltcn', 'Local TCN', [[809, 481, 76, 53]]),
    node('lenc', 'encoder', 'Transformer Encoder', [[903, 481, 124, 53]], { group: 'lenc' }),
    node('lff', 'encoder', 'Feed Forward', [[1052, 481, 94, 53]], { group: 'lenc' }),
    node('concat', 'concat', '拼接', [[1188, 368, 40, 40]]),
    node('dff', 'decoder', 'Feed Forward', [[1255, 361, 92, 52]], {
      group: 'decoder',
      tone: 'gray',
    }),
    node('sigmoid', 'decoder', 'Sigmoid', [[1258, 427, 87, 43]], { group: 'decoder' }),
    node('loss', 'loss', '有界异常损失', [[1045, 580, 324, 110]], {
      tone: 'clay',
      trainOnly: true,
    }),
  ],
  end: node('pot', 'pot', '重建误差与 POT 阈值', [[1045, 580, 324, 110]], { tone: 'clay' }),
};

/** Figure 4-3, 1375 × 843. */
const smst: Figure = {
  src: figure43,
  number: '图 4-3',
  caption: '多尺度时空依赖建模的自监督 TCN-Transformer 异常检测框架',
  width: 1375,
  height: 843,
  nodes: [
    node('time-branch', 'timeBranch', '时间分支', [[490, 14, 592, 330]], { branch: true }),
    node('spatial-branch', 'spatialBranch', '空间分支', [[490, 393, 592, 147]], {
      branch: true,
      added: true,
    }),
    node('input', 'input', '时间序列', [[30, 292, 142, 140]]),
    node('insert', 'insert', '异常插入', [[176, 290, 198, 120]], {
      tone: 'clay',
      trainOnly: true,
    }),
    node('window', 'window', '重叠窗口划分', [[372, 338, 82, 48]]),
    node('mask', 'mask', ['自适应', '掩码'], [[519, 66, 81, 57]], { trainOnly: true }),
    node('gtcn', 'gtcn', 'Global TCN', [[619, 66, 81, 57]]),
    node('genc', 'encoder', 'Transformer Encoder', [[715, 66, 125, 57]], { group: 'genc' }),
    node('gff', 'encoder', 'Feed Forward', [[868, 66, 97, 57]], { group: 'genc' }),
    node('multiscale', 'multiscale', '多尺度 Local TCN 及独立编码器', [[518, 167, 322, 160]], {
      added: true,
    }),
    node('fusion', 'fusion', 'Fusion', [[870, 224, 80, 46]], { added: true }),
    node(
      'senc',
      'spatial',
      ['Feature Transformer Encoder', 'With Spatial Mask'],
      [[550, 442, 272, 62]],
      { added: true },
    ),
    node('sff', 'encoder', 'Feed Forward', [[868, 444, 93, 58]], { added: true }),
    node('attention', 'attention', '空间注意力', [[524, 545, 345, 92]], {
      tone: 'clay',
      added: true,
    }),
    node('regularizer', 'regularizer', '异常感知正则项', [[926, 616, 346, 102]], {
      tone: 'clay',
      trainOnly: true,
      added: true,
    }),
    node('concat', 'concat', '拼接', [[1178, 344, 38, 38]]),
    node('dff', 'decoder', 'Feed Forward', [[1243, 330, 112, 50]], {
      group: 'decoder',
      tone: 'gray',
    }),
    node('sigmoid', 'decoder', 'Sigmoid', [[1246, 400, 106, 54]], { group: 'decoder' }),
    node('loss', 'loss', '损失函数', [[1019, 737, 346, 94]], { tone: 'clay', trainOnly: true }),
  ],
  end: node('pot', 'pot', '重建误差与 POT 阈值', [[1019, 737, 346, 94]], { tone: 'clay' }),
};
export const figures: Record<Architecture, Figure> = { stam, smst };

/** Narrow screens show the same modules as grouped rows; parallel branches share one rail. */
export type FlowGroup = { key: string; label?: string; rows: string[][]; added?: boolean };
export type FlowStep = FlowGroup | { key: string; parallel: FlowGroup[] };
export const flows: Record<Architecture, FlowStep[]> = {
  stam: [
    { key: 'input', rows: [['input', 'insert', 'window']] },
    {
      key: 'branches',
      parallel: [
        { key: 'global', label: 'Global 分支', rows: [['mask', 'gtcn', 'genc', 'gff']] },
        { key: 'local', label: 'Local 分支', rows: [['ltcn', 'lenc', 'lff']] },
      ],
    },
    { key: 'decoder', label: '拼接与解码器', rows: [['concat', 'dff', 'sigmoid']] },
    { key: 'loss', rows: [['loss']] },
  ],
  smst: [
    { key: 'input', rows: [['input', 'insert', 'window']] },
    {
      key: 'branches',
      parallel: [
        {
          key: 'time',
          label: '时间分支',
          rows: [
            ['mask', 'gtcn', 'genc', 'gff'],
            ['multiscale', 'fusion'],
          ],
        },
        {
          key: 'spatial',
          label: '空间分支',
          rows: [
            ['senc', 'sff'],
            ['attention', 'regularizer'],
          ],
          added: true,
        },
      ],
    },
    { key: 'decoder', label: '拼接与解码器', rows: [['concat', 'dff', 'sigmoid']] },
    { key: 'loss', rows: [['loss']] },
  ],
};

export type Formula = string | { lhs: string; num: string; den: string; rhs?: string };
export type ModuleText = {
  title: string;
  /** One line for the model page; the paragraphs carry the report text to the notes page. */
  role: string;
  paragraphs: string[];
  formulas?: Formula[];
  visual?: Visual;
};
type Context = { window: number; features: number };

export function moduleText(
  id: ModuleId,
  architecture: Architecture,
  { window, features }: Context,
): ModuleText {
  const smstModel = architecture === 'smst';
  switch (id) {
    case 'input':
      return {
        title: '时间序列',
        role: '多变量时间序列，每个测点是一个维度。',
        paragraphs: ['多变量时间序列由各测点按时间对齐组成，模型以重叠窗口为单位读取。'],
      };
    case 'window':
      return {
        title: '重叠窗口划分',
        role: `以步长 1 滑动切分，当前每个窗口 ${window} 个时刻、${features} 个测点。`,
        paragraphs: [
          '插入异常后的序列被划分为重叠的时间窗口，再输入模型主体。窗口以步长 1 滑动，同一时刻会出现在多个窗口中。',
          '测试阶段按时间点被覆盖的次数，对各窗口的重建误差取平均。',
        ],
      };
    case 'globalBranch':
      return {
        title: 'Global 分支',
        role: '自适应掩码、Global TCN 与编码器组成，建模长期依赖与全局模式。',
        paragraphs: [
          '具有自适应掩码的 Global 分支主要由自适应掩码模块、Global TCN、编码器组成。自适应掩码模块对各维度独立分析，在保留周期结构的同时抑制噪声，使 Global 分支更聚焦于全局依赖特征。',
        ],
      };
    case 'localBranch':
      return {
        title: 'Local 分支',
        role: 'Local TCN 与编码器组成，捕捉短期局部动态。',
        paragraphs: [
          'Local 分支由 Local TCN 和编码器组成，编码器结构与 Global 分支一致。Local TCN 专注局部短期特征，长期依赖由 Global TCN 负责。',
        ],
      };
    case 'timeBranch':
      return {
        title: '时间分支',
        role: 'Global 分支与多尺度 Local 分支组成，覆盖从细到粗的时间粒度。',
        paragraphs: [
          '多尺度 Local 分支与具备自适应掩码机制的 Global 分支封装为统一的时间分支，覆盖时间轴从细粒度到粗粒度的范围，兼顾长期趋势与短期突变。',
        ],
      };
    case 'spatialBranch':
      return {
        title: '空间分支',
        role: '带空间掩码的特征编码器与异常感知正则项组成，补充测点之间的依赖。',
        paragraphs: [
          '空间分支作为时间分支的结构性补充，由基于掩码注意力的特征 Transformer Encoder 和异常感知空间正则项组成，为重建提供变量层面的依赖信息。',
        ],
      };
    case 'insert':
      return {
        title: '异常插入模块',
        role: '在训练序列中构造伪异常并生成标签，只在训练阶段使用。',
        paragraphs: [
          '先将序列划分为不重叠窗口，按概率随机选取部分窗口；在选中的窗口中确定异常类型、维度、长度和起始位置并构造异常，再按原顺序拼接回完整序列，生成带伪标签的增强数据。',
          '每个训练轮次开始时重新插入一组异常。测试阶段不经过此模块。',
        ],
      };
    case 'mask':
      return {
        title: '自适应掩码',
        role: '按各维度的主导周期生成掩码，保留周期信息并抑制噪声。',
        paragraphs: [
          '对每个维度分别做快速傅里叶变换，构建跨窗口的频率相似性，选出该维度最主要、最稳定的周期成分，并据此为每个单变量窗口生成由 0 和 1 组成的掩码，与窗口逐元素相乘。',
          '掩码在保留周期结构的同时抑制噪声，使 Global 分支更专注于体现全局信息的时段。测试阶段不做掩码。',
        ],
        formulas: [
          'f_i = Amp(FFT(W_i)),  i ∈ [1, C]',
          { lhs: 'S_i(a, b) =', num: '⟨f_i^a, f_i^b⟩', den: '‖f_i^a‖_2 ‖f_i^b‖_2' },
          'W̃_i^{(t)} = M_i^{(t)} ⊙ W_i^{(t)}',
        ],
        visual: 'fft',
      };
    case 'gtcn':
      return {
        title: 'Global TCN',
        role: '因果空洞卷积逐层扩大感受野，建模长期依赖。',
        paragraphs: [
          '采用因果空洞卷积，空洞率逐层按指数增长，感受野随层数成倍扩大，直至覆盖整个窗口，用于建模长期时间依赖。',
          '所有窗口共享卷积核参数，输出与输入维度一致。',
        ],
        visual: 'tcn',
      };
    case 'encoder':
      return {
        title: '编码器',
        role: '单层 Transformer Encoder 与前馈网络、残差连接，编码窗口内的依赖。',
        paragraphs: [
          '由单层 Transformer Encoder、前馈网络及残差连接构成。窗口内先加入正弦-余弦位置编码，再执行多头自注意力，经残差连接与层归一化得到中间表示。',
          '前馈网络含两层全连接层与 LeakyReLU 激活，最后通过残差连接输出。单层编码器在保持较低复杂度的同时捕捉序列中的关键依赖。',
        ],
      };
    case 'ltcn':
      return {
        title: 'Local TCN',
        role: '浅层因果卷积，捕捉短期局部依赖。',
        paragraphs: [
          '对每个窗口做因果卷积，时刻 t 的输出只依赖 t 及之前的输入，左侧零填充使输出长度不变。',
          '采用浅层结构，专注短期局部特征；长期依赖由 Global TCN 负责，二者形成层次化分工。',
        ],
        visual: 'causal',
      };
    case 'multiscale':
      return {
        title: '多尺度 Local TCN 及独立编码器',
        role: '不同空洞率的因果空洞卷积并行，各配独立编码器，建模多粒度局部依赖。',
        paragraphs: [
          '对每个窗口并行构建若干具有不同空洞率的因果空洞卷积子分支：较小空洞率捕捉细粒度突变，较大空洞率感知更宽的上下文。',
          '各尺度特征分别送入独立的 Transformer Encoder，避免多尺度特征在共享注意力空间中发生表示坍缩。',
        ],
        visual: 'multiscale',
      };
    case 'fusion':
      return {
        title: 'Fusion',
        role: '多尺度特征在通道维度拼接后线性融合。',
        paragraphs: [
          '所有尺度的编码特征在通道维度拼接并线性融合。多尺度 Local 分支与 Global 分支形成层次化互补的时间依赖建模，覆盖从细粒度到粗粒度的时间范围。',
        ],
      };
    case 'spatial':
      return {
        title: '带空间掩码的特征 Transformer Encoder',
        role: '在测点维度上做自注意力，用相关性掩码限定注意范围。',
        paragraphs: [
          '将时间窗口转置，在变量维度上执行空间自注意力，显式刻画测点之间的依赖。',
          '基于训练集正常数据计算变量间的 Pearson 相关系数矩阵，相关性超过阈值 τ 的变量对才保留注意力，其余连接被屏蔽。掩码在训练与测试中保持固定，为空间注意力提供稳定的结构先验。',
        ],
        formulas: ['M_{spatial}(i, j) = I(|C_{stable}(i, j)| > τ)'],
        visual: 'spatial',
      };
    case 'attention':
      return {
        title: '空间注意力',
        role: '空间掩码以对数形式加入注意力得分，屏蔽弱相关测点之间的连接。',
        paragraphs: [
          '空间掩码以对数形式加入注意力得分。掩码值为 0 时，对应得分在 Softmax 后趋近于 0，显式屏蔽弱相关变量之间的连接。',
        ],
        formulas: ['A_{spatial} = Softmax(QK^T / √d_k + log M_{spatial})'],
        visual: 'spatial',
      };
    case 'regularizer':
      return {
        title: '异常感知正则项',
        role: '约束异常测点向正常测点的注意力扩散。',
        paragraphs: [
          '借助异常插入得到的伪标签，把变量分为异常集合 𝒜 与正常集合 𝒩。正则项是异常变量对正常变量的注意力相对异常变量内部注意力的比例。',
          '最小化该项可抑制异常变量向正常变量的注意力扩散，防止异常特征在空间加权中被稀释，使空间注意力集中于异常变量内部的关联。',
        ],
        formulas: [
          {
            lhs: 'ℛ_{spatial} =',
            num: 'Σ_{i∈𝒜} Σ_{j∈𝒩} A_{spatial}(i, j)',
            den: 'Σ_{i∈𝒜} Σ_{j∈𝒜} A_{spatial}(i, j) + ε',
          },
        ],
        visual: 'regularizer',
      };
    case 'concat':
      return smstModel
        ? {
            title: '时空特征融合',
            role: '拼接时间分支与空间分支的特征，送入解码器重建。',
            paragraphs: [
              '空间分支输出与时间分支输出拼接，经线性映射与非线性激活组成的融合变换后送入重建网络，以重建误差作为异常判别的核心依据。',
            ],
          }
        : {
            title: '特征拼接',
            role: '拼接 Global 分支与 Local 分支的编码结果，送入共享解码器。',
            paragraphs: [
              'Global 分支与 Local 分支的编码结果拼接后，由共享解码器对时间窗口进行重建。',
            ],
          };
    case 'decoder':
      return {
        title: '解码器',
        role: '前向全连接网络加 Sigmoid 的轻量解码器，避免把异常重建得过好。',
        paragraphs: [
          '复杂解码器容易对异常样本过度重建，削弱重建误差的判别作用。解码器采用结构简洁的前向全连接网络与 Sigmoid 激活。',
          '轻量化解码器在保持异常敏感性的同时，避免对异常样本的补偿性重构。',
        ],
      };
    case 'loss':
      return smstModel
        ? {
            title: '损失函数',
            role: '有界异常损失加异常感知空间正则项，λ 为正则项系数。',
            paragraphs: [
              '训练时联合优化有界异常损失与异常感知空间正则项，λ 为正则项系数。',
              '正常时刻持续压缩重建误差；异常时刻把误差推高到上界 bound 为止，到达后梯度归零。',
            ],
            formulas: ['ℒ = Σ_k ReLU(bound − y_k l_k) + λℛ_{spatial}'],
            visual: 'loss',
          }
        : {
            title: '有界异常损失',
            role: '正常时刻持续压缩重建误差，异常时刻把误差推到 bound 为止。',
            paragraphs: [
              '利用插入异常生成的伪标签指导训练：使正常样本的重建误差最小，同时让异常样本的误差保持在较高水平。标签转换为正常 −1、异常 1。',
              '正常时刻损失为 ReLU(bound + loss)，梯度恒为 1，持续压缩重建误差；异常时刻损失为 ReLU(bound − loss)，误差低于 bound 时推动误差增大，达到 bound 后梯度归零，避免损失无限放大导致训练不稳定。',
            ],
            formulas: [
              { lhs: 'loss_k =', num: '1', den: 'C', rhs: 'Σ_{c=1}^{C} (x_{k,c} − x̂_{k,c})^2' },
              'ℒ(W_t) = Σ_{k=1}^{K} ReLU(bound − y_k loss_k)',
            ],
            visual: 'loss',
          };
    case 'pot':
      return {
        title: '重建误差与 POT 阈值',
        role: '窗口误差平均成逐点异常分数，超过 POT 阈值的时刻判为异常。',
        paragraphs: [
          '测试阶段模型不再更新。窗口重建误差按时间点的覆盖次数平均，再在全部特征上取平均，得到每个时间点的异常分数。',
          '用训练集异常分数拟合 POT 阈值：先取 99% 分位作为初始阈值，用广义帕累托分布拟合超出量的尾部，再按目标置信水平反推最终阈值。超过阈值的时刻判为异常。',
        ],
      };
  }
}

/** Report 2.3: each design answers one modelling problem. */
export const designRows: Record<
  Architecture,
  { lead: string; rows: { problem: string; design: string; text: string; node: string }[] }
> = {
  stam: {
    lead: '基于异常数据增强与区分学习的自监督范式，采用 Global / Local 双分支架构。',
    rows: [
      {
        problem: '长期依赖',
        design: 'Global 分支',
        text: '因果空洞 TCN 与 Transformer 编码器建模长期依赖。',
        node: 'global-branch',
      },
      {
        problem: '短期局部依赖',
        design: 'Local 分支',
        text: '因果卷积 TCN 与 Transformer 编码器捕捉短期局部依赖。',
        node: 'local-branch',
      },
      {
        problem: 'Global 分支易受噪声干扰',
        design: '自适应掩码',
        text: '分析各维度周期性，生成维度自适应的掩码，保留周期信息并抑制噪声。',
        node: 'mask',
      },
      {
        problem: '插入异常后正常与异常的边界难以学习',
        design: '有界异常损失',
        text: '最小化正常样本重建误差，同时对异常样本误差施加有界约束，避免训练不稳定。',
        node: 'loss',
      },
    ],
  },
  smst: {
    lead: '在 STAM-AD 基础上，从时空依赖建模的角度扩展。',
    rows: [
      {
        problem: '单一尺度 Local 分支难以刻画复杂短期依赖',
        design: '多尺度 Local 分支',
        text: '不同空洞率的因果空洞 TCN 与尺度独立的 Transformer 编码器并行建模不同时间粒度。',
        node: 'multiscale',
      },
      {
        problem: '双分支架构对空间依赖挖掘不足',
        design: '空间分支',
        text: '在变量维度上施加注意力，显式建模测点之间的空间依赖。',
        node: 'spatial-branch',
      },
      {
        problem: '空间注意力易受噪声干扰',
        design: '相关性引导的空间掩码',
        text: '用变量间长期相关性约束注意力范围。',
        node: 'attention',
      },
      {
        problem: '异常特征易在空间加权中被稀释',
        design: '异常感知正则项',
        text: '约束异常维度之间的注意力集中。',
        node: 'regularizer',
      },
    ],
  },
};

/** Figure captions, split into phrases that wide layouts keep on one line. */
export const fullNames: Record<Architecture, string[]> = {
  stam: ['基于自适应掩码和有界异常损失的', '自监督 TCN-Transformer', ' ', '异常检测框架'],
  smst: ['多尺度时空依赖建模的', '自监督 TCN-Transformer', ' ', '异常检测框架'],
};
