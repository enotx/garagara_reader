import { describe, expect, it } from 'vitest';

import {
  buildBatchPreprocessMessages,
  parseBatchPreprocessResult,
  type BatchPreprocessSentence,
} from './batch-preprocess.js';
import { LlmError } from './provider.js';

const sentences: BatchPreprocessSentence[] = [
  { id: 's1', text: 'She took his advice into account.' },
  { id: 's2', text: 'The children ran away.' },
];

describe('batchPreprocess prompt', () => {
  it('sends sentence ids and asks for the documented JSON shape', () => {
    const messages = buildBatchPreprocessMessages({ sentences, explainLang: 'zh' });

    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[0]?.content).toContain('Simplified Chinese');
    expect(messages[1]?.content).toContain('"id":"s1"');
    expect(messages[1]?.content).toContain('"hardWords"');
  });

  it('rejects empty, duplicate or blank sentences', () => {
    expect(() => buildBatchPreprocessMessages({ sentences: [], explainLang: 'zh' })).toThrow(
      RangeError,
    );
    expect(() =>
      buildBatchPreprocessMessages({
        sentences: [sentences[0]!, { ...sentences[0]! }],
        explainLang: 'zh',
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      buildBatchPreprocessMessages({ sentences: [{ id: 's1', text: ' ' }], explainLang: 'zh' }),
    ).toThrow(RangeError);
    expect(() =>
      buildBatchPreprocessMessages({ sentences: [{ id: '', text: 'Hi.' }], explainLang: 'zh' }),
    ).toThrow(RangeError);
  });
});

describe('batchPreprocess result parsing', () => {
  it('resolves phrase and hard-word spans inside each source sentence', () => {
    const result = parseBatchPreprocessResult(
      JSON.stringify({
        items: [
          {
            id: 's1',
            translation: '她把他的建议考虑在内。',
            phrases: [
              { text: 'took his advice into account', lemma: 'take into account', meaning: '考虑' },
            ],
            hardWords: [{ text: 'advice', lemma: 'advice', meaning: '建议' }],
          },
          {
            id: 's2',
            translation: '孩子们跑开了。',
            phrases: [],
            hardWords: [{ text: 'ran away', lemma: 'run away', meaning: '跑开' }],
          },
        ],
      }),
      sentences,
    );

    expect(result).toEqual({
      items: [
        {
          id: 's1',
          translation: '她把他的建议考虑在内。',
          phrases: [
            {
              text: 'took his advice into account',
              lemma: 'take into account',
              meaning: '考虑',
              start: 4,
              end: 32,
            },
          ],
          hardWords: [{ text: 'advice', lemma: 'advice', meaning: '建议', start: 13, end: 19 }],
        },
        {
          id: 's2',
          translation: '孩子们跑开了。',
          phrases: [],
          hardWords: [{ text: 'ran away', lemma: 'run away', meaning: '跑开', start: 13, end: 21 }],
        },
      ],
    });
  });

  it('drops unknown ids, duplicates and fragments not present in the source', () => {
    const result = parseBatchPreprocessResult(
      JSON.stringify({
        items: [
          {
            id: 's1',
            translation: '译文',
            phrases: [{ text: 'take into account', lemma: 'take into account', meaning: '考虑' }],
            hardWords: [{ text: 'advice', lemma: 'advice', meaning: '建议' }],
          },
          { id: 's1', translation: '重复', phrases: [], hardWords: [] },
          { id: 'unknown', translation: '忽略', phrases: [], hardWords: [] },
          { id: 's2', translation: '', phrases: [], hardWords: [] },
          'not an object',
        ],
      }),
      sentences,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('s1');
    expect(result.items[0]?.phrases).toEqual([]);
    expect(result.items[0]?.hardWords).toHaveLength(1);
  });

  it('accepts a fenced JSON object', () => {
    const result = parseBatchPreprocessResult(
      '```json\n{"items":[{"id":"s2","translation":"孩子们跑开了。"}]}\n```',
      sentences,
    );
    expect(result.items).toEqual([
      { id: 's2', translation: '孩子们跑开了。', phrases: [], hardWords: [] },
    ]);
  });

  it('rejects responses without an items array', () => {
    expect(() => parseBatchPreprocessResult('{}', sentences)).toThrow(LlmError);
    expect(() => parseBatchPreprocessResult('{"items":{}}', sentences)).toThrow(/items/);
  });
});
