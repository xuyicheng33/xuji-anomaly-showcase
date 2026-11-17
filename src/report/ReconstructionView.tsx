import Curve from './Curve';
import { colors } from './ReportUI';
import type { PlaybackScale } from './usePlaybackScale';

export default function ReconstructionView({
  input,
  recon,
  aggregate,
  labels,
  labelKey,
  selected,
  reveal,
  start = 0,
  onSelect,
  compact = false,
  playbackScale,
  features,
  height,
}: {
  input: number[];
  recon?: number[];
  aggregate: boolean;
  labels: number[];
  labelKey?: string;
  selected?: number;
  reveal?: number;
  start?: number;
  onSelect?: (n: number) => void;
  compact?: boolean;
  playbackScale?: PlaybackScale;
  features: number;
  height?: number;
}) {
  return (
    <div className={'reconstruction-view' + (aggregate ? ' aggregate-view' : '')}>
      <Curve
        title={aggregate ? `${features} 测点平均曲线` : '测点输入与重建'}
        lines={[
          { name: aggregate ? '平均输入' : '测试输入', values: input, color: colors.input },
          ...(recon
            ? [
                {
                  name: aggregate ? '平均重建' : '模型重建',
                  values: recon,
                  color: colors.recon,
                  dash: true,
                },
              ]
            : []),
        ]}
        labels={labels}
        labelKey={labelKey}
        selected={selected}
        reveal={reveal}
        start={start}
        onSelect={onSelect}
        height={height ?? (compact ? 145 : 220)}
        playbackScale={playbackScale}
      />
    </div>
  );
}
