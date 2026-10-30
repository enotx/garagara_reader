import type { Locator } from '@garagara/core';
import { describe, expect, it } from 'vitest';

import type { PlaybackEventMap, PlaybackQueueSource, PlaybackSentence } from './types.js';
import {
  WebSpeechPlaybackEngine,
  type SpeechBoundaryEvent,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type SpeechVoice,
} from './web.js';

interface FakeUtterance extends SpeechUtteranceLike {
  start(): void;
  end(): void;
  error(error: unknown): void;
  boundary(event: SpeechBoundaryEvent): void;
}

class FakeSpeech implements SpeechSynthesisLike {
  readonly utterances: FakeUtterance[] = [];
  voices: SpeechVoice[] = [];
  cancels = 0;
  pauses = 0;
  resumes = 0;

  speak(utterance: SpeechUtteranceLike): void {
    this.utterances.push(utterance as FakeUtterance);
  }

  cancel(): void {
    this.cancels += 1;
  }

  pause(): void {
    this.pauses += 1;
  }

  resume(): void {
    this.resumes += 1;
  }

  getVoices(): readonly SpeechVoice[] {
    return this.voices;
  }
}

function fakeUtterance(text: string): FakeUtterance {
  const utterance: FakeUtterance = {
    text,
    lang: '',
    rate: 1,
    voice: null,
    onstart: null,
    onend: null,
    onerror: null,
    onboundary: null,
    start: () => utterance.onstart?.(),
    end: () => utterance.onend?.(),
    error: (error) => utterance.onerror?.(error),
    boundary: (event) => utterance.onboundary?.(event),
  };
  return utterance;
}

function sentence(index: number, text: string, chapterIndex = 0): PlaybackSentence {
  return {
    id: `b:c${chapterIndex}:b${index}:s0`,
    text,
    locator: { bookId: 'book', chapterIndex, blockIndex: index, offset: 0 },
  };
}

function locator(blockIndex: number, offset = 0, chapterIndex = 0): Locator {
  return { bookId: 'book', chapterIndex, blockIndex, offset };
}

function sourceOf(queue: readonly PlaybackSentence[]): PlaybackQueueSource {
  return { load: async () => queue };
}

interface Recorder {
  starts: string[];
  boundaries: PlaybackEventMap['boundary'][];
  states: PlaybackEventMap['stateChange'][];
  ended: PlaybackEventMap['ended'][];
}

function record(engine: WebSpeechPlaybackEngine): Recorder {
  const recorder: Recorder = { starts: [], boundaries: [], states: [], ended: [] };
  engine.on('sentenceStart', (event) => recorder.starts.push(event.sentenceId));
  engine.on('boundary', (event) => recorder.boundaries.push(event));
  engine.on('stateChange', (event) => recorder.states.push(event));
  engine.on('ended', (event) => recorder.ended.push(event));
  return recorder;
}

function createEngine(
  queue: readonly PlaybackSentence[],
  speech: FakeSpeech,
  options: { rate?: number; lang?: string; voiceId?: string } = {},
): WebSpeechPlaybackEngine {
  return new WebSpeechPlaybackEngine({
    source: sourceOf(queue),
    speech,
    createUtterance: fakeUtterance,
    ...options,
  });
}

describe('WebSpeechPlaybackEngine', () => {
  it('starts at the sentence containing the locator and reports boundaries', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine(
      [sentence(0, 'One.'), sentence(1, 'Two words.'), sentence(2, 'Three.')],
      speech,
      { lang: 'en-GB', rate: 1.25 },
    );
    const events = record(engine);

    await engine.play(locator(1, 2));

    expect(speech.utterances).toHaveLength(1);
    const utterance = speech.utterances[0];
    expect(utterance?.text).toBe('Two words.');
    expect(utterance?.lang).toBe('en-GB');
    expect(utterance?.rate).toBe(1.25);
    await expect(engine.getState()).resolves.toEqual({
      status: 'playing',
      sentenceId: 'b:c0:b1:s0',
    });

    utterance?.start();
    expect(events.starts).toEqual(['b:c0:b1:s0']);

    utterance?.boundary({ charIndex: 2, charLength: 3 });
    expect(events.boundaries).toEqual([{ sentenceId: 'b:c0:b1:s0', start: 2, end: 5 }]);
    await expect(engine.getState()).resolves.toMatchObject({ offset: 2 });
  });

  it('advances sentence by sentence and ends when the queue is exhausted', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.'), sentence(1, 'Two.')], speech);
    const events = record(engine);

    await engine.play(locator(0));
    speech.utterances[0]?.start();
    speech.utterances[0]?.end();

    expect(speech.utterances[1]?.text).toBe('Two.');
    speech.utterances[1]?.start();
    expect(events.starts).toEqual(['b:c0:b0:s0', 'b:c0:b1:s0']);

    speech.utterances[1]?.end();
    await expect(engine.getState()).resolves.toEqual({ status: 'idle' });
    expect(events.ended).toEqual([{ reason: 'finished' }]);
  });

  it('pauses and resumes without speaking a new utterance', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.')], speech);
    const events = record(engine);

    await engine.play(locator(0));
    engine.pause();
    engine.resume();

    expect(speech.pauses).toBe(1);
    expect(speech.resumes).toBe(1);
    expect(speech.utterances).toHaveLength(1);
    expect(events.states.map((state) => state.status)).toEqual(['playing', 'paused', 'playing']);
  });

  it('stops the current utterance and ignores its late callbacks', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.'), sentence(1, 'Two.')], speech);
    const events = record(engine);

    await engine.play(locator(0));
    const utterance = speech.utterances[0];
    engine.stop();
    utterance?.end();

    expect(speech.utterances).toHaveLength(1);
    expect(events.ended).toEqual([{ reason: 'stopped' }]);
    await expect(engine.getState()).resolves.toEqual({ status: 'idle' });
  });

  it('moves to the next and previous sentence', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.'), sentence(1, 'Two.')], speech);

    await engine.play(locator(0));
    engine.next();
    expect(speech.utterances[1]?.text).toBe('Two.');

    engine.prev();
    expect(speech.utterances[2]?.text).toBe('One.');
    expect(speech.cancels).toBe(3);
  });

  it('finishes when next is called on the last sentence', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.')], speech);
    const events = record(engine);

    await engine.play(locator(0));
    engine.next();

    expect(events.ended).toEqual([{ reason: 'finished' }]);
    await expect(engine.getState()).resolves.toEqual({ status: 'idle' });
  });

  it('applies rate and voice changes to subsequent sentences', async () => {
    const speech = new FakeSpeech();
    speech.voices = [
      { voiceURI: 'voice-1', name: 'Voice One', lang: 'en-US' },
      { voiceURI: 'voice-2', name: 'Voice Two', lang: 'en-US' },
    ];
    const engine = createEngine([sentence(0, 'One.'), sentence(1, 'Two.')], speech);

    await engine.play(locator(0));
    engine.setRate(0.5);
    engine.setVoice('voice-2');
    speech.utterances[0]?.end();

    expect(speech.utterances[1]?.rate).toBe(0.5);
    expect(speech.utterances[1]?.voice).toEqual({
      voiceURI: 'voice-2',
      name: 'Voice Two',
      lang: 'en-US',
    });
  });

  it('removes listeners when off is called', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.')], speech);
    const starts: string[] = [];
    const listener = (event: { sentenceId: string }): void => {
      starts.push(event.sentenceId);
    };

    engine.on('sentenceStart', listener);
    engine.off('sentenceStart', listener);
    await engine.play(locator(0));
    speech.utterances[0]?.start();

    expect(starts).toEqual([]);
  });

  it('reports speech errors and resets to idle', async () => {
    const speech = new FakeSpeech();
    const engine = createEngine([sentence(0, 'One.')], speech);
    const events = record(engine);
    const failure = new Error('synthesis failed');

    await engine.play(locator(0));
    speech.utterances[0]?.error(failure);

    expect(events.ended).toEqual([{ reason: 'error', error: failure }]);
    await expect(engine.getState()).resolves.toEqual({ status: 'idle' });
  });

  it('rejects when the queue cannot be loaded', async () => {
    const speech = new FakeSpeech();
    const engine = new WebSpeechPlaybackEngine({
      source: {
        load: async () => {
          throw new Error('database offline');
        },
      },
      speech,
      createUtterance: fakeUtterance,
    });
    const events = record(engine);

    await expect(engine.play(locator(0))).rejects.toThrow('database offline');
    expect(events.ended).toMatchObject([{ reason: 'error' }]);
    await expect(engine.getState()).resolves.toEqual({ status: 'idle' });
  });
});
