import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConverterShowcaseData } from './types';
import { HomePortal } from './HomePortal';
import { DataOverview } from './DataOverview';
import { AnomalyStudio } from './AnomalyStudio';
import { ModelBenchmark } from './ModelBenchmark';
import { LiveDashboard } from './LiveDashboard';

const showcaseData = JSON.parse(readFileSync('public/data/converter_showcase.json', 'utf8')) as ConverterShowcaseData;

describe('Converter Editorial Showcase Suite', () => {
  it('validates converter showcase payload integrity', () => {
    expect(showcaseData.datasetMeta.totalSamples).toBe(7990);
    expect(showcaseData.datasetMeta.testSamples).toBe(2397);
    expect(showcaseData.times.length).toBe(2397);
    expect(showcaseData.labels.length).toBe(2397);
    expect(showcaseData.datasetMeta.totalAnomalousPoints).toBe(490);
    expect(showcaseData.anomalyStudio.length).toBe(8);
    expect(Object.keys(showcaseData.models)).toEqual(['STAM-AD', 'SMST-AD', 'STMem-AD']);
  });

  it('renders HomePortal with 4 core modules and key metrics', () => {
    const html = renderToStaticMarkup(<HomePortal data={showcaseData} onNavigate={() => {}} />);
    expect(html).toContain('特高压换流设备异常检测');
    expect(html).toContain('01');
    expect(html).toContain('测点数据');
    expect(html).toContain('02');
    expect(html).toContain('异常构造');
    expect(html).toContain('03');
    expect(html).toContain('模型评测');
    expect(html).toContain('04');
    expect(html).toContain('时序回放');
    expect(html).toContain('90.61%');
  });

  it('renders DataOverview correctly', () => {
    const html = renderToStaticMarkup(<DataOverview data={showcaseData} onBack={() => {}} />);
    expect(html).toContain('换流设备测点数据');
    expect(html).toContain('直流电压系统');
    expect(html).toContain('2,397 测试时刻连续波形');
  });

  it('renders AnomalyStudio with 8 standard scenarios and no emojis', () => {
    const html = renderToStaticMarkup(<AnomalyStudio data={showcaseData} onBack={() => {}} />);
    expect(html).toContain('异常形态构造');
    expect(html).toContain('软替换 · 训练动态');
    expect(html).toContain('均匀替换 · 训练动态');
    expect(html).toContain('峰值噪声 · 训练动态');
    expect(html).toContain('长度调整 · 训练动态');
    expect(html).not.toMatch(/[⚡🧪📊🟢🔴🟡🟣]/);
  });

  it('renders ModelBenchmark comparing all three models with editorial rigor', () => {
    const html = renderToStaticMarkup(<ModelBenchmark data={showcaseData} onBack={() => {}} />);
    expect(html).toContain('模型架构与评测指标');
    expect(html).toContain('STAM-AD');
    expect(html).toContain('SMST-AD');
    expect(html).toContain('STMem-AD');
    expect(html).toContain('90.61%');
    expect(html).toContain('89.78%');
    expect(html).toContain('72.69%');
    expect(html).not.toMatch(/[⚡🧪📊🟢🔴🟡🟣]/);
  });

  it('renders LiveDashboard server markup cleanly', () => {
    const html = renderToStaticMarkup(<LiveDashboard data={showcaseData} onBack={() => {}} />);
    expect(html).toContain('时序检测回放');
    expect(html).toContain('观测输入与模型重构波形');
    expect(html).toContain('单点综合异常得分与阈值');
    expect(html).toContain('混淆矩阵统计');
    expect(html).not.toMatch(/[⚡🧪📊🟢🔴🟡🟣]/);
  });
});
