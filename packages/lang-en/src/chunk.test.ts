import { describe, expect, it } from 'vitest';

import { chunk } from './chunk.js';
import { tokenize } from './tokenize.js';

function chunks(text: string): string[] {
  return chunk(text, tokenize(text)).map((range) => text.slice(range.start, range.end));
}

describe('chunk', () => {
  it('keeps a short sentence as one chunk', () => {
    expect(chunks('Hello there.')).toEqual(['Hello there.']);
  });

  it('splits at comma before a conjunction', () => {
    expect(chunks('I went to the store, and I bought some milk.')).toEqual([
      'I went to the store,',
      'and I bought some milk.',
    ]);
  });

  it('splits at semicolons and colons', () => {
    expect(chunks('He was tired; he went to bed.')).toEqual(['He was tired;', 'he went to bed.']);
    expect(chunks('There is one rule: never give up.')).toEqual([
      'There is one rule:',
      'never give up.',
    ]);
  });

  it('splits before relative clause introducers', () => {
    expect(chunks('The man who lives next door is friendly.')).toEqual([
      'The man',
      'who lives next door is friendly.',
    ]);
    expect(chunks('She read the book that you lent her.')).toEqual([
      'She read the book',
      'that you lent her.',
    ]);
  });

  it('splits at subordinating conjunctions and adverbial connectors', () => {
    expect(chunks('Although it rained, we went out.')).toEqual([
      'Although it rained,',
      'we went out.',
    ]);
    expect(chunks('It was late, however we kept reading.')).toEqual([
      'It was late,',
      'however we kept reading.',
    ]);
  });

  it('merges chunks shorter than the minimum', () => {
    expect(chunks('Yes, and no.')).toEqual(['Yes, and no.']);
  });

  it('splits long unpunctuated text at a word boundary', () => {
    const text =
      'The quick brown fox jumps over the lazy dog while the tired cat sleeps under the warm blanket and dreams about dinner.';
    const result = chunks(text);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.length <= 48)).toBe(true);
    expect(result.join(' ')).toBe(text.replace(/\s+/g, ' '));
  });

  it('returns trimmed half-open ranges', () => {
    const text = '  One thing, and another thing.  ';
    const ranges = chunk(text, tokenize(text));
    expect(ranges.map((range) => text.slice(range.start, range.end))).toEqual([
      'One thing,',
      'and another thing.',
    ]);
  });

  it('handles empty input', () => {
    expect(chunk('   ')).toEqual([]);
  });
});
