import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConverterShowcaseData } from './types';
import { LiveDashboard } from './LiveDashboard';
import { AnomalyStudio } from './AnomalyStudio';
import { ModelBenchmark } from './ModelBenchmark';

const showcaseData = JSON.parse(readFileSync('public/data/converter_showcase.json', 'utf8')) as ConverterShowcaseData;

describe('Converter Showcase Suite', () => {
  it('validates converter showcase payload integrity', () => {
    expect(showcaseData.datasetMeta.totalSamples).toBe(7990);
    expect(showcaseData.datasetMeta.testSamples).toBe(2397);
    expect(showcaseData.times.length).toBe(2397);
    expect(showcaseData.labels.length).toBe(2397);
    expect(showcaseData.datasetMeta.totalAnomalousPoints).toBe(490);
    expect(showcaseData.anomalyStudio.length).toBe(8);
    expect(Object.keys(showcaseData.models)).toEqual(['STAM-AD', 'SMST-AD', 'STMem-AD']);
  });

  it('renders LiveDashboard server markup correctly', () => {
    const html = renderToStaticMarkup(<LiveDashboard data={showcaseData} />);
    expect(html).toContain('测点时序波形通道');
    expect(html).toContain('综合异常分数与自适应判定通道');
    expect(html).toContain('动态累加评测指标');
    expect(html).toContain('实时混淆矩阵 (Confusion Matrix)');
    expect(html).toContain('真实故障段定位器');
    expect(html).toContain('SPOT 自适应阈值');
  });

  it('renders AnomalyStudio with 8 standard scenarios', () => {
    const html = renderToStaticMarkup(<AnomalyStudio data={showcaseData} />);
    expect(html).toContain('8 类标准异常构造组合 (4类形态 × 2种时机)');
    expect(html).toContain('软替换 · 训练动态');
    expect(html).toContain('均匀替换 · 训练动态');
    expect(html).toContain('峰值噪声 · 训练动态');
    expect(html).toContain('长度调整 · 训练动态');
    expect(html).toContain('特高压换流设备物理映射');
    expect(html).toContain('生成变换公式');
  });

  it('renders ModelBenchmark comparing all three models', () => {
    const html = renderToStaticMarkup(<ModelBenchmark data={showcaseData} />);
    expect(html).toContain('三种模型在换流设备测试集全量评测结果');
    expect(html).toContain('STAM-AD');
    expect(html).toContain('SMST-AD');
    expect(html).toContain('STMem-AD');
    expect(html).toContain('90.61%'); // SMST-AD F1
    expect(html).toContain('89.78%'); // STAM-AD F1
    expect(html).toContain('72.69%'); // STMem-AD F1
    expect(html).toContain('点调整机制 (Point-Adjust)');
  });
});
