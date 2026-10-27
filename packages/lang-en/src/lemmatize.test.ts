import { describe, expect, it } from 'vitest';

import { createLemmatizer, lemmatize } from './lemmatize.js';
import { tokenize } from './tokenize.js';

const forms = {
  formsFor(form: string): readonly string[] {
    const irregular: Record<string, string[]> = {
      took: ['take'],
      taken: ['take'],
      children: ['child'],
      better: ['good'],
      best: ['good'],
    };
    return irregular[form] ?? [];
  },
};

function firstWord(text: string) {
  return tokenize(text).find((token) => token.isWord);
}

describe('lemmatize', () => {
  it('prefers ECDICT irregular forms', () => {
    expect(lemmatize(firstWord('took')!, [], forms)[0]).toBe('take');
    expect(lemmatize(firstWord('children')!, [], forms)[0]).toBe('child');
    expect(lemmatize(firstWord('better')!, [], forms)[0]).toBe('good');
  });

  it('falls back to suffix rules', () => {
    expect(lemmatize(firstWord('walked')!)[0]).toBe('walk');
    expect(lemmatize(firstWord('running')!)[0]).toBe('run');
    expect(lemmatize(firstWord('studies')!)[0]).toBe('study');
    expect(lemmatize(firstWord('boxes')!)[0]).toBe('box');
    expect(lemmatize(firstWord('stopped')!)[0]).toBe('stop');
    expect(lemmatize(firstWord('happier')!)[0]).toBe('happy');
  });

  it('handles possessives and preserves the surface as a candidate', () => {
    expect(lemmatize(firstWord("reader's")!)).toEqual(['reader', "reader's"]);
    expect(lemmatize(firstWord('Took')!, [], forms)).toEqual(['take', 'took']);
  });

  it('returns no lemmas for punctuation and supports the pack factory', () => {
    const punctuation = tokenize('.').find((token) => !token.isWord);
    expect(lemmatize(punctuation!)).toEqual([]);
    expect(createLemmatizer(forms)(firstWord('better')!, [])[0]).toBe('good');
  });
});
