import { useLayoutEffect, useRef, useState } from 'react';
import { playbackEnvelope, shouldTightenDomain, type CurveDomain } from './curveScale';

export type PlaybackScale = { key: string; hold: boolean };

/** Animate the coordinate system; samples, threshold and point selection stay exact. */
export function usePlaybackScale(
  target: CurveDomain,
  playback: PlaybackScale | undefined,
  empty: boolean,
): CurveDomain {
  const enabled = playback !== undefined;
  const [displayed, setDisplayed] = useState(target);
  const current = useRef({ domain: target, goal: target, key: playback?.key, empty });
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useLayoutEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [enabled]);

  const [low, high] = target;
  const key = playback?.key;
  const hold = playback?.hold ?? false;
  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let timer = 0;
    const next: CurveDomain = [low, high];
    const publish = (domain: CurveDomain) => {
      current.current.domain = domain;
      setDisplayed(domain);
    };
    const animate = (goal: CurveDomain, duration: number) => {
      cancelAnimationFrame(frame);
      current.current.goal = goal;
      const from = current.current.domain;
      if (reducedMotion || (from[0] === goal[0] && from[1] === goal[1])) {
        publish(goal);
        return;
      }
      const began = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - began) / duration);
        const eased = 1 - (1 - progress) ** 3;
        publish([from[0] + (goal[0] - from[0]) * eased, from[1] + (goal[1] - from[1]) * eased]);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    // A different model, feature, scope or fresh playback starts on its own scale.
    if (empty || current.current.empty || current.current.key !== key) {
      current.current = { domain: next, goal: next, key, empty };
      publish(next);
    } else {
      const envelope = playbackEnvelope(current.current.domain, current.current.goal, next);
      animate(envelope, 180);
      // Keep room while playing/dragging, then tighten once the user pauses.
      if (!hold && shouldTightenDomain(envelope, next)) {
        timer = window.setTimeout(() => animate(next, 280), 450);
      }
    }
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [low, high, enabled, key, hold, empty, reducedMotion]);

  return enabled ? displayed : target;
}
