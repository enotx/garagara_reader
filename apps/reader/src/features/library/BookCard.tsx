import type { BookSummary } from '@garagara/storage';

import type { Translate } from '../../shared/i18n/i18n.js';
import { IconBook, IconMore, IconPlus } from '../../shared/ui/icons';
import { coverTone } from './cover-tone.js';

export function BookCard({
  book,
  isActive,
  onOpen,
  onMenu,
  t,
}: {
  book: BookSummary;
  isActive: boolean;
  onOpen: () => void;
  onMenu: () => void;
  t: Translate;
}) {
  return (
    <li>
      <article className="book-card">
        <button
          type="button"
          className="book-open"
          onClick={onOpen}
          aria-label={t('library.openBook', { title: book.title })}
        >
          <span className={`book-cover tone-${coverTone(book.id)}`}>
            <span className="cover-kicker">{book.format.toUpperCase()}</span>
            <span className="cover-title">{book.title}</span>
            <span className="cover-rule" />
            <span className="cover-author">{book.author || t('common.unknownAuthor')}</span>
            <span className="cover-foot">
              <span>{book.lang.toUpperCase()}</span>
              <span>{isActive ? t('library.continue') : t('library.readable')}</span>
            </span>
          </span>
          <span className="book-meta">
            <span className="book-title">{book.title}</span>
            <span className="book-sub">{book.author || t('common.unknownAuthor')}</span>
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
          onClick={onMenu}
        >
          <IconMore size={17} />
        </button>
      </article>
    </li>
  );
}

export function LibraryEmpty({
  busy,
  onImport,
  t,
}: {
  busy: boolean;
  onImport: () => void;
  t: Translate;
}) {
  return (
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
        onClick={onImport}
      >
        <IconPlus size={16} />
        {t('library.importFirst')}
      </button>
    </section>
  );
}
