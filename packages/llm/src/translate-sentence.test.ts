import { describe, expect, it } from 'vitest';

import { LlmError } from './provider.js';
import {
  buildTranslateSentenceMessages,
  parseTranslateSentenceResult,
} from './translate-sentence.js';

describe('translateSentence prompt', () => {
  it('builds system and user messages with the target language', () => {
    const messages = buildTranslateSentenceMessages({
      sentence: 'She took it into account.',
      explainLang: 'zh',
    });
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('Simplified Chinese');
    expect(messages[1]?.content).toContain('She took it into account.');
    expect(messages[1]?.content).toContain('"translation"');
  });

  it('rejects an empty sentence', () => {
    expect(() => buildTranslateSentenceMessages({ sentence: '  ', explainLang: 'zh' })).toThrow(
      RangeError,
    );
  });
});

describe('translateSentence result parsing', () => {
  it('parses a translation', () => {
    expect(parseTranslateSentenceResult('{"translation":"她把这件事考虑在内。"}')).toEqual({
      translation: '她把这件事考虑在内。',
    });
  });

  it('accepts a fenced JSON object', () => {
    expect(parseTranslateSentenceResult('```json\n{"translation":"你好"}\n```')).toEqual({
      translation: '你好',
    });
  });

  it('rejects missing or empty translations', () => {
    expect(() => parseTranslateSentenceResult('{}')).toThrow(LlmError);
    expect(() => parseTranslateSentenceResult('{"translation":"   "}')).toThrow(/translation/);
    expect(() => parseTranslateSentenceResult('{"translation":42}')).toThrow(/translation/);
  });
});
