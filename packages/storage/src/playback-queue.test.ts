import { importTxt, type Block } from '@garagara/core';
import { afterEach, describe, expect, it } from 'vitest';

import { importBookToStorage } from './import-pipeline.js';
import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';
import { listPlayableSentences } from './repository.js';

const adapters: NodeSqliteAdapter[] = [];

function createAdapter(): NodeSqliteAdapter {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  return adapter;
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('listPlayableSentences', () => {
  it('returns every sentence in reading order with a start locator', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    const bytes = new TextEncoder().encode(
      [
        'CHAPTER I',
        '',
        'One sentence. Another sentence!',
        '',
        'A second paragraph.',
        '',
        'CHAPTER II',
        '',
        'Done.',
      ].join('\n'),
    );
    const book = await importTxt(bytes, 'short.txt');
    const stats = await importBookToStorage(adapter, book);

    const rows = await listPlayableSentences(adapter, book.bookId);

    expect(rows).toHaveLength(stats.sentences);
    const blocks = new Map<string, Block>(
      book.chapters.flatMap((chapter) => chapter.blocks.map((block) => [block.id, block])),
    );
    let previousChapter = -1;
    let previousBlock = -1;
    for (const row of rows) {
      expect(row.locator.bookId).toBe(book.bookId);
      expect(row.locator.chapterIndex).toBeGreaterThanOrEqual(previousChapter);
      if (row.locator.chapterIndex === previousChapter) {
        expect(row.locator.blockIndex).toBeGreaterThanOrEqual(previousBlock);
      }
      previousChapter = row.locator.chapterIndex;
      previousBlock = row.locator.blockIndex;

      const block = [...blocks.values()].find(
        (item) =>
          item.chapterIndex === row.locator.chapterIndex && item.index === row.locator.blockIndex,
      );
      expect(block).toBeDefined();
      expect(block?.text.slice(row.locator.offset, row.locator.offset + row.text.length)).toBe(
        row.text,
      );
    }
    expect(rows.every((row) => row.text.trim().length > 0)).toBe(true);
  });
});
