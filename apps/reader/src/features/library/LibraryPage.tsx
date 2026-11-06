import type { BookSummary } from '@garagara/storage';
import { useRef, useState } from 'react';

import type { AppLanguage, Translate } from '../../shared/i18n/i18n.js';
import { pickBookFile } from '../../infra/platform/files.js';
import { IconBook, IconInfo, IconPlus } from '../../shared/ui/icons';
import { BookCard, LibraryEmpty } from './BookCard.js';
import { BookSheet } from './BookSheet.js';

export function LibraryPage({
  books,
  selected,
  busy,
  statusText,
  language,
  t,
  onBook,
  onOpenBook,
  onImportError,
}: {
  books: BookSummary[];
  selected: BookSummary | undefined;
  busy: boolean;
  statusText: string;
  language: AppLanguage;
  t: Translate;
  onBook: (name: string, bytes: Uint8Array) => Promise<void>;
  onOpenBook: (book: BookSummary) => void;
  onImportError: (error: unknown) => void;
}) {
  const [sheetBook, setSheetBook] = useState<BookSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    await onBook(file.name, new Uint8Array(await file.arrayBuffer()));
  }

  async function startImport(): Promise<void> {
    try {
      const picked = await pickBookFile();
      if (picked) {
        await onBook(picked.name, picked.bytes);
        return;
      }
      fileInputRef.current?.click();
    } catch (error) {
      onImportError(error);
    }
  }

  function openBook(book: BookSummary): void {
    setSheetBook(null);
    onOpenBook(book);
  }

  return (
    <>
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
          ) : statusText ? (
            <p className="status-strip" role="status" aria-live="polite">
              <IconInfo size={15} />
              {statusText}
            </p>
          ) : null}

          {books.length === 0 ? (
            <LibraryEmpty busy={busy} onImport={() => void startImport()} t={t} />
          ) : (
            <ul className="book-grid">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  isActive={book.id === selected?.id}
                  onOpen={() => openBook(book)}
                  onMenu={() => setSheetBook(book)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      {sheetBook ? (
        <BookSheet
          book={sheetBook}
          language={language}
          t={t}
          onOpen={() => openBook(sheetBook)}
          onClose={() => setSheetBook(null)}
        />
      ) : null}
    </>
  );
}
