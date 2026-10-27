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

import {
  IconBook,
  IconBookmark,
  IconChevronRight,
  IconInfo,
  IconMore,
  IconPlus,
  IconSettings,
  IconX,
} from './icons';
import { ReaderView } from './ReaderView';
import { SettingsView } from './SettingsView';
import { DEFAULT_LLM_SETTINGS, readLlmSettings, type ReaderLlmSettings } from './settings.js';
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

function coverTone(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 6) + 1;
}

function formatImportDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

function TabBar({
  active,
  onSelect,
}: {
  active: 'library' | 'settings';
  onSelect: (tab: 'library' | 'settings') => void;
}) {
  return (
    <nav className="tab-bar" aria-label="主导航">
      <div className="tab-bar-inner">
        <button
          type="button"
          className={`tab-item${active === 'library' ? ' is-active' : ''}`}
          aria-current={active === 'library' ? 'page' : undefined}
          onClick={() => {
            if (active !== 'library') {
              onSelect('library');
            }
          }}
        >
          <IconBook size={20} />
          书架
        </button>
        <button type="button" className="tab-item" disabled title="即将推出">
          <IconBookmark size={20} />
          生词本
        </button>
        <button
          type="button"
          className={`tab-item${active === 'settings' ? ' is-active' : ''}`}
          aria-current={active === 'settings' ? 'page' : undefined}
          onClick={() => {
            if (active !== 'settings') {
              onSelect('settings');
            }
          }}
        >
          <IconSettings size={20} />
          设置
        </button>
      </div>
    </nav>
  );
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
  const [sheetBook, setSheetBook] = useState<BookSummary | null>(null);
  const [adapter, setAdapter] = useState<SqliteAdapter>();
  const [llmSettings, setLlmSettings] = useState<ReaderLlmSettings>(DEFAULT_LLM_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [view, setView] = useState<'library' | 'settings'>('library');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    openDatabase()
      .then(async (database) => {
        const rows = await listBooks(database);
        const settings = await readLlmSettings(database);
        if (!active) {
          return;
        }
        setAdapter(database);
        setBooks(rows);
        setLlmSettings(settings);
        setStatus('');
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

  useEffect(() => {
    if (!sheetBook) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSheetBook(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetBook]);

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
    setSheetBook(null);
    setView('library');
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

  if (view === 'settings') {
    return (
      <>
        <SettingsView
          adapter={adapter}
          settings={llmSettings}
          apiKey={apiKey}
          backLabel={selected && chapter ? '返回阅读' : '返回书架'}
          onBack={() => setView('library')}
          onSaved={(nextSettings, nextApiKey) => {
            setLlmSettings(nextSettings);
            setApiKey(nextApiKey);
          }}
        />
        <TabBar
          active="settings"
          onSelect={() => {
            setView('library');
            setSelected(undefined);
            setChapter(undefined);
            setNotes([]);
          }}
        />
      </>
    );
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
        {...(adapter ? { llm: { adapter, settings: llmSettings, apiKey } } : {})}
        onThemeChange={setTheme}
        onChapterChange={(chapterIndex) => void openChapter(chapterIndex)}
        onExit={() => {
          setSelected(undefined);
          setChapter(undefined);
          setNotes([]);
        }}
        onOpenSettings={() => setView('settings')}
      />
    );
  }

  return (
    <main className="app library">
      <header className="library-topbar">
        <div className="library-topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <IconBook size={16} strokeWidth={1.6} />
            </span>
            <div className="brand-copy">
              <h1>Garagara Reader</h1>
              <p>本地优先的外语阅读器</p>
            </div>
          </div>
          <label
            className={`icon-button primary${busy ? ' disabled' : ''}`}
            htmlFor="book-import"
            aria-label="导入 EPUB 或 TXT"
            aria-disabled={busy}
          >
            <IconPlus size={20} />
          </label>
        </div>
      </header>

      <input
        id="book-import"
        className="visually-hidden"
        type="file"
        accept=".epub,.txt,application/epub+zip,text/plain"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          void handleFile(file);
          event.target.value = '';
        }}
      />

      <div className="library-shell">
        <div className="collection-header">
          <div>
            <p className="eyebrow">书架</p>
            <h2 className="collection-title">
              我的藏书
              <span className="collection-count">{books.length} 本</span>
            </h2>
            <p className="collection-subtitle">最近导入的书排在前面。点封面继续阅读。</p>
          </div>
          <label
            className={`import-cta${busy ? ' disabled' : ''}`}
            htmlFor="book-import"
            aria-disabled={busy}
          >
            <IconPlus size={16} />
            导入
          </label>
        </div>

        {busy ? (
          <section className="import-progress" role="status" aria-live="polite">
            <div className="import-progress-head">
              <span className="import-progress-title">
                <IconBook size={18} />
                正在整理新书
              </span>
            </div>
            <p className="import-progress-status">{status}</p>
            <div className="import-progress-track" aria-hidden="true">
              <span />
            </div>
          </section>
        ) : status ? (
          <p className="status-strip" role="status" aria-live="polite">
            <IconInfo size={15} />
            {status}
          </p>
        ) : null}

        {books.length === 0 ? (
          <section className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              <IconBook size={28} strokeWidth={1.3} />
            </span>
            <h3>从第一本书开始</h3>
            <p className="empty-hint">书库为空，先导入一本 EPUB 或 TXT。</p>
            <label
              className={`import-cta${busy ? ' disabled' : ''}`}
              htmlFor="book-import"
              aria-disabled={busy}
            >
              <IconPlus size={16} />
              导入第一本书
            </label>
          </section>
        ) : (
          <ul className="book-grid">
            {books.map((book) => {
              const tone = coverTone(book.id);
              const isActive = book.id === selected?.id;
              return (
                <li key={book.id}>
                  <article className="book-card">
                    <button
                      type="button"
                      className="book-open"
                      onClick={() => void openBook(book)}
                      aria-label={`打开《${book.title}》`}
                    >
                      <span className={`book-cover tone-${tone}`}>
                        <span className="cover-kicker">{book.format.toUpperCase()}</span>
                        <span className="cover-title">{book.title}</span>
                        <span className="cover-rule" />
                        <span className="cover-author">{book.author || '佚名'}</span>
                        <span className="cover-foot">
                          <span>{book.lang.toUpperCase()}</span>
                          <span>{isActive ? '继续阅读' : '可阅读'}</span>
                        </span>
                      </span>
                      <span className="book-meta">
                        <span className="book-title">{book.title}</span>
                        <span className="book-sub">{book.author || '佚名'}</span>
                        <span className="book-status">
                          <span className="book-status-dot" aria-hidden="true" />
                          {book.format.toUpperCase()} · 已就绪
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="book-menu"
                      aria-label="书籍操作"
                      onClick={() => setSheetBook(book)}
                    >
                      <IconMore size={17} />
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TabBar active="library" onSelect={() => setView('settings')} />

      {sheetBook ? (
        <div
          className="sheet-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setSheetBook(null);
            }
          }}
        >
          <section className="sheet" role="dialog" aria-modal="true" aria-label="书籍操作">
            <div className="sheet-grabber" aria-hidden="true" />
            <header className="sheet-book">
              <span className={`sheet-cover tone-${coverTone(sheetBook.id)}`} aria-hidden="true">
                <span>{sheetBook.title}</span>
              </span>
              <div className="sheet-book-copy">
                <h2>{sheetBook.title}</h2>
                <p>{sheetBook.author || '佚名'}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭书籍操作"
                onClick={() => setSheetBook(null)}
              >
                <IconX size={18} />
              </button>
            </header>

            <div className="sheet-actions">
              <button
                type="button"
                className="sheet-action primary"
                onClick={() => void openBook(sheetBook)}
              >
                <IconChevronRight size={18} />
                开始阅读
              </button>
              <div className="sheet-action" aria-hidden="true">
                <IconInfo size={18} />
                书籍信息
                <small>{sheetBook.format.toUpperCase()}</small>
              </div>
            </div>

            <div className="sheet-details">
              <div className="sheet-detail">
                <span>格式</span>
                <strong>{sheetBook.format.toUpperCase()}</strong>
              </div>
              <div className="sheet-detail">
                <span>语言</span>
                <strong>{sheetBook.lang.toUpperCase()}</strong>
              </div>
              <div className="sheet-detail">
                <span>导入时间</span>
                <strong>{formatImportDate(sheetBook.importedAt)}</strong>
              </div>
            </div>

            <button type="button" className="sheet-cancel" onClick={() => setSheetBook(null)}>
              取消
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
