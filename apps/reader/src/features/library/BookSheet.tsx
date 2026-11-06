import type { BookSummary } from '@garagara/storage';
import { useEffect } from 'react';

import { localeFor, type AppLanguage, type Translate } from '../../shared/i18n/i18n.js';
import { IconChevronRight, IconInfo, IconX } from '../../shared/ui/icons';
import { coverTone } from './cover-tone.js';

function formatImportDate(timestamp: number, language: AppLanguage): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

export function BookSheet({
  book,
  language,
  t,
  onOpen,
  onClose,
}: {
  book: BookSummary;
  language: AppLanguage;
  t: Translate;
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="sheet" role="dialog" aria-modal="true" aria-label={t('library.bookActions')}>
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-book">
          <span className={`sheet-cover tone-${coverTone(book.id)}`} aria-hidden="true">
            <span>{book.title}</span>
          </span>
          <div className="sheet-book-copy">
            <h2>{book.title}</h2>
            <p>{book.author || t('common.unknownAuthor')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('library.closeActions')}
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </header>

        <div className="sheet-actions">
          <button type="button" className="sheet-action primary" onClick={onOpen}>
            <IconChevronRight size={18} />
            {t('library.startReading')}
          </button>
          <div className="sheet-action" aria-hidden="true">
            <IconInfo size={18} />
            {t('library.bookInfo')}
            <small>{book.format.toUpperCase()}</small>
          </div>
        </div>

        <div className="sheet-details">
          <div className="sheet-detail">
            <span>{t('library.format')}</span>
            <strong>{book.format.toUpperCase()}</strong>
          </div>
          <div className="sheet-detail">
            <span>{t('library.language')}</span>
            <strong>{book.lang.toUpperCase()}</strong>
          </div>
          <div className="sheet-detail">
            <span>{t('library.importedAt')}</span>
            <strong>{formatImportDate(book.importedAt, language)}</strong>
          </div>
        </div>

        <button type="button" className="sheet-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </section>
    </div>
  );
}
