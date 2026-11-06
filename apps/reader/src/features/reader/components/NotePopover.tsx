import type { Note } from '@garagara/core';

import type { Translate } from '../../../shared/i18n/i18n.js';
import { IconX } from '../../../shared/ui/icons';

export function NotePopover({
  note,
  t,
  onClose,
}: {
  note: Note;
  t: Translate;
  onClose: () => void;
}) {
  return (
    <aside className="note-popup" data-note-popup>
      <header className="note-header">
        <h3>{t('reader.footnote')}</h3>
        <button
          type="button"
          className="reader-button"
          aria-label={t('reader.closeFootnote')}
          onClick={onClose}
        >
          <IconX size={18} />
        </button>
      </header>
      <p>{note.text}</p>
    </aside>
  );
}
