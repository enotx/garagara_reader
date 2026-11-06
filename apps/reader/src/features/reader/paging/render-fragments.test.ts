import { describe, expect, it } from 'vitest';

import { buildFragments } from './render-fragments.js';

describe('buildFragments', () => {
  it('splits when sentence and mark boundaries cross', () => {
    const text = 'One two three. Four five.';
    const fragments = buildFragments(
      text,
      [{ start: 4, end: 13, type: 'italic' }],
      [
        { id: 's0', blockId: 'b', index: 0, start: 0, end: 14 },
        { id: 's1', blockId: 'b', index: 1, start: 15, end: 25 },
      ],
    );
    expect(fragments.map((fragment) => text.slice(fragment.start, fragment.end))).toEqual([
      'One ',
      'two three',
      '.',
      ' ',
      'Four five.',
    ]);
    expect(fragments.map((fragment) => fragment.sentenceId)).toEqual([
      's0',
      's0',
      's0',
      undefined,
      's1',
    ]);
    expect(fragments[1]?.marks.map((mark) => mark.type)).toEqual(['italic']);
    expect(fragments[0]?.marks).toEqual([]);
    expect(fragments[4]?.marks).toEqual([]);
  });

  it('keeps overlapping marks on every covered fragment', () => {
    const text = 'abcdef';
    const fragments = buildFragments(
      text,
      [
        { start: 1, end: 4, type: 'bold' },
        { start: 2, end: 5, type: 'italic' },
      ],
      [],
    );
    expect(fragments.map((fragment) => fragment.text)).toEqual(['a', 'b', 'cd', 'e', 'f']);
    expect(fragments[1]?.marks.map((mark) => mark.type)).toEqual(['bold']);
    expect(fragments[2]?.marks.map((mark) => mark.type).sort()).toEqual(['bold', 'italic']);
    expect(fragments[3]?.marks.map((mark) => mark.type)).toEqual(['italic']);
  });

  it('reconstructs the original text exactly', () => {
    const text = '  Spaces and punctuation — stay.  ';
    const fragments = buildFragments(
      text,
      [{ start: 2, end: 8, type: 'bold' }],
      [{ id: 's', blockId: 'b', index: 0, start: 0, end: text.length }],
    );
    expect(fragments.map((fragment) => fragment.text).join('')).toBe(text);
  });

  it('returns no fragments for empty text', () => {
    expect(buildFragments('', [], [])).toEqual([]);
  });
});
