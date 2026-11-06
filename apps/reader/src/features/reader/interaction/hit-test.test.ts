import { describe, expect, it } from 'vitest';

import { tokenize } from '@garagara/lang-en';

import { snapToWord } from './hit-test.js';

describe('snapToWord', () => {
  const tokens = tokenize('One two, three!');

  it('returns the word containing the offset', () => {
    expect(snapToWord(tokens, 0)?.surface).toBe('One');
    expect(snapToWord(tokens, 2)?.surface).toBe('One');
    expect(snapToWord(tokens, 4)?.surface).toBe('two');
  });

  it('snaps gaps and punctuation to the nearest word', () => {
    expect(snapToWord(tokens, 3)?.surface).toBe('One');
    expect(snapToWord(tokens, 7)?.surface).toBe('two');
    expect(snapToWord(tokens, 11)?.surface).toBe('three');
  });

  it('clamps before the first and after the last word', () => {
    expect(snapToWord(tokens, 0)?.surface).toBe('One');
    expect(snapToWord(tokens, 99)?.surface).toBe('three');
  });

  it('returns undefined when there are no words', () => {
    expect(snapToWord(tokenize('  — !  '), 2)).toBeUndefined();
  });
});
