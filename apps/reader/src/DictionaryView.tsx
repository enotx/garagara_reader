import { translator, type AppLanguage } from './i18n.js';
import { IconDictionary, IconDownload } from './icons';

export function DictionaryView({ language }: { language: AppLanguage }) {
  const t = translator(language);

  return (
    <main className="app dictionary">
      <header className="settings-topbar">
        <div className="settings-topbar-inner">
          <div className="settings-heading">
            <p className="eyebrow">{t('dictionary.eyebrow')}</p>
            <h1>{t('dictionary.title')}</h1>
          </div>
          <span className="settings-mark" aria-hidden="true">
            <IconDictionary size={18} />
          </span>
        </div>
      </header>

      <div className="settings-shell">
        <section className="settings-group" aria-labelledby="dictionary-installed-title">
          <header className="settings-group-head">
            <div>
              <h2 id="dictionary-installed-title">{t('dictionary.installed')}</h2>
              <p>{t('dictionary.subtitle')}</p>
            </div>
          </header>

          <article className="dictionary-card">
            <div className="dictionary-card-head">
              <div>
                <h3>{t('dictionary.builtin')}</h3>
                <p>{t('dictionary.builtinDesc')}</p>
              </div>
              <span className="settings-badge">{t('dictionary.demo')}</span>
            </div>
            <div className="dictionary-meta">
              <span>{t('dictionary.pair', { source: 'EN', target: 'ZH' })}</span>
              <span>ECDICT · MIT</span>
            </div>
          </article>
        </section>

        <section className="settings-group" aria-labelledby="dictionary-add-title">
          <header className="settings-group-head">
            <div>
              <h2 id="dictionary-add-title">{t('dictionary.addTitle')}</h2>
              <p>{t('dictionary.addDesc')}</p>
            </div>
          </header>
          <button type="button" className="button-primary dictionary-add-button" disabled>
            <IconDownload size={16} />
            {t('dictionary.add')}
          </button>
          <p className="settings-hint">{t('dictionary.comingSoon')}</p>
        </section>

        <section className="settings-group settings-privacy" aria-label={t('dictionary.sourceTitle')}>
          <h2>{t('dictionary.sourceTitle')}</h2>
          <p>{t('dictionary.sourceDesc')}</p>
        </section>
      </div>
    </main>
  );
}
