import { describe, expect, it } from 'vitest';

import { splitSentences } from './index.js';

function sentences(text: string): string[] {
  return splitSentences(text).map((range) => text.slice(range.start, range.end));
}

describe('splitSentences', () => {
  it.each([
    ['basic sentence endings', 'One. Two! Three?', ['One.', 'Two!', 'Three?']],
    [
      'titles and initials',
      'Mr. Smith met Dr. Jones. They talked.',
      ['Mr. Smith met Dr. Jones.', 'They talked.'],
    ],
    ['initials', 'J. R. R. Tolkien wrote it. The end.', ['J. R. R. Tolkien wrote it.', 'The end.']],
    [
      'e.g. with a capitalized continuation',
      'Use a fruit, e.g. An apple. Then eat it.',
      ['Use a fruit, e.g. An apple.', 'Then eat it.'],
    ],
    [
      'abbreviation in the middle of a sentence',
      'The train left at 5 p.m. and we stayed.',
      ['The train left at 5 p.m. and we stayed.'],
    ],
    [
      'abbreviation at the end of a sentence',
      'The train left at 5 p.m. We stayed.',
      ['The train left at 5 p.m.', 'We stayed.'],
    ],
    ['decimal numbers', 'It costs $3.50. That is cheap.', ['It costs $3.50.', 'That is cheap.']],
    ['closing quote after a sentence', '“Hello.” She left.', ['“Hello.”', 'She left.']],
    [
      'quoted dialogue with attribution',
      '"Stop!" he shouted. "Go!" she replied.',
      ['"Stop!" he shouted.', '"Go!" she replied.'],
    ],
    [
      'quoted dialogue inside a sentence',
      'He said “Hello.” She left.',
      ['He said “Hello.”', 'She left.'],
    ],
    [
      'abbreviation followed by a closing quote',
      'He said "Mr. Smith." She left.',
      ['He said "Mr. Smith."', 'She left.'],
    ],
    [
      'street abbreviation before a new sentence',
      'He lives on Main St. He left.',
      ['He lives on Main St.', 'He left.'],
    ],
    ['saint abbreviation', 'He met St. John. They talked.', ['He met St. John.', 'They talked.']],
    [
      'numbered abbreviation',
      'The answer is No. 5. Then came six.',
      ['The answer is No. 5.', 'Then came six.'],
    ],
    [
      'ellipsis and mixed punctuation',
      'Wait... What? No! Really?',
      ['Wait...', 'What?', 'No!', 'Really?'],
    ],
    ['single sentence without punctuation', 'Just a fragment', ['Just a fragment']],
    ['empty and whitespace input', '   \n\t  ', []],
  ])('%s', (_name, text, expected) => {
    expect(sentences(text)).toEqual(expected);
  });

  it('returns trimmed half-open ranges that reconstruct the source', () => {
    const text = '  Mr. Smith arrived.   He left.  ';
    const ranges = splitSentences(text);
    expect(ranges).toEqual([
      { start: 2, end: 20 },
      { start: 23, end: 31 },
    ]);
    expect(ranges.map((range) => text.slice(range.start, range.end))).toEqual([
      'Mr. Smith arrived.',
      'He left.',
    ]);
  });
});
