import type { loadWindow } from '../journey';

export type NoteOrigin = { hash: string; y: number; reference: string };
export type RecordSelection = { view: 'raw' | 'missing' | 'crop'; example: number; block: number };

/** In-memory state survives chapter unmounts and resets on a full reload. */
export const presentationMemory: {
  noteOrigin: NoteOrigin | null;
  records: RecordSelection;
  detection: { key: string; result: Awaited<ReturnType<typeof loadWindow>>; point: number } | null;
} = {
  noteOrigin: null,
  records: { view: 'raw', example: 0, block: 0 },
  detection: null,
};
