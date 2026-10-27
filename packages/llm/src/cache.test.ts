import { migrate } from '@garagara/storage';
import { NodeSqliteAdapter } from '@garagara/storage/node';
import { afterEach, describe, expect, it } from 'vitest';

import { buildLlmCacheKey } from './cache-key.js';
import { LlmCache } from './cache.js';
import type { LlmCacheKeyInput } from './cache-key.js';

interface CacheRow {
  key: string;
  task: string;
  resultJson: string;
  model: string;
  promptVersion: string;
  createdAt: number;
}

const adapters: NodeSqliteAdapter[] = [];
const CREATED_AT = 1_700_000_000_000;

const base: LlmCacheKeyInput = {
  task: 'wordInContext',
  sentence: 'She took his advice into account.',
  targetWord: 'took',
  l2: 'en',
  explainLang: 'zh',
  model: 'test-model',
  promptVersion: 'wordInContext/v1',
};

async function setup(now: () => number = () => CREATED_AT): Promise<{
  adapter: NodeSqliteAdapter;
  cache: LlmCache;
}> {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  await migrate(adapter);
  return { adapter, cache: new LlmCache(adapter, { now }) };
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('LlmCache', () => {
  it('stores a result and returns it on a cache hit', async () => {
    const { adapter, cache } = await setup();
    const result = { lemma: 'take', pos: 'v.', meaning: '考虑' };

    await expect(cache.get(base)).resolves.toBeUndefined();
    const key = await cache.set(base, result);

    expect(key).toHaveLength(64);
    await expect(cache.get(base)).resolves.toEqual(result);

    const rows = await adapter.all<CacheRow>(
      'SELECT key, task, resultJson, model, promptVersion, createdAt FROM llm_cache',
    );
    expect(rows).toEqual([
      {
        key,
        task: 'wordInContext',
        resultJson: JSON.stringify(result),
        model: 'test-model',
        promptVersion: 'wordInContext/v1',
        createdAt: CREATED_AT,
      },
    ]);
  });

  it('updates rather than duplicates when the same key is stored again', async () => {
    let clock = CREATED_AT;
    const { adapter, cache } = await setup(() => clock);

    await cache.set(base, { meaning: 'consider' });
    clock += 1_000;
    await cache.set(base, { meaning: 'take into account' });

    await expect(cache.get(base)).resolves.toEqual({ meaning: 'take into account' });
    const rows = await adapter.all<CacheRow>('SELECT * FROM llm_cache');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe(CREATED_AT + 1_000);
  });

  it('misses when any part of the key changes', async () => {
    const { cache } = await setup();
    await cache.set(base, { meaning: '考虑' });

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
      { ...base, sentence: 'Another sentence.' },
      { ...base, targetWord: 'account' },
      { ...base, l2: 'fr' },
      { ...base, explainLang: 'ja' },
      { ...base, model: 'other-model' },
      withoutTarget,
    ];

    for (const variant of variants) {
      await expect(cache.get(variant)).resolves.toBeUndefined();
    }
  });

  it('invalidates cached results when the prompt version changes', async () => {
    const { adapter, cache } = await setup();
    const v1 = { meaning: '旧提示词结果' };
    const v2 = { meaning: '新提示词结果' };
    const bumped: LlmCacheKeyInput = { ...base, promptVersion: 'wordInContext/v2' };

    await cache.set(base, v1);
    await expect(cache.get(bumped)).resolves.toBeUndefined();

    await cache.set(bumped, v2);
    await expect(cache.get(base)).resolves.toEqual(v1);
    await expect(cache.get(bumped)).resolves.toEqual(v2);
    expect(await adapter.all('SELECT * FROM llm_cache')).toHaveLength(2);
  });

  it('treats an unreadable cached row as a miss', async () => {
    const { adapter, cache } = await setup();
    const key = await buildLlmCacheKey(base);
    await adapter.run(
      `INSERT INTO llm_cache (key, task, resultJson, model, promptVersion, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [key, base.task, 'not json', base.model, base.promptVersion, CREATED_AT],
    );

    await expect(cache.get(base)).resolves.toBeUndefined();
  });
});
