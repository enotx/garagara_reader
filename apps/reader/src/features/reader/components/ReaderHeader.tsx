import type { Translate } from '../../../shared/i18n/i18n.js';
import { IconChevronLeft } from '../../../shared/ui/icons';

export function ReaderHeader({
  bookTitle,
  chapterTitle,
  percent,
  onBack,
  onClick,
  t,
}: {
  bookTitle: string;
  chapterTitle: string;
  percent: number;
  onBack: () => void;
  onClick: () => void;
  t: Translate;
}) {
  return (
    <header className="reader-header" onClick={onClick}>
      <button
        type="button"
        className="reader-button reader-back"
        aria-label={t('reader.backToLibrary')}
        onClick={(event) => {
          event.stopPropagation();
          onBack();
        }}
      >
        <IconChevronLeft size={22} />
      </button>
      <div className="reader-heading">
        <strong>{bookTitle}</strong>
        <span>{chapterTitle}</span>
      </div>
      <span className="reader-percent" aria-hidden="true">
        {percent}%
      </span>
    </header>
  );
}
