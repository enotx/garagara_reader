import { describe, expect, it } from 'vitest';

import { createGestureState, reduceGesture, type GestureEvent } from './gestures.js';

function run(event: GestureEvent, options = {}) {
  return reduceGesture(createGestureState(), event, options);
}

function word(word = 'word'): GestureEvent {
  return { type: 'tap', target: 'word', word, sentenceId: 's', sameSentence: true };
}

describe('gesture state machine', () => {
  it('covers the normal-reading column', () => {
    expect(run(word('apple'))).toEqual({
      state: { mode: 'card', menuOpen: false, cardWord: 'apple' },
      commands: [{ type: 'openCard', word: 'apple' }],
    });

    const blank = run({ type: 'tap', target: 'blank' });
    expect(blank.state).toEqual({ mode: 'reading', menuOpen: true });
    expect(blank.commands).toEqual([{ type: 'toggleMenu' }]);

    const chrome = run({ type: 'tap', target: 'chrome' });
    expect(chrome.state.menuOpen).toBe(true);
    expect(chrome.commands).toEqual([{ type: 'toggleMenu' }]);

    const longPress = run({ type: 'longPress', sentenceId: 's1' });
    expect(longPress.state).toEqual({ mode: 'reading', menuOpen: false });
    expect(longPress.commands).toEqual([{ type: 'translateSentence', sentenceId: 's1' }]);

    expect(run({ type: 'swipe', direction: 'left' }).commands).toEqual([
      { type: 'turnPage', direction: 'next' },
    ]);
    expect(run({ type: 'swipe', direction: 'right' }).commands).toEqual([
      { type: 'turnPage', direction: 'prev' },
    ]);
  });

  it('treats disabled edge taps as blank taps', () => {
    const result = run({ type: 'tap', target: 'edge', side: 'right' });
    expect(result.commands).toEqual([{ type: 'toggleMenu' }]);
    expect(result.state.menuOpen).toBe(true);
  });

  it('turns pages on enabled edge taps', () => {
    const right = run({ type: 'tap', target: 'edge', side: 'right' }, { edgeTurn: true });
    expect(right.commands).toEqual([{ type: 'turnPage', direction: 'next' }]);
    const left = run({ type: 'tap', target: 'edge', side: 'left' }, { edgeTurn: true });
    expect(left.commands).toEqual([{ type: 'turnPage', direction: 'prev' }]);
  });

  it('covers the card-open column', () => {
    const open = reduceGesture(createGestureState(), word('one'));

    expect(reduceGesture(open.state, word('two'))).toEqual({
      state: { mode: 'card', menuOpen: false, cardWord: 'two' },
      commands: [{ type: 'replaceCard', word: 'two' }],
    });

    for (const event of [
      { type: 'tap', target: 'blank' },
      { type: 'tap', target: 'chrome' },
      { type: 'tap', target: 'edge', side: 'left' },
      { type: 'swipe', direction: 'left' },
    ] satisfies GestureEvent[]) {
      const result = reduceGesture(open.state, event);
      expect(result.state).toEqual({ mode: 'reading', menuOpen: false });
      expect(result.commands).toEqual([{ type: 'closeCard' }]);
    }

    expect(reduceGesture(open.state, { type: 'longPress', sentenceId: 's' })).toEqual({
      state: open.state,
      commands: [],
    });
  });

  it('covers the Focus column', () => {
    const focus = { focus: true } as const;
    expect(run(word('here'), focus)).toEqual({
      state: { mode: 'card', menuOpen: false, cardWord: 'here' },
      commands: [{ type: 'openCard', word: 'here' }],
    });

    expect(
      run(
        { type: 'tap', target: 'word', word: 'next', sentenceId: 's2', sameSentence: false },
        focus,
      ),
    ).toEqual({
      state: { mode: 'reading', menuOpen: false },
      commands: [{ type: 'advanceFocus' }],
    });

    expect(run({ type: 'tap', target: 'blank' }, focus).commands).toEqual([
      { type: 'advanceFocus' },
    ]);
    expect(run({ type: 'longPress', sentenceId: 's3' }, focus).commands).toEqual([
      { type: 'focusSentence', sentenceId: 's3' },
    ]);
    expect(run({ type: 'swipe', direction: 'left' }, focus).commands).toEqual([
      { type: 'turnPage', direction: 'next' },
    ]);
    expect(run({ type: 'tap', target: 'chrome' }, focus).commands).toEqual([
      { type: 'toggleMenu' },
    ]);
  });

  it('closes a menu before opening a card', () => {
    const menu = reduceGesture(createGestureState(), { type: 'tap', target: 'blank' });
    const result = reduceGesture(menu.state, word('apple'));
    expect(result.state).toEqual({ mode: 'card', menuOpen: false, cardWord: 'apple' });
  });
});
