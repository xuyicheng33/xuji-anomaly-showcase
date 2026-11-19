/**
 * Model structure redrawn from the report: figure 4-1 (STAM-AD) and figure 4-3 (SMST-AD).
 * Texts follow sections 2.3, 4.1, 4.2 and 4.4; experiment differences live on the notes page.
 */
export type Architecture = 'stam' | 'smst';
export type Phase = 'train' | 'test';
export type ModuleId =
  | 'input'
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
  | 'pot';
export type Visual = 'fft' | 'tcn' | 'causal' | 'multiscale' | 'loss' | 'spatial' | 'regularizer';

export type FigureNode = {
  key: string;
  module: ModuleId;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: 'series' | 'insert' | 'concat' | 'stack' | 'formula';
  /** Mini markup for a formula line under the title (see MathText). */
  formula?: string;
  /** Left side, numerator and denominator of a stacked fraction. */
  fraction?: [string, string, string];
  tone?: 'clay' | 'gray';
  trainOnly?: boolean;
  /** Present in SMST-AD and not in STAM-AD. */
  added?: boolean;
};
export type FigureRegion = {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  labelX: number;
  labelY: number;
  anchor?: 'start' | 'middle' | 'end';
  added?: boolean;
};
export type FigureEdge = { d: string; arrow?: boolean; tone?: 'clay' };
export type FigureText = {
  x: number;
  y: number;
  text: string;
  anchor?: 'start' | 'middle' | 'end';
};
export type Figure = {
  width: number;
  height: number;
  regions: FigureRegion[];
  nodes: FigureNode[];
  edges: FigureEdge[];
  texts: FigureText[];
  /** The loss node is replaced by the test-stage judgement node. */
  end: FigureNode;
};

const box = (
  key: string,
  module: ModuleId,
  label: string | string[],
  x: number,
  y: number,
  w: number,
  h = 48,
  extra: Partial<FigureNode> = {},
): FigureNode => ({
  key,
  module,
  lines: typeof label === 'string' ? [label] : label,
  x,
  y,
  w,
  h,
  ...extra,
});

/** Figure 4-1. */
const stam: Figure = {
  width: 1200,
  height: 488,
  regions: [
    {
      key: 'global',
      label: 'Global 分支',
      x: 460,
      y: 32,
      w: 500,
      h: 132,
      labelX: 710,
      labelY: 154,
      anchor: 'middle',
    },
    {
      key: 'local',
      label: 'Local 分支',
      x: 460,
      y: 272,
      w: 500,
      h: 128,
      labelX: 710,
      labelY: 390,
      anchor: 'middle',
    },
    {
      key: 'decoder',
      label: '解码器',
      x: 1040,
      y: 180,
      w: 160,
      h: 152,
      labelX: 1120,
      labelY: 322,
      anchor: 'middle',
    },
  ],
  nodes: [
    box('input', 'input', '时间序列', 0, 168, 104, 96, { shape: 'series' }),
    box('insert', 'insert', '异常插入模块', 132, 152, 136, 128, {
      shape: 'insert',
      tone: 'clay',
      trainOnly: true,
    }),
    box('mask', 'mask', ['自适应', '掩码'], 332, 64, 100, 64, { trainOnly: true }),
    box('gtcn', 'gtcn', 'Global TCN', 476, 72, 108),
    box('genc', 'encoder', 'Transformer Encoder', 604, 72, 168),
    box('gff', 'encoder', 'Feed Forward', 808, 72, 124),
    box('ltcn', 'ltcn', 'Local TCN', 476, 312, 108),
    box('lenc', 'encoder', 'Transformer Encoder', 604, 312, 168),
    box('lff', 'encoder', 'Feed Forward', 808, 312, 124),
    box('concat', 'concat', '⊕', 986, 202, 28, 28, { shape: 'concat' }),
    box('dff', 'decoder', 'Feed Forward', 1056, 194, 128, 44, { tone: 'gray' }),
    box('sigmoid', 'decoder', 'Sigmoid', 1072, 264, 96, 40),
    box('loss', 'loss', '有界异常损失', 940, 412, 260, 72, {
      shape: 'formula',
      formula: 'ℒ(W_t) = Σ_{k=1}^{K} ReLU(bound − y_k loss_k)',
      tone: 'clay',
      trainOnly: true,
    }),
  ],
  edges: [
    { d: 'M104 216 H132', arrow: true },
    { d: 'M268 216 H300' },
    { d: 'M300 96 V444 H940', arrow: true },
    { d: 'M300 96 H332', arrow: true },
    { d: 'M432 96 H476', arrow: true },
    { d: 'M584 96 H604', arrow: true },
    { d: 'M772 96 H808', arrow: true },
    { d: 'M790 96 V52 H950 V96', arrow: true },
    { d: 'M932 96 H1000 V202', arrow: true },
    { d: 'M300 336 H476', arrow: true },
    { d: 'M584 336 H604', arrow: true },
    { d: 'M772 336 H808', arrow: true },
    { d: 'M790 336 V292 H950 V336', arrow: true },
    { d: 'M932 336 H1000 V230', arrow: true },
    { d: 'M1014 216 H1056', arrow: true },
    { d: 'M1120 238 V264', arrow: true },
    { d: 'M1120 332 V412', arrow: true },
  ],
  texts: [{ x: 310, y: 240, text: '重叠窗口划分', anchor: 'start' }],
  end: box('pot', 'pot', '重建误差与 POT 阈值', 940, 412, 260, 72, {
    shape: 'formula',
    tone: 'clay',
    formula: '异常分数超过阈值判为异常',
  }),
};

/** Figure 4-3. */
const smst: Figure = {
  width: 1200,
  height: 700,
  regions: [
    {
      key: 'time',
      label: '时间分支',
      x: 316,
      y: 16,
      w: 704,
      h: 272,
      labelX: 1004,
      labelY: 276,
      anchor: 'end',
    },
    {
      key: 'spatial',
      label: '空间分支',
      x: 316,
      y: 332,
      w: 704,
      h: 128,
      labelX: 1004,
      labelY: 448,
      anchor: 'end',
      added: true,
    },
    {
      key: 'decoder',
      label: '解码器',
      x: 1068,
      y: 248,
      w: 132,
      h: 156,
      labelX: 1134,
      labelY: 394,
      anchor: 'middle',
    },
  ],
  nodes: [
    box('input', 'input', '时间序列', 0, 248, 104, 96, { shape: 'series' }),
    box('insert', 'insert', '异常插入模块', 132, 232, 136, 128, {
      shape: 'insert',
      tone: 'clay',
      trainOnly: true,
    }),
    box('mask', 'mask', ['自适应', '掩码'], 332, 40, 100, 64, { trainOnly: true }),
    box('gtcn', 'gtcn', 'Global TCN', 460, 48, 108),
    box('genc', 'encoder', 'Transformer Encoder', 588, 48, 168),
    box('gff', 'encoder', 'Feed Forward', 792, 48, 124),
    box('multiscale', 'multiscale', '多尺度 Local TCN 及独立编码器', 332, 132, 420, 128, {
      shape: 'stack',
      added: true,
    }),
    box('fusion', 'fusion', 'Fusion', 792, 172, 124, 48, { added: true }),
    box(
      'senc',
      'spatial',
      ['Feature Transformer Encoder', 'With Spatial Mask'],
      332,
      368,
      420,
      60,
      { added: true },
    ),
    box('sff', 'encoder', 'Feed Forward', 792, 374, 124, 48, { added: true }),
    box('attention', 'attention', '空间注意力', 332, 496, 420, 84, {
      shape: 'formula',
      formula: 'A_{spatial} = Softmax(QK^T / √d_k + log M_{spatial})',
      tone: 'clay',
      added: true,
    }),
    box('regularizer', 'regularizer', '异常感知正则项', 792, 496, 248, 84, {
      shape: 'formula',
      fraction: ['ℛ_{spatial} =', 'Σ_{i∈𝒜} Σ_{j∈𝒩} A(i, j)', 'Σ_{i∈𝒜} Σ_{j∈𝒜} A(i, j) + ε'],
      tone: 'clay',
      trainOnly: true,
      added: true,
    }),
    box('concat', 'concat', '⊕', 1030, 272, 28, 28, { shape: 'concat' }),
    box('dff', 'decoder', 'Feed Forward', 1078, 264, 112, 44, { tone: 'gray' }),
    box('sigmoid', 'decoder', 'Sigmoid', 1090, 334, 88, 40),
    box('loss', 'loss', '损失函数', 940, 612, 260, 80, {
      shape: 'formula',
      formula: 'Σ_k ReLU(bound − y_k l_k) + λℛ_{spatial}',
      tone: 'clay',
      trainOnly: true,
    }),
  ],
  edges: [
    { d: 'M104 296 H132', arrow: true },
    { d: 'M268 296 H300' },
    { d: 'M300 72 V664 H940', arrow: true },
    { d: 'M300 72 H332', arrow: true },
    { d: 'M432 72 H460', arrow: true },
    { d: 'M568 72 H588', arrow: true },
    { d: 'M756 72 H792', arrow: true },
    { d: 'M774 72 V30 H934 V72', arrow: true },
    { d: 'M916 72 H1044 V272', arrow: true },
    { d: 'M300 196 H332', arrow: true },
    { d: 'M752 196 H792', arrow: true },
    { d: 'M916 196 H1044' },
    { d: 'M300 398 H332', arrow: true },
    { d: 'M752 398 H792', arrow: true },
    { d: 'M774 398 V350 H934 V398', arrow: true },
    { d: 'M916 398 H1044 V300', arrow: true },
    { d: 'M1058 286 H1078', arrow: true },
    { d: 'M1134 308 V334', arrow: true },
    { d: 'M542 428 V496', arrow: true, tone: 'clay' },
    { d: 'M752 538 H792', arrow: true, tone: 'clay' },
    { d: 'M916 580 V626 H940', arrow: true, tone: 'clay' },
    { d: 'M1134 404 V612', arrow: true },
  ],
  texts: [{ x: 310, y: 320, text: '重叠窗口划分', anchor: 'start' }],
  end: box('pot', 'pot', '重建误差与 POT 阈值', 940, 612, 260, 80, {
    shape: 'formula',
    tone: 'clay',
    formula: '异常分数超过阈值判为异常',
  }),
};
export const figures: Record<Architecture, Figure> = { stam, smst };

/** Narrow screens show the same modules as grouped rows; parallel branches share one rail. */
export type FlowGroup = { key: string; label?: string; rows: string[][]; added?: boolean };
export type FlowStep = FlowGroup | { key: string; parallel: FlowGroup[] };
export const flows: Record<Architecture, FlowStep[]> = {
  stam: [
    { key: 'input', rows: [['input', 'insert']] },
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
    { key: 'input', rows: [['input', 'insert']] },
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
        paragraphs: [
          `多变量时间序列按滑动窗口划分为重叠窗口后输入模型。当前数据每个窗口 ${window} 个时刻、${features} 个测点。`,
        ],
      };
    case 'insert':
      return {
        title: '异常插入模块',
        paragraphs: [
          '先将序列划分为不重叠窗口，按概率随机选取部分窗口；在选中的窗口中确定异常类型、维度、长度和起始位置并构造异常，再按原顺序拼接回完整序列，生成带伪标签的增强数据。',
          '每个训练轮次开始时重新插入一组异常。测试阶段不经过此模块。',
        ],
      };
    case 'mask':
      return {
        title: '自适应掩码',
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
        paragraphs: [
          '采用因果空洞卷积，空洞率逐层按指数增长，感受野随层数成倍扩大，直至覆盖整个窗口，用于建模长期时间依赖。',
          '所有窗口共享卷积核参数，输出与输入维度一致。',
        ],
        visual: 'tcn',
      };
    case 'encoder':
      return {
        title: '编码器',
        paragraphs: [
          '由单层 Transformer Encoder、前馈网络及残差连接构成。窗口内先加入正弦-余弦位置编码，再执行多头自注意力，经残差连接与层归一化得到中间表示。',
          '前馈网络含两层全连接层与 LeakyReLU 激活，最后通过残差连接输出。单层编码器在保持较低复杂度的同时捕捉序列中的关键依赖。',
        ],
      };
    case 'ltcn':
      return {
        title: 'Local TCN',
        paragraphs: [
          '对每个窗口做因果卷积，时刻 t 的输出只依赖 t 及之前的输入，左侧零填充使输出长度不变。',
          '采用浅层结构，专注短期局部特征；长期依赖由 Global TCN 负责，二者形成层次化分工。',
        ],
        visual: 'causal',
      };
    case 'multiscale':
      return {
        title: '多尺度 Local TCN 及独立编码器',
        paragraphs: [
          '对每个窗口并行构建若干具有不同空洞率的因果空洞卷积子分支：较小空洞率捕捉细粒度突变，较大空洞率感知更宽的上下文。',
          '各尺度特征分别送入独立的 Transformer Encoder，避免多尺度特征在共享注意力空间中发生表示坍缩。',
        ],
        visual: 'multiscale',
      };
    case 'fusion':
      return {
        title: 'Fusion',
        paragraphs: [
          '所有尺度的编码特征在通道维度拼接并线性融合。多尺度 Local 分支与 Global 分支形成层次化互补的时间依赖建模，覆盖从细粒度到粗粒度的时间范围。',
        ],
      };
    case 'spatial':
      return {
        title: '带空间掩码的特征 Transformer Encoder',
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
        paragraphs: [
          '空间掩码以对数形式加入注意力得分。掩码值为 0 时，对应得分在 Softmax 后趋近于 0，显式屏蔽弱相关变量之间的连接。',
        ],
        formulas: ['A_{spatial} = Softmax(QK^T / √d_k + log M_{spatial})'],
        visual: 'spatial',
      };
    case 'regularizer':
      return {
        title: '异常感知正则项',
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
            paragraphs: [
              '空间分支输出与时间分支输出拼接，经线性映射与非线性激活组成的融合变换后送入重建网络，以重建误差作为异常判别的核心依据。',
            ],
          }
        : {
            title: '特征拼接',
            paragraphs: [
              'Global 分支与 Local 分支的编码结果拼接后，由共享解码器对时间窗口进行重建。',
            ],
          };
    case 'decoder':
      return {
        title: '解码器',
        paragraphs: [
          '复杂解码器容易对异常样本过度重建，削弱重建误差的判别作用。解码器采用结构简洁的前向全连接网络与 Sigmoid 激活。',
          '轻量化解码器在保持异常敏感性的同时，避免对异常样本的补偿性重构。',
        ],
      };
    case 'loss':
      return smstModel
        ? {
            title: '损失函数',
            paragraphs: [
              '训练时联合优化有界异常损失与异常感知空间正则项，λ 为正则项系数。',
              '正常时刻持续压缩重建误差；异常时刻把误差推高到上界 bound 为止，到达后梯度归零。',
            ],
            formulas: ['ℒ = Σ_k ReLU(bound − y_k l_k) + λℛ_{spatial}'],
            visual: 'loss',
          }
        : {
            title: '有界异常损失',
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
        node: 'gtcn',
      },
      {
        problem: '短期局部依赖',
        design: 'Local 分支',
        text: '因果卷积 TCN 与 Transformer 编码器捕捉短期局部依赖。',
        node: 'ltcn',
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
        node: 'senc',
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
