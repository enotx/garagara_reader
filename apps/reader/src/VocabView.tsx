import type { Locator } from '@garagara/core';
import type { BookSummary, SqliteAdapter, VocabEntry } from '@garagara/storage';
import { listVocab, removeVocab, setVocabStatus } from '@garagara/storage';
import { useEffect, useState } from 'react';

import { localeFor, translator, type AppLanguage } from './i18n.js';
import { IconBookmark, IconChevronRight, IconX } from './icons';

function formatDate(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

function SentencePreview({ sentence, lemma }: { sentence: string; lemma: string }) {
  const index = sentence.toLowerCase().indexOf(lemma.toLowerCase());
  if (index < 0) {
    return <span>{sentence}</span>;
  }
  return (
    <span>
      {sentence.slice(0, index)}
      <mark>{sentence.slice(index, index + lemma.length)}</mark>
      {sentence.slice(index + lemma.length)}
    </span>
  );
}

export function VocabView({
  adapter,
  books,
  language,
  onOpenBook,
}: {
  adapter: SqliteAdapter | undefined;
  books: BookSummary[];
  language: AppLanguage;
  onOpenBook: (book: BookSummary, locator: Locator) => void;
}) {
  const t = translator(language);
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    if (!adapter) {
      setLoading(false);
      return;
    }
    try {
      setEntries(await listVocab(adapter));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload whenever the database adapter becomes available.
  }, [adapter]);

  async function toggleKnown(entry: VocabEntry): Promise<void> {
    if (!adapter) {
      return;
    }
    await setVocabStatus(adapter, entry.id, entry.status === 'known' ? 'learning' : 'known');
    await reload();
  }

  async function remove(entry: VocabEntry): Promise<void> {
    if (!adapter) {
      return;
    }
    await removeVocab(adapter, entry.id);
    await reload();
  }

  function jump(entry: VocabEntry): void {
    const book = books.find((item) => item.id === entry.locator.bookId);
    if (book) {
      onOpenBook(book, entry.locator);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? entries.filter(
        (entry) =>
          entry.lemma.toLowerCase().includes(needle) ||
          entry.sentenceText.toLowerCase().includes(needle),
      )
    : entries;

  return (
    <main className="app vocab">
      <header className="settings-topbar">
        <div className="settings-topbar-inner">
          <div className="settings-heading">
            <p className="eyebrow">{t('vocab.eyebrow')}</p>
            <h1>{t('vocab.title')}</h1>
          </div>
          <span className="collection-count">
            {t('vocab.count', { count: entries.length })}
          </span>
          <span className="settings-mark" aria-hidden="true">
            <IconBookmark size={18} />
          </span>
        </div>
      </header>

      <div className="vocab-shell">
        <label className="vocab-search">
          <span className="visually-hidden">{t('vocab.search')}</span>
          <input
            type="search"
            aria-label={t('vocab.search')}
            placeholder={t('vocab.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loading ? <p className="muted">{t('vocab.loading')}</p> : null}
        {!loading && entries.length === 0 ? (
          <section className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              <IconBookmark size={26} strokeWidth={1.3} />
            </span>
            <h3>{t('vocab.emptyTitle')}</h3>
            <p className="empty-hint">{t('vocab.emptyHint')}</p>
          </section>
        ) : null}
        {!loading && entries.length > 0 && visible.length === 0 ? (
          <p className="muted">{t('vocab.noMatch')}</p>
        ) : null}

        {visible.length > 0 ? (
          <ul className="vocab-list">
            {visible.map((entry) => (
              <li key={entry.id}>
                <article className="vocab-card">
                  <button
                    type="button"
                    className="vocab-open"
                    aria-label={t('vocab.jump', { lemma: entry.lemma })}
                    onClick={() => jump(entry)}
                  >
                    <span className="vocab-lemma">{entry.lemma}</span>
                    <span className="vocab-sentence">
                      <SentencePreview sentence={entry.sentenceText} lemma={entry.lemma} />
                    </span>
                    <span className="vocab-meta">
                      <span>
                        {books.find((book) => book.id === entry.locator.bookId)?.title ??
                          t('vocab.unknownBook')}
                      </span>
                      <span>·</span>
                      <span>{formatDate(entry.createdAt, language)}</span>
                      <IconChevronRight size={15} />
                    </span>
                  </button>
                  <div className="vocab-actions">
                    <span className={`vocab-status${entry.status === 'known' ? ' is-known' : ''}`}>
                      {entry.status === 'known' ? t('vocab.known') : t('vocab.learning')}
                    </span>
                    <button
                      type="button"
                      className="vocab-action"
                      onClick={() => void toggleKnown(entry)}
                    >
                      {entry.status === 'known' ? t('vocab.markLearning') : t('vocab.markKnown')}
                    </button>
                    <button
                      type="button"
                      className="vocab-action vocab-remove"
                      aria-label={t('vocab.deleteAria', { lemma: entry.lemma })}
                      onClick={() => void remove(entry)}
                    >
                      <IconX size={14} />
                      {t('common.delete')}
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
