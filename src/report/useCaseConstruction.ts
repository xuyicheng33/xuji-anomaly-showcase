import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { series, type Journey, type Model } from '../journey';
import { loadCases, loadCaseArrays, type Insertion, type Construction } from '../anomalyCases';
import { curveDomain } from './curveScale';
import { usePauseOnNavigation } from './notes';
import { useDataAsset } from './useDataAsset';
import { useResource } from './useResource';
import { methods, kinds } from './caseContent';
import { usePresentationState } from './usePresentationState';

export function useCaseConstruction(data: Journey, model: Model) {
  const [insertion, setInsertion] = usePresentationState<Insertion>('case:insertion', 'replace');
  const [kind, setKind] = usePresentationState<Construction>('case:kind', 'reference');
  const [progress, setProgress] = usePresentationState('case:progress', 0),
    [playing, setPlaying] = useState(false),
    [point, setPoint] = usePresentationState('case:point', 30),
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
  const bundle = useResource(selected?.id ?? null, readArrays);
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
    setPoint(30);
    setSelectedFeature(null);
  }, [insertion, kind, setProgress, setShowResult, setPoint, setSelectedFeature]);
  useEffect(() => {
    setPlaying(false);
  }, [model.id]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last: number | undefined;
    const tick = (now: number) => {
      if (last !== undefined && !document.hidden) {
        const delta = now - last;
        setProgress((p) => Math.min(1, p + delta / (kind === 'reference' ? 12000 : 8000)));
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
    construction = kinds.find((k) => k.id === kind)!;
  const feature = selectedFeature ?? selected?.feature ?? 4;
  const phase = progress < 0.16 ? 0 : progress <= 0.58 ? 1 : progress < 0.9 ? 2 : 3;
  const blend = Math.max(0, Math.min(1, (progress - 0.58) / 0.32));
  const length = selected?.times.length ?? data.window;
  const features = data.features.length;
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
  const startPlaying = () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!playing && matchMedia('(max-width: 820px)').matches)
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
