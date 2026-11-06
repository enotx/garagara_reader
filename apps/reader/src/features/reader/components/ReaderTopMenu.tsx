import type { ChapterSummary } from '@garagara/storage';

import type { MessageKey, Translate } from '../../../shared/i18n/i18n.js';
import { THEMES, type Theme } from '../../../shared/theme/theme.js';
import { IconX } from '../../../shared/ui/icons';

const THEME_KEYS: Record<Theme, MessageKey> = {
  light: 'theme.light',
  dark: 'theme.dark',
  sepia: 'theme.sepia',
  eink: 'theme.eink',
};

export function ReaderTopMenu({
  chapterTitle,
  chapterIndex,
  chapters,
  theme,
  t,
  onClose,
  onThemeChange,
  onChapterChange,
}: {
  chapterTitle: string;
  chapterIndex: number;
  chapters: ChapterSummary[];
  theme: Theme;
  t: Translate;
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
  onChapterChange: (chapterIndex: number) => void;
}) {
  return (
    <div className="reader-menu reader-menu-top" data-menu="top">
      <div className="menu-top-row">
        <button type="button" className="reader-button" aria-label={t('reader.closeMenu')} onClick={onClose}>
          <IconX size={18} />
        </button>
        <div className="menu-title">
          <span>{t('reader.menuTitle')}</span>
          <strong>{chapterTitle}</strong>
        </div>
      </div>
      <div className="menu-settings-row">
        <label className="menu-field">
          <span className="menu-field-label">{t('reader.theme')}</span>
          <select
            className="theme-select"
            value={theme}
            aria-label={t('reader.theme')}
            onChange={(event) => onThemeChange(event.target.value as Theme)}
          >
            {THEMES.map((item) => (
              <option key={item} value={item}>
                {t(THEME_KEYS[item])}
              </option>
            ))}
          </select>
        </label>
        <label className="menu-field">
          <span className="menu-field-label">{t('reader.chapter')}</span>
          <select
            className="chapter-select"
            value={chapterIndex}
            aria-label={t('reader.selectChapter')}
            onChange={(event) => onChapterChange(Number(event.target.value))}
          >
            {chapters.map((item) => (
              <option key={item.id} value={item.index}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
