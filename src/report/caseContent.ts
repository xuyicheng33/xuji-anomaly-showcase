export const methods = [
  {
    id: 'replace' as const,
    name: '替换',
    copy: '用异常素材替代局部原值。',
    formula: '结果 = 异常素材',
  },
  {
    id: 'blend' as const,
    name: '混合',
    copy: '保留原始变化，按权重融入异常素材。',
    formula: '结果 = 原始值 × (1 − 权重) + 素材 × 权重',
  },
];
export const kinds = [
  {
    id: 'reference' as const,
    name: '参考片段',
    copy: '从真实记录中取出一段序列，翻转时间顺序与数值方向，形成不同的变化形态。',
    detail: '参考片段取自同一清洁测试集。先沿时间反转，再以 1 − 数值翻转幅值。',
  },
  {
    id: 'uniform' as const,
    name: '均匀值',
    copy: '为选定测点构造一个固定值，使局部波动形成持续平台。',
    detail: '区间内使用同一个构造值；替换形成平台，混合保留原曲线的部分波动。',
  },
  {
    id: 'peak' as const,
    name: '峰值噪声',
    copy: '在一个时刻构造方向相反的极值，并为相邻时刻生成异常标签。',
    detail: '原值较高时取接近 0 的值，原值较低时取接近 1 的值；前后各 4 点一并标记。',
  },
  {
    id: 'length' as const,
    name: '长度调整',
    copy: '将 8 个采样点各重复 3 次，形成 24 点素材，写入固定区间。',
    detail:
      '来源为第 19—26 点，重复采样后写入第 19—42 点，覆盖或混合该区间原值；第 43—64 点保留原来的位置与数值。',
  },
];
export const steps = ['原始片段', '异常素材', '插入过程', '标签结果'];
