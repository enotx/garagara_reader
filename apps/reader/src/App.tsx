import { importBook, type Note } from '@garagara/core';
import type { BookSummary, ChapterSummary, SqliteAdapter, StoredChapter } from '@garagara/storage';
import {
  getChapter,
  importBookToStorage,
  listBooks,
  listChapterCharCounts,
  listChapters,
  listNotes,
  migrate,
} from '@garagara/storage';
import { BrowserSqliteAdapter } from '@garagara/storage/browser';
import { useEffect, useState } from 'react';

import { ReaderView } from './ReaderView';
import { applyTheme, readTheme } from './theme';

let databasePromise: Promise<SqliteAdapter> | undefined;

function openDatabase(): Promise<SqliteAdapter> {
  if (!databasePromise) {
    databasePromise = BrowserSqliteAdapter.open().then(async (adapter) => {
      await migrate(adapter);
      return adapter;
    });
  }
  return databasePromise;
}

export function App() {
  const [status, setStatus] = useState('正在打开本地书库…');
  const [busy, setBusy] = useState(false);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [selected, setSelected] = useState<BookSummary | undefined>();
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [chapter, setChapter] = useState<StoredChapter | undefined>();
  const [chapterSizes, setChapterSizes] = useState<number[]>([]);
  const [theme, setTheme] = useState(readTheme);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    openDatabase()
      .then(async (adapter) => {
        const rows = await listBooks(adapter);
        if (!active) {
          return;
        }
        setBooks(rows);
        setStatus(rows.length === 0 ? '书库为空，先导入一本 EPUB 或 TXT。' : '');
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(`打开书库失败：${String(error)}`);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshBooks(adapter: SqliteAdapter): Promise<BookSummary[]> {
    const rows = await listBooks(adapter);
    setBooks(rows);
    return rows;
  }

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setBusy(true);
    setStatus(`正在导入 ${file.name}…`);
    try {
      const adapter = await openDatabase();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const book = await importBook(bytes, file.name);
      const stats = await importBookToStorage(adapter, book);
      await refreshBooks(adapter);
      setStatus(
        `已导入《${book.metadata.title}》：${stats.chapters} 章、${stats.sentences} 句、${stats.chunks} 个意群。`,
      );
    } catch (error) {
      setStatus(`导入失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book: BookSummary): Promise<void> {
    setBusy(true);
    try {
      const adapter = await openDatabase();
      const rows = await listChapters(adapter, book.id);
      const sizes = await listChapterCharCounts(adapter, book.id);
      const noteRows = await listNotes(adapter, book.id);
      setSelected(book);
      setChapters(rows);
      setChapterSizes(sizes);
      setNotes(noteRows);
      const first = rows[0];
      setChapter(first ? await getChapter(adapter, book.id, first.index) : undefined);
      setStatus('');
    } catch (error) {
      setStatus(`读取失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openChapter(chapterIndex: number): Promise<void> {
    if (!selected) {
      return;
    }
    const adapter = await openDatabase();
    setChapter(await getChapter(adapter, selected.id, chapterIndex));
  }

  if (selected && chapter) {
    return (
      <ReaderView
        key={chapter.id}
        book={selected}
        chapters={chapters}
        chapter={chapter}
        chapterSizes={chapterSizes}
        notes={notes}
        theme={theme}
        onThemeChange={setTheme}
        onChapterChange={(chapterIndex) => void openChapter(chapterIndex)}
        onExit={() => {
          setSelected(undefined);
          setChapter(undefined);
          setNotes([]);
        }}
      />
    );
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Garagara Reader</h1>
        <p>本地优先的外语阅读器</p>
      </header>

      <section className="panel">
        <label className={`import-button${busy ? ' disabled' : ''}`}>
          导入 EPUB / TXT
          <input
            type="file"
            accept=".epub,.txt,application/epub+zip,text/plain"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              void handleFile(file);
              event.target.value = '';
            }}
          />
        </label>
        {status ? <p className="status">{status}</p> : null}
      </section>

      <section className="panel">
        <h2>书架</h2>
        {books.length === 0 ? (
          <p className="muted">还没有书。</p>
        ) : (
          <ul className="book-list">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  className={book.id === selected?.id ? 'book active' : 'book'}
                  onClick={() => void openBook(book)}
                >
                  <span className="book-title">{book.title}</span>
                  <span className="muted">
                    {book.author || '佚名'} · {book.format.toUpperCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
