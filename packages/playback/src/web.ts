import { compareLocators, type Locator } from '@garagara/core';

import type {
  PlaybackEngine,
  PlaybackEvent,
  PlaybackEventMap,
  PlaybackListener,
  PlaybackPosition,
  PlaybackQueueSource,
  PlaybackSentence,
  PlaybackStatus,
} from './types.js';

export interface SpeechVoice {
  voiceURI: string;
  name: string;
  lang: string;
}

export interface SpeechBoundaryEvent {
  charIndex: number;
  charLength?: number;
}

/** The subset of `SpeechSynthesisUtterance` the engine drives. */
export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  voice: SpeechVoice | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
  onboundary: ((event: SpeechBoundaryEvent) => void) | null;
}

/** The subset of `SpeechSynthesis` the engine drives. */
export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): readonly SpeechVoice[];
}

export interface WebSpeechPlaybackOptions {
  source: PlaybackQueueSource;
  /** Injectable for tests; defaults to `globalThis.speechSynthesis`. */
  speech?: SpeechSynthesisLike;
  /** Injectable for tests; defaults to `new SpeechSynthesisUtterance(text)`. */
  createUtterance?: (text: string) => SpeechUtteranceLike;
  /** BCP-47 voice language. Defaults to `en-US`. */
  lang?: string;
  /** Initial rate in the Web Speech range 0.1–10. Defaults to 1. */
  rate?: number;
  /** Matches `voiceURI` or the display name. */
  voiceId?: string;
}

interface SpeechGlobal {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: new (text: string) => SpeechUtteranceLike;
}

const MIN_RATE = 0.1;
const MAX_RATE = 10;
const DEFAULT_RATE = 1;

function clampRate(rate: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

function fallbackSpeech(): SpeechSynthesisLike {
  const scope = globalThis as unknown as SpeechGlobal;
  if (!scope.speechSynthesis) {
    throw new Error('Web Speech API is not available in this environment');
  }
  return scope.speechSynthesis;
}

function fallbackUtterance(text: string): SpeechUtteranceLike {
  const scope = globalThis as unknown as SpeechGlobal;
  if (!scope.SpeechSynthesisUtterance) {
    throw new Error('Web Speech API is not available in this environment');
  }
  return new scope.SpeechSynthesisUtterance(text);
}

/**
 * Resolves the sentence at or before `from`. A locator in the middle of a
 * sentence resumes from that sentence's start.
 */
function findStartIndex(queue: readonly PlaybackSentence[], from: Locator): number {
  let index = 0;
  for (let position = 0; position < queue.length; position += 1) {
    const sentence = queue[position];
    if (!sentence || compareLocators(sentence.locator, from) > 0) {
      break;
    }
    index = position;
  }
  return index;
}

/**
 * Web Speech implementation of the PlaybackEngine contract. It is the
 * behavioural benchmark for the native iOS/Android playlists (Spec §13):
 * playback advances sentence by sentence and reports char boundaries without
 * touching the DOM.
 */
export class WebSpeechPlaybackEngine implements PlaybackEngine {
  private readonly source: PlaybackQueueSource;
  private readonly lang: string;
  private readonly listeners = new Map<PlaybackEvent, Set<(event: unknown) => void>>();
  private speech: SpeechSynthesisLike | undefined;
  private createUtterance: ((text: string) => SpeechUtteranceLike) | undefined;
  private queue: readonly PlaybackSentence[] = [];
  private index = -1;
  private status: PlaybackStatus = 'idle';
  private offset: number | undefined;
  private rate: number;
  private voiceId: string | undefined;
  /** Invalidates callbacks from a cancelled utterance. */
  private token = 0;
  /** Invalidates an in-flight `play()` after `stop()` or another `play()`. */
  private session = 0;

  constructor(options: WebSpeechPlaybackOptions) {
    this.source = options.source;
    this.speech = options.speech;
    this.createUtterance = options.createUtterance;
    this.lang = options.lang ?? 'en-US';
    this.rate = options.rate === undefined ? DEFAULT_RATE : clampRate(options.rate);
    this.voiceId = options.voiceId;
  }

  async play(from: Locator): Promise<void> {
    const session = (this.session += 1);
    this.cancelSpeech();
    this.queue = [];
    this.index = -1;
    this.offset = undefined;
    this.status = 'idle';

    let queue: readonly PlaybackSentence[];
    try {
      queue = await this.source.load(from.bookId);
    } catch (error) {
      if (session !== this.session) {
        return;
      }
      this.fail(error);
      throw error;
    }
    if (session !== this.session) {
      return;
    }
    if (queue.length === 0) {
      this.emit('ended', { reason: 'finished' });
      return;
    }
    this.queue = queue;
    this.index = findStartIndex(queue, from);
    this.speakCurrent();
  }

  pause(): void {
    if (this.status !== 'playing') {
      return;
    }
    this.speech?.pause();
    this.status = 'paused';
    this.emit('stateChange', this.snapshot());
  }

  resume(): void {
    if (this.status !== 'paused') {
      return;
    }
    this.speech?.resume();
    this.status = 'playing';
    this.emit('stateChange', this.snapshot());
  }

  stop(): void {
    const wasActive = this.status !== 'idle';
    this.session += 1;
    this.cancelSpeech();
    this.queue = [];
    this.index = -1;
    this.offset = undefined;
    this.status = 'idle';
    if (wasActive) {
      this.emit('stateChange', this.snapshot());
      this.emit('ended', { reason: 'stopped' });
    }
  }

  next(): void {
    this.seek(1);
  }

  prev(): void {
    this.seek(-1);
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      return;
    }
    this.rate = clampRate(rate);
  }

  setVoice(voiceId: string): void {
    this.voiceId = voiceId.trim() || undefined;
  }

  async getState(): Promise<PlaybackPosition> {
    return this.snapshot();
  }

  on<E extends PlaybackEvent>(event: E, cb: PlaybackListener<E>): void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(cb as (event: unknown) => void);
  }

  private seek(delta: number): void {
    if (this.queue.length === 0 || this.index < 0) {
      return;
    }
    const target = this.index + delta;
    if (target < 0) {
      return;
    }
    this.cancelSpeech();
    if (target >= this.queue.length) {
      this.finish();
      return;
    }
    this.index = target;
    this.offset = undefined;
    this.speakCurrent();
  }

  private speakCurrent(): void {
    const sentence = this.queue[this.index];
    if (!sentence) {
      this.finish();
      return;
    }
    const speech = this.speech ?? (this.speech = fallbackSpeech());
    const utterance = (this.createUtterance ?? fallbackUtterance)(sentence.text);
    utterance.lang = this.lang;
    utterance.rate = this.rate;
    utterance.voice = this.resolveVoice(speech);
    const token = (this.token += 1);

    utterance.onstart = () => {
      if (token !== this.token) {
        return;
      }
      this.emit('sentenceStart', { sentenceId: sentence.id });
    };
    utterance.onboundary = (event) => {
      if (token !== this.token) {
        return;
      }
      const start = Math.max(0, Math.min(sentence.text.length, Math.floor(event.charIndex)));
      const length = Math.max(0, Math.floor(event.charLength ?? 0));
      const end = Math.max(start, Math.min(sentence.text.length, start + length));
      this.offset = start;
      this.emit('boundary', { sentenceId: sentence.id, start, end });
    };
    utterance.onend = () => {
      if (token !== this.token) {
        return;
      }
      this.advance();
    };
    utterance.onerror = (error) => {
      if (token !== this.token) {
        return;
      }
      this.fail(error);
    };

    this.status = 'playing';
    this.offset = undefined;
    this.emit('stateChange', this.snapshot());
    try {
      speech.speak(utterance);
    } catch (error) {
      this.fail(error);
    }
  }

  private advance(): void {
    if (this.index + 1 >= this.queue.length) {
      this.finish();
      return;
    }
    this.index += 1;
    this.offset = undefined;
    this.speakCurrent();
  }

  private finish(): void {
    const wasActive = this.status !== 'idle';
    this.token += 1;
    this.queue = [];
    this.index = -1;
    this.offset = undefined;
    this.status = 'idle';
    if (wasActive) {
      this.emit('stateChange', this.snapshot());
    }
    this.emit('ended', { reason: 'finished' });
  }

  private fail(error: unknown): void {
    this.token += 1;
    this.speech?.cancel();
    const wasActive = this.status !== 'idle';
    this.queue = [];
    this.index = -1;
    this.offset = undefined;
    this.status = 'idle';
    if (wasActive) {
      this.emit('stateChange', this.snapshot());
    }
    this.emit('ended', { reason: 'error', error });
  }

  private cancelSpeech(): void {
    this.token += 1;
    this.speech?.cancel();
  }

  private resolveVoice(speech: SpeechSynthesisLike): SpeechVoice | null {
    if (!this.voiceId) {
      return null;
    }
    return (
      speech
        .getVoices()
        .find((voice) => voice.voiceURI === this.voiceId || voice.name === this.voiceId) ?? null
    );
  }

  private snapshot(): PlaybackPosition {
    const sentence = this.queue[this.index];
    if (!sentence) {
      return { status: this.status };
    }
    return this.offset === undefined
      ? { status: this.status, sentenceId: sentence.id }
      : { status: this.status, sentenceId: sentence.id, offset: this.offset };
  }

  private emit<E extends PlaybackEvent>(event: E, payload: PlaybackEventMap[E]): void {
    const listeners = this.listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(payload);
    }
  }
}
