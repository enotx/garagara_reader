import type { Locator } from '@garagara/core';
import type { BookSummary, SqliteAdapter, VocabEntry } from '@garagara/storage';
import { listVocab, removeVocab, setVocabStatus } from '@garagara/storage';
import { useEffect, useState } from 'react';

import { IconBookmark, IconChevronRight, IconX } from './icons';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
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
  onOpenBook,
}: {
  adapter: SqliteAdapter | undefined;
  books: BookSummary[];
  onOpenBook: (book: BookSummary, locator: Locator) => void;
}) {
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
            <p className="eyebrow">生词本</p>
            <h1>收集的词</h1>
          </div>
          <span className="collection-count">{entries.length} 条</span>
          <span className="settings-mark" aria-hidden="true">
            <IconBookmark size={18} />
          </span>
        </div>
      </header>

      <div className="vocab-shell">
        <label className="vocab-search">
          <span className="visually-hidden">搜索生词</span>
          <input
            type="search"
            aria-label="搜索生词"
            placeholder="搜索单词、短语或原句"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {loading ? <p className="muted">正在读取生词本…</p> : null}
        {!loading && entries.length === 0 ? (
          <section className="empty-state">
            <span className="empty-mark" aria-hidden="true">
              <IconBookmark size={26} strokeWidth={1.3} />
            </span>
            <h3>还没有生词</h3>
            <p className="empty-hint">阅读时点开词卡，点右上角的 ☆ 收集单词或短语。</p>
          </section>
        ) : null}
        {!loading && entries.length > 0 && visible.length === 0 ? (
          <p className="muted">没有匹配的生词。</p>
        ) : null}

        {visible.length > 0 ? (
          <ul className="vocab-list">
            {visible.map((entry) => (
              <li key={entry.id}>
                <article className="vocab-card">
                  <button
                    type="button"
                    className="vocab-open"
                    aria-label={`跳回原文：${entry.lemma}`}
                    onClick={() => jump(entry)}
                  >
                    <span className="vocab-lemma">{entry.lemma}</span>
                    <span className="vocab-sentence">
                      <SentencePreview sentence={entry.sentenceText} lemma={entry.lemma} />
                    </span>
                    <span className="vocab-meta">
                      <span>
                        {books.find((book) => book.id === entry.locator.bookId)?.title ??
                          '未知书籍'}
                      </span>
                      <span>·</span>
                      <span>{formatDate(entry.createdAt)}</span>
                      <IconChevronRight size={15} />
                    </span>
                  </button>
                  <div className="vocab-actions">
                    <span className={`vocab-status${entry.status === 'known' ? ' is-known' : ''}`}>
                      {entry.status === 'known' ? '已知' : '学习中'}
                    </span>
                    <button
                      type="button"
                      className="vocab-action"
                      onClick={() => void toggleKnown(entry)}
                    >
                      {entry.status === 'known' ? '标记学习中' : '标记已知'}
                    </button>
                    <button
                      type="button"
                      className="vocab-action vocab-remove"
                      aria-label={`删除 ${entry.lemma}`}
                      onClick={() => void remove(entry)}
                    >
                      <IconX size={14} />
                      删除
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
