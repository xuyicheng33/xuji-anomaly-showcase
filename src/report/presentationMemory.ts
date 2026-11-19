import type { loadWindow } from '../journey';

export type NoteOrigin = { hash: string; y: number; reference: string };
export type RecordSelection = { view: 'raw' | 'missing' | 'crop'; example: number; block: number };

/** In-memory state survives chapter unmounts and resets on a full reload. */
export const presentationMemory: {
  noteOrigin: NoteOrigin | null;
  records: RecordSelection;
  detection: { key: string; result: Awaited<ReturnType<typeof loadWindow>>; point: number } | null;
  /** A time point the score page should open on, set when leaving playback for its calculation. */
  detectionTarget: number | null;
  /** The score page opens on a detected point the first time it is shown. */
  detectionVisited: boolean;
} = {
  noteOrigin: null,
  records: { view: 'raw', example: 0, block: 0 },
  detection: null,
  detectionTarget: null,
  detectionVisited: false,
};
