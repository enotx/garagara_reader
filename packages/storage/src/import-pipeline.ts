import type { ImportedBook } from '@garagara/core';
import { sentenceId } from '@garagara/core';
import { chunk, splitSentences } from '@garagara/lang-en';

import type { SqliteAdapter } from './adapter.js';
import { withTransaction } from './transaction.js';

export interface ImportStats {
  chapters: number;
  blocks: number;
  notes: number;
  assets: number;
  sentences: number;
  chunks: number;
}

export interface ImportOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

/**
 * Writes a normalized book into the SQLite tables. Sentences and chunks are
 * computed here so the native playback engine can read them directly.
 */
export async function importBookToStorage(
  adapter: SqliteAdapter,
  book: ImportedBook,
  options: ImportOptions = {},
): Promise<ImportStats> {
  const now = options.now ?? Date.now;
  const timestamp = now();
  const stats: ImportStats = {
    chapters: 0,
    blocks: 0,
    notes: 0,
    assets: 0,
    sentences: 0,
    chunks: 0,
  };

  await withTransaction(adapter, async () => {
    await adapter.run('DELETE FROM books WHERE id = ?', [book.bookId]);
    await adapter.run(
      `INSERT INTO books
        (id, title, author, lang, format, pipelineVersion, coverAssetId, importedAt, updatedAt, deletedAt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
      [
        book.bookId,
        book.metadata.title,
        book.metadata.author,
        book.metadata.lang,
        book.metadata.format,
        book.pipelineVersion,
        timestamp,
        timestamp,
      ],
    );

    for (const chapter of book.chapters) {
      await adapter.run(
        'INSERT INTO chapters (id, bookId, "index", title, tocLevel) VALUES (?, ?, ?, ?, ?)',
        [chapter.id, book.bookId, chapter.index, chapter.title, chapter.tocLevel],
      );
      stats.chapters += 1;

      for (const block of chapter.blocks) {
        await adapter.run(
          `INSERT INTO blocks
            (id, bookId, chapterIndex, "index", type, text, marksJson, imageJson)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            block.id,
            book.bookId,
            block.chapterIndex,
            block.index,
            block.type,
            block.text,
            JSON.stringify(block.marks),
            block.image ? JSON.stringify(block.image) : null,
          ],
        );
        stats.blocks += 1;

        if (!block.text) {
          continue;
        }
        const sentences = splitSentences(block.text);
        for (const [index, range] of sentences.entries()) {
          const id = sentenceId(book.bookId, chapter.index, block.index, index);
          const text = block.text.slice(range.start, range.end);
          await adapter.run(
            `INSERT INTO sentences
              (id, bookId, blockId, chapterIndex, "index", start, end, text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, book.bookId, block.id, chapter.index, index, range.start, range.end, text],
          );
          stats.sentences += 1;

          const chunks = chunk(text);
          for (const [chunkIndex, chunkRange] of chunks.entries()) {
            await adapter.run(
              'INSERT INTO chunks (sentenceId, "index", start, end) VALUES (?, ?, ?, ?)',
              [id, chunkIndex, range.start + chunkRange.start, range.start + chunkRange.end],
            );
            stats.chunks += 1;
          }
        }
      }
    }

    for (const note of book.notes) {
      await adapter.run('INSERT INTO notes (id, bookId, text, marksJson) VALUES (?, ?, ?, ?)', [
        note.id,
        book.bookId,
        note.text,
        JSON.stringify(note.marks),
      ]);
      stats.notes += 1;
    }

    for (const asset of book.assets) {
      await adapter.run(
        'INSERT INTO assets (id, bookId, mime, path, width, height) VALUES (?, ?, ?, ?, ?, ?)',
        [asset.id, book.bookId, asset.mime, asset.path, asset.width, asset.height],
      );
      stats.assets += 1;
    }
  });

  return stats;
}
