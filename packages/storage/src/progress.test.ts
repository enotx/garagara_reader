import type { Locator } from '@garagara/core';
import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';
import { getProgress, saveProgress } from './repository.js';

const adapters: NodeSqliteAdapter[] = [];
const NOW = 1_700_000_000_000;

async function createAdapter(): Promise<NodeSqliteAdapter> {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  await migrate(adapter);
  return adapter;
}

function locator(bookId: string, chapterIndex: number, blockIndex: number, offset: number): Locator {
  return { bookId, chapterIndex, blockIndex, offset };
}

async function insertBook(adapter: NodeSqliteAdapter, id: string): Promise<void> {
  await adapter.run(
    `INSERT INTO books
       (id, title, author, lang, format, pipelineVersion, coverAssetId, importedAt, updatedAt, deletedAt)
     VALUES (?, ?, '', 'en', 'txt', 1, NULL, ?, ?, NULL)`,
    [id, id, NOW, NOW],
  );
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('reading progress repository', () => {
  it('returns undefined before the first save', async () => {
    const adapter = await createAdapter();
    await insertBook(adapter, 'book');
    await expect(getProgress(adapter, 'book')).resolves.toBeUndefined();
  });

  it('stores a Locator and returns the latest value', async () => {
    const adapter = await createAdapter();
    await insertBook(adapter, 'book');
    const first = locator('book', 0, 2, 10);
    const second = locator('book', 3, 1, 42);

    await saveProgress(adapter, 'book', first, NOW);
    await expect(getProgress(adapter, 'book')).resolves.toEqual(first);

    await saveProgress(adapter, 'book', second, NOW + 1);
    await expect(getProgress(adapter, 'book')).resolves.toEqual(second);
  });

  it('keeps progress separate per book', async () => {
    const adapter = await createAdapter();
    await insertBook(adapter, 'book-a');
    await insertBook(adapter, 'book-b');
    await saveProgress(adapter, 'book-a', locator('book-a', 1, 0, 3), NOW);
    await saveProgress(adapter, 'book-b', locator('book-b', 2, 0, 8), NOW);

    await expect(getProgress(adapter, 'book-a')).resolves.toMatchObject({
      bookId: 'book-a',
      chapterIndex: 1,
    });
    await expect(getProgress(adapter, 'book-b')).resolves.toMatchObject({
      bookId: 'book-b',
      chapterIndex: 2,
    });
  });
});
