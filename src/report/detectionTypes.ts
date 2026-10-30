import type { Journey, Model } from '../journey';

export type DetectionProps = {
  data: Journey;
  model: Model;
  setModel: (id: string) => void;
  feature: number;
  setFeature: (i: number) => void;
  start: number;
  setStart: (i: number) => void;
  viewFeature: number;
  setViewFeature: (n: number) => void;
};

export type PlaybackProps = Omit<DetectionProps, 'feature' | 'setStart'>;
