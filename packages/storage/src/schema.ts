export interface Migration {
  version: number;
  statements: readonly string[];
}

export const SCHEMA_VERSION = 1;

/**
 * SQLite schema v1. This is the contract shared by the Web (wa-sqlite) and iOS
 * (Capacitor SQLite) layers. Keep column names in sync with Spec §4.3.
 */
export const SCHEMA_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        lang TEXT NOT NULL,
        format TEXT NOT NULL,
        pipelineVersion INTEGER NOT NULL,
        coverAssetId TEXT,
        importedAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER
      )`,
      `CREATE TABLE chapters (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        "index" INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        tocLevel INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE UNIQUE INDEX chapters_book_index ON chapters(bookId, "index")`,
      `CREATE TABLE blocks (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        chapterIndex INTEGER NOT NULL,
        "index" INTEGER NOT NULL,
        type TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        marksJson TEXT NOT NULL DEFAULT '[]',
        imageJson TEXT
      )`,
      `CREATE UNIQUE INDEX blocks_chapter_index ON blocks(bookId, chapterIndex, "index")`,
      `CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        text TEXT NOT NULL DEFAULT '',
        marksJson TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE INDEX notes_book ON notes(bookId)`,
      `CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        mime TEXT NOT NULL,
        path TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX assets_book ON assets(bookId)`,
      `CREATE TABLE sentences (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        blockId TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
        chapterIndex INTEGER NOT NULL,
        "index" INTEGER NOT NULL,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL,
        text TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE INDEX sentences_book_order ON sentences(bookId, chapterIndex, "index")`,
      `CREATE INDEX sentences_block_order ON sentences(blockId, "index")`,
      `CREATE TABLE chunks (
        sentenceId TEXT NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
        "index" INTEGER NOT NULL,
        start INTEGER NOT NULL,
        end INTEGER NOT NULL,
        PRIMARY KEY (sentenceId, "index")
      )`,
      `CREATE TABLE progress (
        id TEXT PRIMARY KEY,
        bookId TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        locatorJson TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER
      )`,
      `CREATE UNIQUE INDEX progress_book ON progress(bookId) WHERE deletedAt IS NULL`,
      `CREATE TABLE vocab (
        id TEXT PRIMARY KEY,
        lemma TEXT NOT NULL,
        surface TEXT NOT NULL,
        lang TEXT NOT NULL,
        sentenceText TEXT NOT NULL DEFAULT '',
        locatorJson TEXT NOT NULL,
        meaning TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('learning', 'known')),
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        deletedAt INTEGER
      )`,
      `CREATE INDEX vocab_lemma ON vocab(lang, lemma)`,
      `CREATE TABLE llm_cache (
        key TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        resultJson TEXT NOT NULL,
        model TEXT NOT NULL,
        promptVersion TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )`,
      `CREATE INDEX llm_cache_task ON llm_cache(task)`,
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        valueJson TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      )`,
    ],
  },
];
