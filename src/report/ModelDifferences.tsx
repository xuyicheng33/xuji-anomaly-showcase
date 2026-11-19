import type { Journey } from '../journey';
import { availableMethods } from '../resultCatalog';

/** Where the retained experiment differs from the report's model description. */
export default function ModelDifferences({ data }: { data: Journey }) {
  const temporalDecoders = (data.methodResults ?? [])
    .filter((method) => method.id === 'model2' && method.decoder === 'temporal')
    .map((method) => method.name);
  const legacySmst =
    !data.methodResults && availableMethods(data).some((method) => method.id === 'model2');
  return (
    <>
      <p>
        模型页按报告第 4
        章的结构图与说明展示。网站中的窗口、分数与评估来自保留的实验实现，与报告有以下出入：
      </p>
      <ul>
        <li>
          报告的 Global
          分支按各维度主导周期生成自适应掩码；保留实现在每个测点连续遮蔽窗口长度四分之一的时刻，掩码固定并保存。
        </li>
        <li>报告在测试阶段不做掩码；保留结果导出窗口时沿用固定掩码。</li>
        {(temporalDecoders.length > 0 || legacySmst) && (
          <li>
            报告的 SMST-AD
            解码器融合时间与空间特征；保留实现由时间融合特征生成重建，空间分支计算注意力与空间正则。
          </li>
        )}
        <li>报告以 POT 确定阈值；网站使用扫描选出的阈值，见阈值与评估规则。</li>
      </ul>
    </>
  );
}
