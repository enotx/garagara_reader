import { describe, expect, it } from 'vitest';

import { buildLlmCacheKey, type LlmCacheKeyInput } from './cache-key.js';

const base: LlmCacheKeyInput = {
  task: 'wordInContext',
  sentence: 'She took his advice into account.',
  targetWord: 'took',
  l2: 'en',
  explainLang: 'zh',
  model: 'test-model',
  promptVersion: 'wordInContext/v1',
};

describe('buildLlmCacheKey', () => {
  it('matches the fixed SHA-256 vector from Spec §9.3', async () => {
    await expect(buildLlmCacheKey(base)).resolves.toBe(
      '327ac9497288410d532b4a1b454ba6ed3ca5e4bb0b36893a1b1e133f582a3b7e',
    );
  });

  it('is deterministic', async () => {
    const first = await buildLlmCacheKey(base);
    const second = await buildLlmCacheKey({ ...base });
    expect(second).toBe(first);
  });

  it('changes when any keyed field changes', async () => {
    const result = await buildLlmCacheKey(base);
    const withoutTarget: LlmCacheKeyInput = {
      task: base.task,
      sentence: base.sentence,
      l2: base.l2,
      explainLang: base.explainLang,
      model: base.model,
      promptVersion: base.promptVersion,
    };
    const variants: LlmCacheKeyInput[] = [
      { ...base, task: 'translateSentence' },
      { ...base, sentence: 'She takes his advice into account.' },
      { ...base, targetWord: 'account' },
      { ...base, l2: 'fr' },
      { ...base, explainLang: 'ja' },
      { ...base, model: 'other-model' },
      { ...base, promptVersion: 'wordInContext/v2' },
      withoutTarget,
    ];

    const keys = await Promise.all(variants.map((variant) => buildLlmCacheKey(variant)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(result);
  });
});
