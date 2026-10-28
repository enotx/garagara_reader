import { importBook, type Locator, type Note } from '@garagara/core';
import type { BookSummary, ChapterSummary, SqliteAdapter, StoredChapter } from '@garagara/storage';
import {
  getChapter,
  importBookToStorage,
  listBooks,
  listChapterCharCounts,
  listChapters,
  listNotes,
} from '@garagara/storage';
import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';

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
import { openDatabase } from './database.js';
import { pickBookFile, readSharedBook } from './files.js';
import { ReaderView } from './ReaderView';
import { readApiKey, writeApiKey } from './secrets.js';
import { SettingsView } from './SettingsView';
import { VocabView } from './VocabView';
import { DEFAULT_LLM_SETTINGS, readLlmSettings, type ReaderLlmSettings } from './settings.js';
import { applyTheme, readTheme } from './theme';

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

type AppView = 'library' | 'vocab' | 'settings';

function TabBar({ active, onSelect }: { active: AppView; onSelect: (tab: AppView) => void }) {
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
        <button
          type="button"
          className={`tab-item${active === 'vocab' ? ' is-active' : ''}`}
          aria-current={active === 'vocab' ? 'page' : undefined}
          onClick={() => {
            if (active !== 'vocab') {
              onSelect('vocab');
            }
          }}
        >
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
  const [view, setView] = useState<AppView>('library');
  const [initialLocator, setInitialLocator] = useState<Locator | undefined>();
  const [readerSession, setReaderSession] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    openDatabase()
      .then(async (database) => {
        const rows = await listBooks(database);
        const settings = await readLlmSettings(database);
        const storedKey = await readApiKey();
        if (!active) {
          return;
        }
        setAdapter(database);
        setBooks(rows);
        setLlmSettings(settings);
        setApiKey(storedKey);
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

  async function handleBook(name: string, bytes: Uint8Array): Promise<void> {
    setBusy(true);
    setStatus(`正在导入 ${name}…`);
    try {
      const adapter = await openDatabase();
      const book = await importBook(bytes, name);
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

  const handleBookRef = useRef(handleBook);
  handleBookRef.current = handleBook;

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    await handleBook(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  async function startImport(): Promise<void> {
    try {
      const picked = await pickBookFile();
      if (picked) {
        await handleBook(picked.name, picked.bytes);
        return;
      }
      fileInputRef.current?.click();
    } catch (error) {
      setStatus(`导入失败：${String(error)}`);
    }
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    let removeListener: (() => void) | undefined;
    let active = true;
    void import('@capacitor/app').then(async ({ App: CapacitorApp }) => {
      const listener = await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        if (!url.startsWith('file://')) {
          return;
        }
        void readSharedBook(url)
          .then((book) => {
            if (book) {
              return handleBookRef.current(book.name, book.bytes);
            }
            return undefined;
          })
          .catch((error: unknown) => {
            setStatus(`打开文件失败：${String(error)}`);
          });
      });
      if (active) {
        removeListener = () => {
          void listener.remove();
        };
      } else {
        void listener.remove();
      }
    });
    return () => {
      active = false;
      removeListener?.();
    };
  }, []);

  async function openBook(book: BookSummary, locator?: Locator): Promise<void> {
    setBusy(true);
    setSheetBook(null);
    setView('library');
    setInitialLocator(locator);
    setReaderSession((value) => value + 1);
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
    setInitialLocator(undefined);
    setChapter(await getChapter(adapter, selected.id, chapterIndex));
  }

  function selectTab(tab: AppView): void {
    setView(tab);
    setSelected(undefined);
    setChapter(undefined);
    setNotes([]);
    setInitialLocator(undefined);
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
          onSaved={async (nextSettings, nextApiKey) => {
            setLlmSettings(nextSettings);
            setApiKey(nextApiKey);
            await writeApiKey(nextApiKey);
          }}
        />
        <TabBar active="settings" onSelect={selectTab} />
      </>
    );
  }

  if (view === 'vocab') {
    return (
      <>
        <VocabView
          adapter={adapter}
          books={books}
          onOpenBook={(book, locator) => void openBook(book, locator)}
        />
        <TabBar active="vocab" onSelect={selectTab} />
      </>
    );
  }

  if (selected && chapter) {
    return (
      <ReaderView
        key={`${chapter.id}:${readerSession}`}
        book={selected}
        chapters={chapters}
        chapter={chapter}
        chapterSizes={chapterSizes}
        notes={notes}
        theme={theme}
        {...(adapter ? { llm: { adapter, settings: llmSettings, apiKey } } : {})}
        {...(initialLocator ? { initialLocator } : {})}
        onThemeChange={setTheme}
        onChapterChange={(chapterIndex) => void openChapter(chapterIndex)}
        onExit={() => {
          setSelected(undefined);
          setChapter(undefined);
          setNotes([]);
          setInitialLocator(undefined);
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
          <button
            type="button"
            className={`icon-button primary${busy ? ' disabled' : ''}`}
            aria-label="导入 EPUB 或 TXT"
            aria-disabled={busy}
            disabled={busy}
            onClick={() => void startImport()}
          >
            <IconPlus size={20} />
          </button>
        </div>
      </header>

      <input
        id="book-import"
        ref={fileInputRef}
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
          <button
            type="button"
            className={`import-cta${busy ? ' disabled' : ''}`}
            aria-disabled={busy}
            disabled={busy}
            onClick={() => void startImport()}
          >
            <IconPlus size={16} />
            导入
          </button>
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
            <button
              type="button"
              className={`import-cta${busy ? ' disabled' : ''}`}
              aria-disabled={busy}
              disabled={busy}
              onClick={() => void startImport()}
            >
              <IconPlus size={16} />
              导入第一本书
            </button>
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

      <TabBar active="library" onSelect={selectTab} />

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
