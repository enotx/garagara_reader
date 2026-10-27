import { describe, expect, it } from 'vitest';

import type { Dictionary } from './dictionary.js';
import { matchPhrases } from './phrase.js';
import { tokenize } from './tokenize.js';

function dictionary(phrases: string[][], forms: Record<string, string[]> = {}): Dictionary {
  return {
    lookup: async () => [],
    hasPhrase: (lemmaSeq) =>
      phrases.some((phrase) => phrase.join(' ') === lemmaSeq.join(' ').toLowerCase()),
    formsFor: (form) => forms[form] ?? [],
  };
}

function matches(text: string, dict: Dictionary) {
  return matchPhrases(tokenize(text), dict).map((match) => ({
    ...match,
    source: text.slice(match.start, match.end),
  }));
}

describe('matchPhrases', () => {
  it('matches inflected phrases with gaps', () => {
    const result = matches(
      'He took his plan into account.',
      dictionary([['take', 'into', 'account']], { took: ['take'] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'took his plan into account',
      surface: 'took his plan into account',
      lemma: 'take into account',
    });
    expect(result[0]?.tokenIndices).toHaveLength(3);
  });

  it('matches phrases with up to three inserted words', () => {
    const dict = dictionary([['give', 'up']], { gave: ['give'] });
    expect(matches('She gave it up.', dict)[0]).toMatchObject({
      source: 'gave it up',
      lemma: 'give up',
    });
    expect(matches('She gave one two three four up.', dict)).toEqual([]);
  });

  it('does not match across sentence boundaries', () => {
    const dict = dictionary([['give', 'up']], { gave: ['give'] });
    expect(matches('She gave. It up.', dict)).toEqual([]);
  });

  it('keeps the longest overlapping match', () => {
    const result = matches(
      'He took it into account.',
      dictionary(
        [
          ['into', 'account'],
          ['take', 'into', 'account'],
        ],
        { took: ['take'] },
      ),
    );
    expect(result.map((match) => match.lemma)).toEqual(['take into account']);
  });

  it('returns matches ordered by position and offsets reconstruct the text', () => {
    const text = 'It takes courage. Give it up.';
    const result = matches(
      text,
      dictionary([
        ['take', 'courage'],
        ['give', 'up'],
      ]),
    );
    expect(result.map((match) => match.source)).toEqual(['takes courage', 'Give it up']);
    expect(result.map((match) => text.slice(match.start, match.end))).toEqual([
      'takes courage',
      'Give it up',
    ]);
  });
});
