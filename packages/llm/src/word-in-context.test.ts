import { describe, expect, it } from 'vitest';

import { LlmError } from './provider.js';
import {
  buildWordInContextMessages,
  markedSentence,
  parseWordInContextResult,
  type WordInContextInput,
} from './word-in-context.js';

const input: WordInContextInput = {
  sentence: 'She took his advice into account.',
  targetStart: 4,
  targetEnd: 8,
  explainLang: 'zh',
};

describe('wordInContext prompt', () => {
  it('marks the target using offsets rather than text search', () => {
    expect(markedSentence(input)).toBe('She ⟦took⟧ his advice into account.');
    const repeated: WordInContextInput = {
      sentence: 'Take it; take it now.',
      targetStart: 9,
      targetEnd: 13,
      explainLang: 'en',
    };
    expect(markedSentence(repeated)).toBe('Take it; ⟦take⟧ it now.');
  });

  it('builds system and user messages with the explanation language', () => {
    const messages = buildWordInContextMessages(input);
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('Simplified Chinese');
    expect(messages[1]?.content).toContain('She ⟦took⟧ his advice into account.');
    expect(messages[1]?.content).toContain('"phrase"');
  });

  it('rejects offsets outside the sentence', () => {
    expect(() => buildWordInContextMessages({ ...input, targetEnd: 999 })).toThrow(RangeError);
    expect(() => buildWordInContextMessages({ ...input, targetStart: -1 })).toThrow(RangeError);
  });
});

describe('wordInContext result parsing', () => {
  it('parses fields and resolves a phrase back to sentence offsets', () => {
    const result = parseWordInContextResult(
      JSON.stringify({
        lemma: 'take',
        pos: 'v.',
        meaning: '把……考虑在内',
        phrase: { text: 'took his advice into account', lemma: 'take into account' },
      }),
      input.sentence,
    );

    expect(result).toEqual({
      lemma: 'take',
      pos: 'v.',
      meaning: '把……考虑在内',
      phrase: {
        text: 'took his advice into account',
        lemma: 'take into account',
        start: 4,
        end: 32,
      },
    });
  });

  it('drops a phrase that is not present verbatim in the sentence', () => {
    const result = parseWordInContextResult(
      JSON.stringify({
        lemma: 'take',
        pos: 'v.',
        meaning: '考虑',
        phrase: { text: 'take into consideration', lemma: 'take into consideration' },
      }),
      input.sentence,
    );
    expect(result.phrase).toBeUndefined();
    expect(result.meaning).toBe('考虑');
  });

  it('accepts a JSON object wrapped in a markdown fence', () => {
    const result = parseWordInContextResult(
      '```json\n{"lemma":"take","pos":"v.","meaning":"考虑"}\n```',
      input.sentence,
    );
    expect(result).toEqual({ lemma: 'take', pos: 'v.', meaning: '考虑' });
  });

  it('rejects invalid JSON and missing fields', () => {
    expect(() => parseWordInContextResult('not json', input.sentence)).toThrow(LlmError);
    expect(() => parseWordInContextResult('{"lemma":"take","pos":"v."}', input.sentence)).toThrow(
      /meaning/,
    );
  });
});
