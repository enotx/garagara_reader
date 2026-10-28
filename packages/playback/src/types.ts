import type { Locator } from '@garagara/core';

/** Runtime state exposed by every playback implementation (Spec §13). */
export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackPosition {
  status: PlaybackStatus;
  sentenceId?: string;
  /** Character offset inside the current sentence, when a boundary was reported. */
  offset?: number;
}

/**
 * One sentence in the playable queue. `locator` points at the first character
 * of the sentence so `play(from)` can resume at any book position.
 */
export interface PlaybackSentence {
  id: string;
  text: string;
  locator: Locator;
}

/** Supplies the reading-order sentence queue for a book. */
export interface PlaybackQueueSource {
  /** Returns every playable sentence of `bookId` in reading order. */
  load(bookId: string): Promise<readonly PlaybackSentence[]>;
}

export interface PlaybackEventMap {
  sentenceStart: { sentenceId: string };
  boundary: { sentenceId: string; start: number; end: number };
  stateChange: PlaybackPosition;
  ended: { reason: 'finished' | 'stopped' | 'error'; error?: unknown };
}

export type PlaybackEvent = keyof PlaybackEventMap;
export type PlaybackListener<E extends PlaybackEvent> = (event: PlaybackEventMap[E]) => void;

/** Contract from Spec §13, shared by the Web, iOS and (later) Android engines. */
export interface PlaybackEngine {
  play(from: Locator): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  next(): void;
  prev(): void;
  setRate(rate: number): void;
  setVoice(voiceId: string): void;
  getState(): Promise<PlaybackPosition>;
  on<E extends PlaybackEvent>(event: E, cb: PlaybackListener<E>): void;
}
