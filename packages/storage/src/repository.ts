import type { Block, Chunk, ImageInfo, Locator, Mark, Note, Sentence } from '@garagara/core';
import { uuidv7 } from '@garagara/core';

import type { SqliteAdapter } from './adapter.js';

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  lang: string;
  format: string;
  pipelineVersion: number;
  importedAt: number;
  updatedAt: number;
}

export interface ChapterSummary {
  id: string;
  index: number;
  title: string;
  tocLevel: number;
}

export interface StoredChapter extends ChapterSummary {
  blocks: Block[];
  sentences: Sentence[];
  chunks: Chunk[];
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function listBooks(adapter: SqliteAdapter): Promise<BookSummary[]> {
  return adapter.all<BookSummary>(
    `SELECT id, title, author, lang, format, pipelineVersion, importedAt, updatedAt
     FROM books WHERE deletedAt IS NULL ORDER BY importedAt DESC, id`,
  );
}

export async function getBook(
  adapter: SqliteAdapter,
  bookId: string,
): Promise<BookSummary | undefined> {
  return adapter.get<BookSummary>(
    `SELECT id, title, author, lang, format, pipelineVersion, importedAt, updatedAt
     FROM books WHERE id = ? AND deletedAt IS NULL`,
    [bookId],
  );
}

export async function listChapters(
  adapter: SqliteAdapter,
  bookId: string,
): Promise<ChapterSummary[]> {
  return adapter.all<ChapterSummary>(
    'SELECT id, "index", title, tocLevel FROM chapters WHERE bookId = ? ORDER BY "index"',
    [bookId],
  );
}

/** Character counts per chapter, used for Spec §5 percentage progress. */
export async function listChapterCharCounts(
  adapter: SqliteAdapter,
  bookId: string,
): Promise<number[]> {
  const rows = await adapter.all<{ chapterIndex: number; characters: number | null }>(
    'SELECT chapterIndex, SUM(LENGTH(text)) AS characters FROM blocks WHERE bookId = ? GROUP BY chapterIndex ORDER BY chapterIndex',
    [bookId],
  );
  if (rows.length === 0) {
    return [];
  }
  const counts: number[] = [];
  for (const row of rows) {
    counts[row.chapterIndex] = row.characters ?? 0;
  }
  return counts.map((value) => value ?? 0);
}

interface BlockRow {
  id: string;
  chapterIndex: number;
  index: number;
  type: Block['type'];
  text: string;
  marksJson: string;
  imageJson: string | null;
}

interface SentenceRow {
  id: string;
  blockId: string;
  index: number;
  start: number;
  end: number;
  text: string;
}

/** Loads one chapter with blocks and sentences for rendering. */
export async function getChapter(
  adapter: SqliteAdapter,
  bookId: string,
  chapterIndex: number,
): Promise<StoredChapter | undefined> {
  const chapter = await adapter.get<ChapterSummary>(
    'SELECT id, "index", title, tocLevel FROM chapters WHERE bookId = ? AND "index" = ?',
    [bookId, chapterIndex],
  );
  if (!chapter) {
    return undefined;
  }

  const blockRows = await adapter.all<BlockRow>(
    `SELECT id, chapterIndex, "index", type, text, marksJson, imageJson
     FROM blocks WHERE bookId = ? AND chapterIndex = ? ORDER BY "index"`,
    [bookId, chapterIndex],
  );
  const blocks: Block[] = blockRows.map((row) => {
    const image = parseJson<ImageInfo | undefined>(row.imageJson, undefined);
    return {
      id: row.id,
      chapterIndex: row.chapterIndex,
      index: row.index,
      type: row.type,
      text: row.text,
      marks: parseJson<Mark[]>(row.marksJson, []),
      ...(image ? { image } : {}),
    };
  });

  const sentenceRows = await adapter.all<SentenceRow>(
    `SELECT s.id, s.blockId, s."index", s.start, s.end, s.text
     FROM sentences s
     JOIN blocks b ON b.id = s.blockId
     WHERE s.bookId = ? AND s.chapterIndex = ?
     ORDER BY b."index", s."index"`,
    [bookId, chapterIndex],
  );
  const sentences: Sentence[] = sentenceRows.map((row) => ({
    id: row.id,
    blockId: row.blockId,
    index: row.index,
    start: row.start,
    end: row.end,
  }));

  const chunkRows = await adapter.all<Chunk>(
    `SELECT c.sentenceId, c."index", c.start, c.end
     FROM chunks c
     JOIN sentences s ON s.id = c.sentenceId
     WHERE s.bookId = ? AND s.chapterIndex = ?
     ORDER BY s.blockId, s."index", c."index"`,
    [bookId, chapterIndex],
  );

  return {
    ...chapter,
    blocks,
    sentences,
    chunks: chunkRows,
  };
}

export async function listNotes(adapter: SqliteAdapter, bookId: string): Promise<Note[]> {
  const rows = await adapter.all<{ id: string; text: string; marksJson: string }>(
    'SELECT id, text, marksJson FROM notes WHERE bookId = ? ORDER BY id',
    [bookId],
  );
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    marks: parseJson<Mark[]>(row.marksJson, []),
  }));
}

export async function getNote(adapter: SqliteAdapter, noteId: string): Promise<Note | undefined> {
  const row = await adapter.get<{ id: string; text: string; marksJson: string }>(
    'SELECT id, text, marksJson FROM notes WHERE id = ?',
    [noteId],
  );
  if (!row) {
    return undefined;
  }
  return { id: row.id, text: row.text, marks: parseJson<Mark[]>(row.marksJson, []) };
}

/** Reads a JSON setting by key, treating missing or corrupt rows as unset. */
export async function getSetting<T>(adapter: SqliteAdapter, key: string): Promise<T | undefined> {
  const row = await adapter.get<{ valueJson: string }>(
    'SELECT valueJson FROM settings WHERE key = ?',
    [key],
  );
  if (!row) {
    return undefined;
  }
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return undefined;
  }
}

/** Writes a JSON setting, replacing the previous value atomically. */
export async function setSetting<T>(
  adapter: SqliteAdapter,
  key: string,
  value: T,
  now: number = Date.now(),
): Promise<void> {
  const valueJson = JSON.stringify(value);
  if (valueJson === undefined) {
    throw new TypeError('Setting value must be JSON-serializable');
  }
  await adapter.run(
    `INSERT INTO settings (key, valueJson, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET valueJson = excluded.valueJson, updatedAt = excluded.updatedAt`,
    [key, valueJson, now],
  );
}

export interface VocabEntry {
  id: string;
  lemma: string;
  surface: string;
  lang: string;
  sentenceText: string;
  locator: Locator;
  meaning: string;
  source: string;
  status: 'learning' | 'known';
  createdAt: number;
  updatedAt: number;
}

export interface NewVocab {
  lemma: string;
  surface: string;
  lang: string;
  sentenceText: string;
  locator: Locator;
  meaning?: string;
  source?: string;
  status?: 'learning' | 'known';
}

interface VocabRow {
  id: string;
  lemma: string;
  surface: string;
  lang: string;
  sentenceText: string;
  locatorJson: string;
  meaning: string;
  source: string;
  status: 'learning' | 'known';
  createdAt: number;
  updatedAt: number;
}

function toVocabEntry(row: VocabRow): VocabEntry {
  return {
    id: row.id,
    lemma: row.lemma,
    surface: row.surface,
    lang: row.lang,
    sentenceText: row.sentenceText,
    locator: parseJson<Locator>(row.locatorJson, {
      bookId: '',
      chapterIndex: 0,
      blockIndex: 0,
      offset: 0,
    }),
    meaning: row.meaning,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const VOCAB_COLUMNS =
  'id, lemma, surface, lang, sentenceText, locatorJson, meaning, source, status, createdAt, updatedAt';

/** Finds an active vocabulary entry for a lemma in one language. */
export async function findVocab(
  adapter: SqliteAdapter,
  lemma: string,
  lang: string,
): Promise<VocabEntry | undefined> {
  const row = await adapter.get<VocabRow>(
    `SELECT ${VOCAB_COLUMNS} FROM vocab
     WHERE lemma = ? COLLATE NOCASE AND lang = ? AND deletedAt IS NULL
     ORDER BY createdAt DESC LIMIT 1`,
    [lemma, lang],
  );
  return row ? toVocabEntry(row) : undefined;
}

/** Adds a vocabulary entry with the book sentence snapshot and Locator. */
export async function addVocab(
  adapter: SqliteAdapter,
  input: NewVocab,
  now: number = Date.now(),
): Promise<string> {
  const id = uuidv7(now);
  await adapter.run(
    `INSERT INTO vocab
       (id, lemma, surface, lang, sentenceText, locatorJson, meaning, source, status, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.lemma,
      input.surface,
      input.lang,
      input.sentenceText,
      JSON.stringify(input.locator),
      input.meaning ?? '',
      input.source ?? '',
      input.status ?? 'learning',
      now,
      now,
    ],
  );
  return id;
}

export async function removeVocab(
  adapter: SqliteAdapter,
  id: string,
  now: number = Date.now(),
): Promise<void> {
  await adapter.run('UPDATE vocab SET deletedAt = ?, updatedAt = ? WHERE id = ?', [now, now, id]);
}

export async function setVocabStatus(
  adapter: SqliteAdapter,
  id: string,
  status: 'learning' | 'known',
  now: number = Date.now(),
): Promise<void> {
  await adapter.run('UPDATE vocab SET status = ?, updatedAt = ? WHERE id = ?', [status, now, id]);
}

/** Lists active vocabulary entries, newest first. */
export async function listVocab(adapter: SqliteAdapter): Promise<VocabEntry[]> {
  const rows = await adapter.all<VocabRow>(
    `SELECT ${VOCAB_COLUMNS} FROM vocab WHERE deletedAt IS NULL ORDER BY createdAt DESC, id`,
  );
  return rows.map(toVocabEntry);
}

export async function getProgress(
  adapter: SqliteAdapter,
  bookId: string,
): Promise<Locator | undefined> {
  const row = await adapter.get<{ locatorJson: string }>(
    'SELECT locatorJson FROM progress WHERE bookId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 1',
    [bookId],
  );
  return row ? parseJson<Locator | undefined>(row.locatorJson, undefined) : undefined;
}

/** Saves reading progress as a Locator, per Spec §5. */
export async function saveProgress(
  adapter: SqliteAdapter,
  bookId: string,
  locator: Locator,
  now: number = Date.now(),
): Promise<void> {
  const existing = await adapter.get<{ id: string }>(
    'SELECT id FROM progress WHERE bookId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 1',
    [bookId],
  );
  if (existing) {
    await adapter.run('UPDATE progress SET locatorJson = ?, updatedAt = ? WHERE id = ?', [
      JSON.stringify(locator),
      now,
      existing.id,
    ]);
    return;
  }
  await adapter.run(
    'INSERT INTO progress (id, bookId, locatorJson, updatedAt, deletedAt) VALUES (?, ?, ?, ?, NULL)',
    [uuidv7(now), bookId, JSON.stringify(locator), now],
  );
}
