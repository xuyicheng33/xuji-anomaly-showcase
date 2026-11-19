import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { series, type Journey, type Model } from '../journey';
import { loadCases, loadCaseArrays, type Insertion, type Construction } from '../anomalyCases';
import { curveDomain } from './curveScale';
import { usePauseOnNavigation } from './notes';
import { useDataAsset } from './useDataAsset';
import { useResource } from './useResource';
import { methods, kinds } from './caseContent';
import { usePresentationState } from './usePresentationState';

/** Progress at which each construction step starts. */
export const stepBounds = [0, 0.16, 0.58, 0.9, 1];
/** Milliseconds spent in each step while playing. */
const stepDurations = [800, 1400, 2200, 1000];
const referenceDurations = [800, 2800, 2200, 1000];
/** Below this spread in the target interval a reference segment reads as a flat line. */
const flatSpread = 0.1;

export function useCaseConstruction(data: Journey, model: Model) {
  const [insertion, setInsertion] = usePresentationState<Insertion>('case:insertion', 'replace');
  const [kind, setKind] = usePresentationState<Construction>('case:kind', 'reference');
  const [progress, setProgress] = usePresentationState('case:progress', 0),
    [playing, setPlaying] = useState(false),
    [savedPoint, setPoint] = usePresentationState(
      `case:point:${data.resultVersion}`,
      Math.round((30 * data.window) / 64),
    ),
    [showResult, setShowResult] = usePresentationState('case:result', false);
  const [selectedFeature, setSelectedFeature] = usePresentationState<number | null>(
    'case:feature',
    null,
  );
  const previousCase = useRef(`${insertion}:${kind}`);
  const [pickerOpen, setPickerOpen] = useState(false);
  usePauseOnNavigation(() => setPlaying(false));
  const resultRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const readCases = useCallback(() => loadCases(data), [data]);
  const catalog = useResource(data.cases.sha256, readCases);
  const selected = catalog.data?.cases.find((c) => c.insertion === insertion && c.kind === kind);
  const cm = selected?.models.find((m) => m.id === model.id);
  const readArrays = useCallback(() => loadCaseArrays(selected!), [selected]);
  const bundle = useResource(
    selected ? `${data.resultVersion}:${selected.input.sha256}` : null,
    readArrays,
  );
  const arrays = bundle.data;
  const error = catalog.error || bundle.error;
  const retry = () => {
    catalog.retry();
    bundle.retry();
  };
  const reconstruction = useDataAsset(showResult ? (cm?.recon ?? null) : null);
  useEffect(() => {
    const key = `${insertion}:${kind}`;
    if (previousCase.current === key) return;
    previousCase.current = key;
    setProgress(0);
    setPlaying(false);
    setShowResult(false);
    setPoint(Math.round((30 * data.window) / 64));
    setSelectedFeature(null);
  }, [insertion, kind, data.window, setProgress, setShowResult, setPoint, setSelectedFeature]);
  useEffect(() => {
    setPlaying(false);
  }, [model.id]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last: number | undefined;
    const durations = kind === 'reference' ? referenceDurations : stepDurations;
    const tick = (now: number) => {
      if (last !== undefined && !document.hidden) {
        const delta = now - last;
        setProgress((p) => {
          const step = p < stepBounds[1] ? 0 : p < stepBounds[2] ? 1 : p < stepBounds[3] ? 2 : 3;
          const rate = (stepBounds[step + 1] - stepBounds[step]) / durations[step];
          return Math.min(1, p + delta * rate);
        });
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, kind, setProgress]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);
  const method = methods.find((m) => m.id === insertion)!,
    baseConstruction = kinds.find((k) => k.id === kind)!;
  const phase =
    progress < stepBounds[1] ? 0 : progress <= stepBounds[2] ? 1 : progress < stepBounds[3] ? 2 : 3;
  const blend = Math.max(0, Math.min(1, (progress - 0.58) / 0.32));
  const length = selected?.times.length ?? data.window;
  const point = Math.min(savedPoint, length - 1);
  const begin = selected?.begin ?? 0,
    end = selected?.end ?? length;
  const span = end - begin,
    scale = selected?.source.scale ?? 3;
  const patch = selected?.source.patchSize ?? 4;
  const construction =
    kind === 'length'
      ? {
          ...baseConstruction,
          copy: `将 ${span / scale} 个采样点各重复 ${scale} 次，形成 ${span} 点素材，写入固定区间。`,
          detail: `来源为第 ${begin + 1}—${begin + span / scale} 点，重复采样后写入第 ${begin + 1}—${end} 点；第 ${end + 1}—${length} 点保留原值。`,
        }
      : kind === 'peak'
        ? {
            ...baseConstruction,
            detail: `原值较高时取接近 0 的值，原值较低时取接近 1 的值；前后各 ${patch} 点一并标记。`,
          }
        : baseConstruction;
  const features = data.features.length;
  // A nearly flat reference hides its own reversal; show the case's most varied point instead.
  const defaultFeature = useMemo(() => {
    const fallback = selected?.feature ?? 4;
    if (!selected || !arrays || selected.kind !== 'reference') return fallback;
    const spread = (feature: number) => {
      let lo = Infinity,
        hi = -Infinity;
      for (let t = selected.begin; t < selected.end; t++) {
        const value = arrays.material[t * features + feature];
        lo = Math.min(lo, value);
        hi = Math.max(hi, value);
      }
      return hi - lo;
    };
    if (spread(fallback) >= flatSpread) return fallback;
    return selected.features.reduce((best, f) => (spread(f) > spread(best) ? f : best), fallback);
  }, [selected, arrays, features]);
  const feature = selectedFeature ?? defaultFeature;
  const { material, base, candidate, after, labels, weights, activePoints, stableRange } =
    useMemo(() => {
      const column = (values: Float64Array | undefined) =>
        values ? series(values, feature, 0, length, features) : [];
      const material = column(arrays?.material),
        base = column(arrays?.original),
        candidate = column(arrays?.candidate),
        after = column(arrays?.input),
        labels = column(arrays?.labels),
        weights = column(arrays?.weights);
      return {
        material,
        base,
        candidate,
        after,
        labels,
        weights,
        activePoints: weights.flatMap((weight, index) => (weight > 0 ? [index] : [])),
        stableRange: curveDomain([...base, ...candidate, ...material, ...after]),
      };
    }, [arrays, feature, length, features]);
  const materialProgress = Math.max(0, Math.min(1, (progress - 0.16) / 0.42));
  const visibleLabels = labels.map((v) => (phase === 3 ? v : 0));
  const writtenCount = Math.ceil(activePoints.length * blend - 1e-9);
  const written = new Set(activePoints.slice(0, writtenCount));
  const visible = base.map((value, index) =>
    insertion === 'replace'
      ? written.has(index)
        ? after[index]
        : value
      : value + (after[index] - value) * blend,
  );
  const shownCandidate = candidate.map(
    (v, i) => material[i] + (v - material[i]) * materialProgress,
  );
  const animatedWeight = (weights[point] ?? 0) * blend;
  // While values are written one by one, the readout follows the write cursor.
  const cursor =
    insertion === 'replace' && writtenCount > 0 ? activePoints[writtenCount - 1] : null;
  useEffect(() => {
    if (playing && phase === 2 && cursor !== null) setPoint(cursor);
  }, [playing, phase, cursor, setPoint]);
  const startPlaying = () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!playing && matchMedia('(max-width: 1050px)').matches)
      stageRef.current?.scrollIntoView({
        behavior: reduced ? 'instant' : 'smooth',
        block: 'start',
      });
    if (reduced) {
      setProgress(1);
      setPlaying(false);
      return;
    }
    if (progress >= 1) setProgress(0);
    setPlaying((v) => !v);
  };
  const jump = (n: number) => {
    setPlaying(false);
    setProgress([0, 0.58, 0.74, 1][n]);
  };
  return {
    insertion,
    setInsertion,
    kind,
    setKind,
    error,
    retry,
    progress,
    setProgress,
    playing,
    setPlaying,
    point,
    setPoint,
    showResult,
    setShowResult,
    selectedFeature,
    setSelectedFeature,
    pickerOpen,
    setPickerOpen,
    resultRef,
    stageRef,
    selected,
    cm,
    arrays,
    reconstruction,
    method,
    construction,
    feature,
    phase,
    blend,
    material,
    materialProgress,
    base,
    candidate,
    after,
    labels,
    visibleLabels,
    weights,
    activePoints,
    writtenCount,
    written,
    visible,
    shownCandidate,
    animatedWeight,
    stableRange,
    startPlaying,
    jump,
  };
}
