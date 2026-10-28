import type { Locator } from '@garagara/core';
import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';
import { addVocab, findVocab, listVocab, removeVocab, setVocabStatus } from './repository.js';

const adapters: NodeSqliteAdapter[] = [];
const NOW = 1_700_000_000_000;

const locator: Locator = { bookId: 'book', chapterIndex: 2, blockIndex: 1, offset: 4 };

async function createAdapter(): Promise<NodeSqliteAdapter> {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  await migrate(adapter);
  return adapter;
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('vocabulary repository', () => {
  it('adds an entry with the sentence snapshot and Locator', async () => {
    const adapter = await createAdapter();
    const id = await addVocab(
      adapter,
      {
        lemma: 'take into account',
        surface: 'took',
        lang: 'en',
        sentenceText: 'She took it into account.',
        locator,
        meaning: '把……考虑在内',
        source: 'llm',
      },
      NOW,
    );

    await expect(findVocab(adapter, 'TAKE INTO ACCOUNT', 'en')).resolves.toMatchObject({
      id,
      lemma: 'take into account',
      surface: 'took',
      sentenceText: 'She took it into account.',
      locator,
      meaning: '把……考虑在内',
      source: 'llm',
      status: 'learning',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('soft-deletes and re-adds a word', async () => {
    const adapter = await createAdapter();
    const id = await addVocab(
      adapter,
      {
        lemma: 'take',
        surface: 'took',
        lang: 'en',
        sentenceText: 'She took it.',
        locator,
      },
      NOW,
    );

    await removeVocab(adapter, id, NOW + 1);
    await expect(findVocab(adapter, 'take', 'en')).resolves.toBeUndefined();
    await expect(listVocab(adapter)).resolves.toEqual([]);

    const second = await addVocab(
      adapter,
      {
        lemma: 'take',
        surface: 'takes',
        lang: 'en',
        sentenceText: 'She takes it.',
        locator,
      },
      NOW + 2,
    );
    expect(second).not.toBe(id);
    await expect(listVocab(adapter)).resolves.toHaveLength(1);
  });

  it('marks entries as known and lists newest first', async () => {
    const adapter = await createAdapter();
    const first = await addVocab(
      adapter,
      { lemma: 'alpha', surface: 'alpha', lang: 'en', sentenceText: 'alpha', locator },
      NOW,
    );
    const second = await addVocab(
      adapter,
      { lemma: 'beta', surface: 'beta', lang: 'en', sentenceText: 'beta', locator },
      NOW + 10,
    );

    await setVocabStatus(adapter, first, 'known', NOW + 20);
    const entries = await listVocab(adapter);
    expect(entries.map((entry) => entry.lemma)).toEqual(['beta', 'alpha']);
    expect(entries.find((entry) => entry.id === first)?.status).toBe('known');
    expect(entries.find((entry) => entry.id === second)?.status).toBe('learning');
  });
});
