import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { importBook, importTxt } from '@garagara/core';
import { afterEach, describe, expect, it } from 'vitest';

import { importBookToStorage } from './import-pipeline.js';
import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';

const adapters: NodeSqliteAdapter[] = [];

function createAdapter(): NodeSqliteAdapter {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  return adapter;
}

function readFixture(path: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../../fixtures/${path}`, import.meta.url))),
  );
}

async function rowCount(adapter: NodeSqliteAdapter, table: string): Promise<number> {
  const row = await adapter.get<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  return row?.total ?? 0;
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('importBookToStorage', () => {
  it('writes books, chapters, blocks, notes, assets, sentences and chunks', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    const book = await importBook(readFixture('epub/messy-structure.epub'), 'messy.epub');
    const stats = await importBookToStorage(adapter, book, { now: () => 1234 });

    expect(stats).toMatchObject({
      chapters: 2,
      notes: 3,
      assets: 2,
    });
    expect(stats.blocks).toBeGreaterThan(0);
    expect(stats.sentences).toBeGreaterThan(0);
    expect(stats.chunks).toBeGreaterThan(0);

    expect(await rowCount(adapter, 'books')).toBe(1);
    expect(await rowCount(adapter, 'chapters')).toBe(stats.chapters);
    expect(await rowCount(adapter, 'blocks')).toBe(stats.blocks);
    expect(await rowCount(adapter, 'notes')).toBe(stats.notes);
    expect(await rowCount(adapter, 'assets')).toBe(stats.assets);
    expect(await rowCount(adapter, 'sentences')).toBe(stats.sentences);
    expect(await rowCount(adapter, 'chunks')).toBe(stats.chunks);

    const bookRow = await adapter.get<{ importedAt: number; title: string }>(
      'SELECT importedAt, title FROM books WHERE id = ?',
      [book.bookId],
    );
    expect(bookRow).toEqual({ importedAt: 1234, title: book.metadata.title });
  });

  it('stores sentence text and block-relative chunk offsets', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    const book = await importBook(readFixture('epub/messy-structure.epub'), 'messy.epub');
    await importBookToStorage(adapter, book);

    const blockTexts = new Map(
      book.chapters.flatMap((chapter) => chapter.blocks.map((block) => [block.id, block.text])),
    );
    const sentences = await adapter.all<{
      id: string;
      blockId: string;
      start: number;
      end: number;
      text: string;
    }>('SELECT id, blockId, start, end, text FROM sentences');
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      const blockText = blockTexts.get(sentence.blockId);
      expect(blockText).toBeDefined();
      expect(sentence.text).toBe(blockText?.slice(sentence.start, sentence.end));
    }

    const chunks = await adapter.all<{ sentenceId: string; start: number; end: number }>(
      'SELECT sentenceId, start, end FROM chunks',
    );
    const sentenceById = new Map(sentences.map((sentence) => [sentence.id, sentence]));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const sentence = sentenceById.get(chunk.sentenceId);
      expect(sentence).toBeDefined();
      expect(chunk.start).toBeGreaterThanOrEqual(sentence?.start ?? 0);
      expect(chunk.end).toBeLessThanOrEqual(sentence?.end ?? 0);
      expect(chunk.end).toBeGreaterThan(chunk.start);
    }
  });

  it('is idempotent for the same book', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    const bytes = new TextEncoder().encode(
      ['CHAPTER I', '', 'One sentence. Another sentence.', '', 'CHAPTER II', '', 'Done.'].join(
        '\n',
      ),
    );
    const book = await importTxt(bytes, 'short.txt');
    const first = await importBookToStorage(adapter, book);
    const second = await importBookToStorage(adapter, book);
    expect(second).toEqual(first);
    expect(await rowCount(adapter, 'books')).toBe(1);
    expect(await rowCount(adapter, 'sentences')).toBe(first.sentences);
    expect(await rowCount(adapter, 'chunks')).toBe(first.chunks);
  });
});
