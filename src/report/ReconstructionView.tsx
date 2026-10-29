import Curve from './Curve';
import { colors } from './ReportUI';
import type { PlaybackScale } from './usePlaybackScale';

export default function ReconstructionView({
  input,
  recon,
  aggregate,
  labels,
  selected,
  reveal,
  start = 0,
  onSelect,
  compact = false,
  playbackScale,
}: {
  input: number[];
  recon?: number[];
  aggregate: boolean;
  labels: number[];
  selected?: number;
  reveal?: number;
  start?: number;
  onSelect?: (n: number) => void;
  compact?: boolean;
  playbackScale?: PlaybackScale;
}) {
  return (
    <div className={'reconstruction-view' + (aggregate ? ' aggregate-view' : '')}>
      <Curve
        title={aggregate ? '125 测点平均曲线' : '测点输入与重建'}
        note={compact ? 'window-aggregation' : 'score-calculation'}
        reference={'ref-' + (compact ? 'playback' : 'detection') + '-reconstruction'}
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
        selected={selected}
        reveal={reveal}
        start={start}
        onSelect={onSelect}
        height={compact ? 145 : 220}
        playbackScale={playbackScale}
      />
    </div>
  );
}
