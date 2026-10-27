import { describe, expect, it } from 'vitest';

import { tokenize, wordTokens } from './tokenize.js';

describe('tokenize', () => {
  it('keeps offsets that reconstruct the source text', () => {
    const text = "Don't stop—really! It's 3.50$.";
    const tokens = tokenize(text);
    expect(tokens.map((token) => text.slice(token.start, token.end)).join('')).toBe(text);
    expect(tokens.filter((token) => token.isWord).map((token) => token.surface)).toEqual([
      "Don't",
      'stop',
      'really',
      "It's",
      '3.50',
    ]);
  });

  it('marks punctuation and whitespace as non-words', () => {
    const tokens = tokenize('Well-known co-operate.');
    expect(tokens.map((token) => [token.surface, token.isWord])).toEqual([
      ['Well', true],
      ['-', false],
      ['known', true],
      [' ', false],
      ['co', true],
      ['-', false],
      ['operate', true],
      ['.', false],
    ]);
  });

  it('preserves indices when filtering to word tokens', () => {
    const tokens = tokenize('One, two.');
    expect(wordTokens(tokens)).toEqual([
      { index: 0, token: { start: 0, end: 3, surface: 'One', isWord: true } },
      { index: 3, token: { start: 5, end: 8, surface: 'two', isWord: true } },
    ]);
  });

  it('handles empty strings and UTF-16 surrogate pairs', () => {
    expect(tokenize('')).toEqual([]);
    const text = 'A 😀 word';
    const tokens = tokenize(text);
    expect(tokens.map((token) => text.slice(token.start, token.end)).join('')).toBe(text);
  });
});
