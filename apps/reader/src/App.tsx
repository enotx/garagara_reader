import { importBook, type Locator, type Note } from '@garagara/core';
import type { PlaybackStatus } from '@garagara/playback';
import { WebSpeechPlaybackEngine } from '@garagara/playback';
import type {
  BookSummary,
  ChapterSummary,
  PlayableSentence,
  SqliteAdapter,
  StoredChapter,
} from '@garagara/storage';
import {
  getChapter,
  getProgress,
  importBookToStorage,
  listBooks,
  listChapterCharCounts,
  listChapters,
  listNotes,
  listPlayableSentences,
  saveProgress,
} from '@garagara/storage';
import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  localeFor,
  translator,
  type AppLanguage,
  type MessageKey,
  type Translate,
} from './i18n.js';
import { chapterIndexForLocator } from './locator-navigation.js';

import {
  IconBook,
  IconBookmark,
  IconDictionary,
  IconChevronRight,
  IconInfo,
  IconMore,
  IconPlus,
  IconSettings,
  IconX,
} from './icons';
import { openDatabase } from './database.js';
import { devLlmEnvFromEnv } from './dev-env.js';
import { pickBookFile, readSharedBook } from './files.js';
import { DictionaryView } from './DictionaryView';
import { ReaderView } from './ReaderView';
import { readApiKey, writeApiKey } from './secrets.js';
import { SettingsView } from './SettingsView';
import { VocabView } from './VocabView';
import {
  DEFAULT_LLM_SETTINGS,
  isLlmConfigured,
  readLlmSettings,
  type ReaderLlmSettings,
} from './settings.js';
import { applyTheme, readTheme } from './theme';

function coverTone(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 6) + 1;
}

function formatImportDate(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

type AppView = 'library' | 'dictionary' | 'vocab' | 'settings';

interface StatusMessage {
  key: MessageKey;
  params?: Record<string, string | number>;
}

function TabBar({
  active,
  onSelect,
  t,
}: {
  active: AppView;
  onSelect: (tab: AppView) => void;
  t: Translate;
}) {
  return (
    <nav className="tab-bar" aria-label={t('nav.main')}>
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
          {t('nav.library')}
        </button>
        <button
          type="button"
          className={`tab-item${active === 'dictionary' ? ' is-active' : ''}`}
          aria-current={active === 'dictionary' ? 'page' : undefined}
          onClick={() => {
            if (active !== 'dictionary') {
              onSelect('dictionary');
            }
          }}
        >
          <IconDictionary size={20} />
          {t('nav.dictionary')}
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
          {t('nav.vocab')}
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
          {t('nav.settings')}
        </button>
      </div>
    </nav>
  );
}

export function App() {
  const [status, setStatus] = useState<StatusMessage | null>({ key: 'status.opening' });
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
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [playbackSentence, setPlaybackSentence] = useState<PlayableSentence | undefined>();
  const [playbackBrowsing, setPlaybackBrowsing] = useState(false);
  const playbackEngineRef = useRef<WebSpeechPlaybackEngine | undefined>(undefined);
  const playbackBrowsingRef = useRef(false);
  const chapterIndexRef = useRef<number | undefined>(undefined);
  const lastSavedProgress = useRef('');
  const progressChain = useRef<Promise<void>>(Promise.resolve());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const language = llmSettings.uiLanguage;
  const t = translator(language);
  const statusText = status ? t(status.key, status.params) : '';

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
        const env = devLlmEnvFromEnv(import.meta.env);
        const seededSettings = isLlmConfigured(settings)
          ? settings
          : { ...settings, ...env.settings };
        setAdapter(database);
        setBooks(rows);
        setLlmSettings(seededSettings);
        setApiKey(storedKey || env.apiKey);
        setStatus(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus({ key: 'status.openFailed', params: { error: String(error) } });
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

  const handleProgress = useCallback(
    (locator: Locator): void => {
      if (!adapter) {
        return;
      }
      const key = `${locator.bookId}:${locator.chapterIndex}:${locator.blockIndex}:${locator.offset}`;
      if (key === lastSavedProgress.current) {
        return;
      }
      lastSavedProgress.current = key;
      const write = progressChain.current.then(() =>
        saveProgress(adapter, locator.bookId, locator),
      );
      progressChain.current = write.catch(() => {
        if (key === lastSavedProgress.current) {
          lastSavedProgress.current = '';
        }
      });
      void progressChain.current;
    },
    [adapter],
  );

  async function handleBook(name: string, bytes: Uint8Array): Promise<void> {
    setBusy(true);
    setStatus({ key: 'status.importing', params: { name } });
    try {
      const adapter = await openDatabase();
      const book = await importBook(bytes, name);
      const stats = await importBookToStorage(adapter, book);
      await refreshBooks(adapter);
      setStatus({
        key: 'status.imported',
        params: {
          title: book.metadata.title,
          chapters: stats.chapters,
          sentences: stats.sentences,
          chunks: stats.chunks,
        },
      });
    } catch (error) {
      setStatus({ key: 'status.importFailed', params: { error: String(error) } });
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
      setStatus({ key: 'status.importFailed', params: { error: String(error) } });
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
            setStatus({ key: 'status.openFileFailed', params: { error: String(error) } });
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

  function disposePlayback(): void {
    const engine = playbackEngineRef.current;
    playbackEngineRef.current = undefined;
    playbackBrowsingRef.current = false;
    chapterIndexRef.current = undefined;
    engine?.stop();
    setPlaybackStatus('idle');
    setPlaybackSentence(undefined);
    setPlaybackBrowsing(false);
  }

  async function loadChapterAt(
    book: BookSummary,
    chapterIndex: number,
    locator?: Locator,
  ): Promise<void> {
    const adapter = await openDatabase();
    chapterIndexRef.current = chapterIndex;
    setInitialLocator(locator);
    setChapter(await getChapter(adapter, book.id, chapterIndex));
  }

  function installPlayback(book: BookSummary, queue: readonly PlayableSentence[]): void {
    const previous = playbackEngineRef.current;
    playbackEngineRef.current = undefined;
    previous?.stop();
    playbackBrowsingRef.current = false;
    setPlaybackBrowsing(false);
    setPlaybackSentence(undefined);
    setPlaybackStatus('idle');
    if (queue.length === 0) {
      return;
    }

    const engine = new WebSpeechPlaybackEngine({
      source: { load: async () => queue },
    });
    engine.on('sentenceStart', ({ sentenceId }) => {
      const sentence = queue.find((item) => item.id === sentenceId);
      if (!sentence) {
        return;
      }
      setPlaybackSentence(sentence);
      if (
        !playbackBrowsingRef.current &&
        chapterIndexRef.current !== sentence.locator.chapterIndex
      ) {
        void loadChapterAt(book, sentence.locator.chapterIndex, sentence.locator);
      }
    });
    engine.on('stateChange', (state) => {
      setPlaybackStatus(state.status);
    });
    engine.on('ended', () => {
      playbackBrowsingRef.current = false;
      setPlaybackBrowsing(false);
      setPlaybackStatus('idle');
    });
    playbackEngineRef.current = engine;
  }

  function changePlaybackBrowsing(value: boolean): void {
    playbackBrowsingRef.current = value;
    setPlaybackBrowsing(value);
    if (!value && selected) {
      const sentence = playbackSentence;
      if (sentence && chapterIndexRef.current !== sentence.locator.chapterIndex) {
        void loadChapterAt(selected, sentence.locator.chapterIndex, sentence.locator);
      }
    }
  }

  async function openBook(book: BookSummary, locator?: Locator): Promise<void> {
    setBusy(true);
    setSheetBook(null);
    setView('library');
    setReaderSession((value) => value + 1);
    disposePlayback();
    try {
      const adapter = await openDatabase();
      const rows = await listChapters(adapter, book.id);
      const sizes = await listChapterCharCounts(adapter, book.id);
      const noteRows = await listNotes(adapter, book.id);
      const queue = await listPlayableSentences(adapter, book.id);
      const savedLocator = locator ?? (await getProgress(adapter, book.id));
      const targetChapter = chapterIndexForLocator(rows, savedLocator);
      const chapterIndex = targetChapter ?? rows[0]?.index;
      setSelected(book);
      setChapters(rows);
      setChapterSizes(sizes);
      setNotes(noteRows);
      setInitialLocator(targetChapter === undefined ? undefined : savedLocator);
      chapterIndexRef.current = chapterIndex;
      setChapter(
        chapterIndex === undefined ? undefined : await getChapter(adapter, book.id, chapterIndex),
      );
      installPlayback(book, queue);
      setStatus(null);
    } catch (error) {
      setStatus({ key: 'status.readFailed', params: { error: String(error) } });
    } finally {
      setBusy(false);
    }
  }

  async function openChapter(chapterIndex: number): Promise<void> {
    if (!selected) {
      return;
    }
    await loadChapterAt(selected, chapterIndex);
  }

  function selectTab(tab: AppView): void {
    disposePlayback();
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
          backLabel={t(selected && chapter ? 'settings.backReader' : 'settings.backLibrary')}
          onBack={() => setView('library')}
          onSaved={async (nextSettings, apiKeyUpdate) => {
            setLlmSettings(nextSettings);
            if (apiKeyUpdate !== undefined) {
              setApiKey(apiKeyUpdate);
              await writeApiKey(apiKeyUpdate);
            }
          }}
        />
        <TabBar active="settings" onSelect={selectTab} t={t} />
      </>
    );
  }

  if (view === 'dictionary') {
    return (
      <>
        <DictionaryView language={language} />
        <TabBar active="dictionary" onSelect={selectTab} t={t} />
      </>
    );
  }

  if (view === 'vocab') {
    return (
      <>
        <VocabView
          adapter={adapter}
          books={books}
          language={language}
          onOpenBook={(book, locator) => void openBook(book, locator)}
        />
        <TabBar active="vocab" onSelect={selectTab} t={t} />
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
        language={language}
        {...(adapter ? { llm: { adapter, settings: llmSettings, apiKey } } : {})}
        {...(initialLocator ? { initialLocator } : {})}
        {...(playbackEngineRef.current
          ? {
              playback: {
                engine: playbackEngineRef.current,
                status: playbackStatus,
                ...(playbackSentence ? { sentence: playbackSentence } : {}),
                browsing: playbackBrowsing,
                onBrowsingChange: changePlaybackBrowsing,
              },
            }
          : {})}
        onThemeChange={setTheme}
        onProgress={handleProgress}
        onChapterChange={(chapterIndex) => void openChapter(chapterIndex)}
        onExit={() => {
          disposePlayback();
          setSelected(undefined);
          setChapter(undefined);
          setNotes([]);
          setInitialLocator(undefined);
        }}
        onOpenSettings={() => {
          playbackEngineRef.current?.pause();
          setView('settings');
        }}
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
              <p>{t('app.tagline')}</p>
            </div>
          </div>
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
            <p className="eyebrow">{t('library.eyebrow')}</p>
            <h2 className="collection-title">
              {t('library.title')}
              <span className="collection-count">
                {t('library.count', { count: books.length })}
              </span>
            </h2>
            <p className="collection-subtitle">{t('library.subtitle')}</p>
          </div>
          <button
            type="button"
            className={`import-cta${busy ? ' disabled' : ''}`}
            aria-disabled={busy}
            disabled={busy}
            onClick={() => void startImport()}
          >
            <IconPlus size={16} />
            {t('library.import')}
          </button>
        </div>

        {busy ? (
          <section className="import-progress" role="status" aria-live="polite">
            <div className="import-progress-head">
              <span className="import-progress-title">
                <IconBook size={18} />
                {t('library.importing')}
              </span>
            </div>
            <p className="import-progress-status">{statusText}</p>
            <div className="import-progress-track" aria-hidden="true">
              <span />
            </div>
          </section>
        ) : status ? (
          <p className="status-strip" role="status" aria-live="polite">
            <IconInfo size={15} />
            {statusText}
          </p>
        ) : null}

        {books.length === 0 ? (
          <section className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              <IconBook size={28} strokeWidth={1.3} />
            </span>
            <h3>{t('library.emptyTitle')}</h3>
            <p className="empty-hint">{t('library.emptyHint')}</p>
            <button
              type="button"
              className={`import-cta${busy ? ' disabled' : ''}`}
              aria-disabled={busy}
              disabled={busy}
              onClick={() => void startImport()}
            >
              <IconPlus size={16} />
              {t('library.importFirst')}
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
                      aria-label={t('library.openBook', { title: book.title })}
                    >
                      <span className={`book-cover tone-${tone}`}>
                        <span className="cover-kicker">{book.format.toUpperCase()}</span>
                        <span className="cover-title">{book.title}</span>
                        <span className="cover-rule" />
                        <span className="cover-author">
                          {book.author || t('common.unknownAuthor')}
                        </span>
                        <span className="cover-foot">
                          <span>{book.lang.toUpperCase()}</span>
                          <span>
                            {isActive ? t('library.continue') : t('library.readable')}
                          </span>
                        </span>
                      </span>
                      <span className="book-meta">
                        <span className="book-title">{book.title}</span>
                        <span className="book-sub">
                          {book.author || t('common.unknownAuthor')}
                        </span>
                        <span className="book-status">
                          <span className="book-status-dot" aria-hidden="true" />
                          {book.format.toUpperCase()} · {t('library.ready')}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="book-menu"
                      aria-label={t('library.bookActions')}
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

      <TabBar active="library" onSelect={selectTab} t={t} />

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
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('library.bookActions')}
          >
            <div className="sheet-grabber" aria-hidden="true" />
            <header className="sheet-book">
              <span className={`sheet-cover tone-${coverTone(sheetBook.id)}`} aria-hidden="true">
                <span>{sheetBook.title}</span>
              </span>
              <div className="sheet-book-copy">
                <h2>{sheetBook.title}</h2>
                <p>{sheetBook.author || t('common.unknownAuthor')}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={t('library.closeActions')}
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
                {t('library.startReading')}
              </button>
              <div className="sheet-action" aria-hidden="true">
                <IconInfo size={18} />
                {t('library.bookInfo')}
                <small>{sheetBook.format.toUpperCase()}</small>
              </div>
            </div>

            <div className="sheet-details">
              <div className="sheet-detail">
                <span>{t('library.format')}</span>
                <strong>{sheetBook.format.toUpperCase()}</strong>
              </div>
              <div className="sheet-detail">
                <span>{t('library.language')}</span>
                <strong>{sheetBook.lang.toUpperCase()}</strong>
              </div>
              <div className="sheet-detail">
                <span>{t('library.importedAt')}</span>
                <strong>{formatImportDate(sheetBook.importedAt, language)}</strong>
              </div>
            </div>

            <button type="button" className="sheet-cancel" onClick={() => setSheetBook(null)}>
              {t('common.cancel')}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
