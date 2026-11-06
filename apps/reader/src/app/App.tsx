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

import { chapterIndexForLocator } from '../features/reader/navigation/locator-navigation.js';
import { DictionaryView } from '../features/dictionary/DictionaryView';
import { LibraryPage } from '../features/library/LibraryPage';
import { ReaderView } from '../features/reader/ReaderView';
import { SettingsView } from '../features/settings/SettingsView';
import { VocabView } from '../features/vocab/VocabView';
import { readSharedBook } from '../infra/platform/files.js';
import { readApiKey, writeApiKey } from '../infra/platform/secrets.js';
import { openDatabase } from '../infra/storage/database.js';
import { translator, type MessageKey } from '../shared/i18n/i18n.js';
import {
  DEFAULT_LLM_SETTINGS,
  isLlmConfigured,
  readLlmSettings,
  type ReaderLlmSettings,
} from '../shared/settings/reader-settings.js';
import { applyTheme, readTheme } from '../shared/theme/theme';
import { devLlmEnvFromEnv } from './bootstrap/dev-env.js';
import { TabBar, type AppView } from './navigation/TabBar';

interface StatusMessage {
  key: MessageKey;
  params?: Record<string, string | number>;
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
    <>
      <LibraryPage
        books={books}
        selected={selected}
        busy={busy}
        statusText={statusText}
        language={language}
        t={t}
        onBook={handleBook}
        onOpenBook={(book) => void openBook(book)}
        onImportError={(error) =>
          setStatus({ key: 'status.importFailed', params: { error: String(error) } })
        }
      />
      <TabBar active="library" onSelect={selectTab} t={t} />
    </>
  );
}
