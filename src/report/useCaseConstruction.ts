import { useCallback, useEffect, useRef, useState } from 'react';
import { series, type Journey, type Model } from '../journey';
import { loadCases, loadCaseArrays, type Insertion, type Construction } from '../anomalyCases';
import { curveDomain } from './curveScale';
import { usePauseOnNavigation } from './notes';
import { useDataAsset } from './useDataAsset';
import { useResource } from './useResource';
import { methods, kinds } from './caseContent';

export function useCaseConstruction(data: Journey, model: Model) {
  const [insertion, setInsertion] = useState<Insertion>('replace');
  const [kind, setKind] = useState<Construction>('reference');
  const [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false),
    [point, setPoint] = useState(30),
    [showResult, setShowResult] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  usePauseOnNavigation(() => setPlaying(false));
  const resultRef = useRef<HTMLDivElement>(null),
    stageRef = useRef<HTMLDivElement>(null);
  const catalog = useResource('cases', loadCases);
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
  const reconstruction = useDataAsset(cm?.recon ?? null);
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
    setShowResult(false);
    setPoint(30);
    setSelectedFeature(null);
  }, [selected?.id]);
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
  }, [playing, kind]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);
  const method = methods.find((m) => m.id === insertion)!,
    construction = kinds.find((k) => k.id === kind)!;
  const feature = selectedFeature ?? selected?.feature ?? 4;
  const phase = progress < 0.16 ? 0 : progress <= 0.58 ? 1 : progress < 0.9 ? 2 : 3;
  const blend = Math.max(0, Math.min(1, (progress - 0.58) / 0.32));
  const material = arrays
    ? series(
        arrays.material,
        feature,
        0,
        selected?.times.length ?? data.window,
        data.features.length,
      )
    : [];
  const materialProgress = Math.max(0, Math.min(1, (progress - 0.16) / 0.42));
  const base = arrays
      ? series(
          arrays.original,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    candidate = arrays
      ? series(
          arrays.candidate,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    after = arrays
      ? series(
          arrays.input,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [];
  const labels = arrays
      ? series(
          arrays.labels,
          feature,
          0,
          selected?.times.length ?? data.window,
          data.features.length,
        )
      : [],
    visibleLabels = labels.map((v) => (phase === 3 ? v : 0));
  const weights = arrays
    ? series(
        arrays.weights,
        feature,
        0,
        selected?.times.length ?? data.window,
        data.features.length,
      )
    : [];
  const activePoints = weights.flatMap((weight, index) => (weight > 0 ? [index] : []));
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
  const stableRange = curveDomain([...base, ...candidate, ...material, ...after]);
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
