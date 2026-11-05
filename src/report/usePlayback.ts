import { useEffect, useMemo, useState } from 'react';
import { displaySettings } from '../dataGeometry';
import { metricPrefixes, outcomeCode, type OutcomeCode } from '../journey';
import { usePauseOnNavigation } from './notes';
import type { PlaybackProps } from './detectionTypes';

/** Playback timing, selection and accumulated metrics share one clock. */
export function usePlayback(p: PlaybackProps) {
  const { data, model, start, viewFeature, setFeature, setViewFeature } = p;
  const [scope, setScope] = useState('all'),
    [count, setCount] = useState(0),
    [playing, setPlaying] = useState(false),
    [scrubbing, setScrubbing] = useState(false),
    [speed, setSpeed] = useState(4);
  const from = scope === 'all' ? 0 : start,
    total = scope === 'all' ? data.times.length : data.window,
    threshold = model.threshold;
  usePauseOnNavigation(() => setPlaying(false));
  useEffect(() => {
    setCount(0);
    setPlaying(false);
  }, [start]);
  useEffect(() => {
    setPlaying(false);
  }, [model.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setCount((c) => {
          if (c >= total - 1) {
            setPlaying(false);
            return total;
          }
          return c + 1;
        }),
      500 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, total]);
  const prefixes = useMemo(
    () =>
      metricPrefixes(
        data.labels.slice(from, from + total),
        model.scores.slice(from, from + total),
        threshold,
      ),
    [data, model, from, total, threshold],
  );
  const idx = from + Math.max(0, count - 1),
    len =
      scope === 'window'
        ? data.window
        : Math.min(displaySettings.playbackPoints, data.times.length),
    viewStart =
      scope === 'all'
        ? Math.max(0, Math.min(data.times.length - len, idx - displaySettings.pointsBeforeCursor))
        : start,
    local = count ? idx - viewStart : -1,
    reveal = count ? Math.max(0, idx - viewStart + 1) : 0,
    scores = model.scores.slice(viewStart, viewStart + len),
    labs = data.labels.slice(viewStart, viewStart + len),
    stats = prefixes[count],
    pred = model.scores[idx] > threshold,
    active = count ? outcomeCode(data.labels[idx], model.scores[idx], threshold) : undefined;
  const seek = (n: number) => {
    setPlaying(false);
    setCount(n);
  };
  const nextPoints = useMemo(() => {
    const points: Partial<Record<OutcomeCode, number>> = {};
    for (let i = from + count; i < from + total; i++) {
      const code = outcomeCode(data.labels[i], model.scores[i], threshold);
      points[code] ??= i;
    }
    return points;
  }, [data.labels, model, threshold, from, count, total]);
  const nextOutcome = (found: number) => {
    seek(found - from + 1);
    if (viewFeature >= 0) {
      const best = model.focusFeatures[found];
      setFeature(best);
      setViewFeature(best);
    }
  };
  return {
    scope,
    setScope,
    count,
    setCount,
    playing,
    setPlaying,
    scrubbing,
    setScrubbing,
    speed,
    setSpeed,
    from,
    total,
    threshold,
    idx,
    len,
    viewStart,
    local,
    reveal,
    scores,
    labs,
    stats,
    pred,
    active,
    seek,
    nextPoints,
    nextOutcome,
  };
}
