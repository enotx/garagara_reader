import { IconBook, IconBookmark, IconDictionary, IconSettings } from '../../shared/ui/icons';
import type { Translate } from '../../shared/i18n/i18n.js';

export type AppView = 'library' | 'dictionary' | 'vocab' | 'settings';

export function TabBar({
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
