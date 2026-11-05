import type { SqliteAdapter } from '@garagara/storage';
import { useState } from 'react';

import { LANGUAGE_OPTIONS, translator, type AppLanguage, type MessageKey } from './i18n.js';
import { IconChevronLeft } from './icons';
import { testLlmConnection } from './llm.js';
import {
  DEFAULT_LLM_SETTINGS,
  apiKeyUpdateFor,
  isLlmConfigured,
  writeLlmSettings,
  type DefinitionStrategy,
  type PreprocessPolicy,
  type ReaderLlmSettings,
} from './settings.js';

type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'error'; message: string };

type TestStatus =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; reply: string }
  | { state: 'error'; message: string };

const STRATEGIES: Array<{
  value: DefinitionStrategy;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: 'online-first',
    titleKey: 'settings.strategyOnline',
    descriptionKey: 'settings.strategyOnlineDesc',
  },
  {
    value: 'dictionary-first',
    titleKey: 'settings.strategyDict',
    descriptionKey: 'settings.strategyDictDesc',
  },
];

const PREPROCESS_POLICIES: Array<{
  value: PreprocessPolicy;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: 'off',
    titleKey: 'settings.preprocessOff',
    descriptionKey: 'settings.preprocessOffDesc',
  },
  {
    value: 'wifi',
    titleKey: 'settings.preprocessWifi',
    descriptionKey: 'settings.preprocessWifiDesc',
  },
  {
    value: 'always',
    titleKey: 'settings.preprocessAlways',
    descriptionKey: 'settings.preprocessAlwaysDesc',
  },
];

function reasonFor(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function SettingsView({
  adapter,
  settings,
  apiKey,
  backLabel,
  onBack,
  onSaved,
}: {
  adapter: SqliteAdapter | undefined;
  settings: ReaderLlmSettings;
  apiKey: string;
  backLabel: string;
  onBack: () => void;
  onSaved: (settings: ReaderLlmSettings, apiKeyUpdate?: string) => void | Promise<void>;
}) {
  const t = translator(settings.uiLanguage);
  const [baseURL, setBaseURL] = useState(settings.baseURL);
  const [model, setModel] = useState(settings.model);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [keyTouched, setKeyTouched] = useState(false);
  const [strategy, setStrategy] = useState<DefinitionStrategy>(settings.strategy);
  const [autoRequest, setAutoRequest] = useState(settings.autoRequest);
  const [preprocess, setPreprocess] = useState<PreprocessPolicy>(settings.preprocess);
  const [preprocessChapters, setPreprocessChapters] = useState(settings.preprocessChapters);
  const [uiLanguage, setUiLanguage] = useState<AppLanguage>(settings.uiLanguage);
  const [explainLanguage, setExplainLanguage] = useState<AppLanguage>(settings.explainLanguage);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle' });
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: 'idle' });

  const draft: ReaderLlmSettings = {
    baseURL,
    model,
    strategy,
    autoRequest,
    preprocess,
    preprocessChapters,
    uiLanguage,
    explainLanguage,
  };

  async function save(): Promise<void> {
    if (!adapter) {
      return;
    }
    if (Boolean(baseURL.trim()) !== Boolean(model.trim())) {
      setSaveStatus({ state: 'error', message: t('settings.baseModelRequired') });
      return;
    }
    setSaveStatus({ state: 'saving' });
    try {
      await writeLlmSettings(adapter, draft);
      await onSaved(draft, apiKeyUpdateFor(keyTouched, keyDraft));
      setSaveStatus({ state: 'saved' });
    } catch (error) {
      setSaveStatus({
        state: 'error',
        message: t('settings.saveFailed', { error: reasonFor(error) }),
      });
    }
  }

  async function runTest(): Promise<void> {
    setTestStatus({ state: 'testing' });
    try {
      const reply = await testLlmConnection(draft, keyTouched ? keyDraft : apiKey);
      setTestStatus({ state: 'ok', reply });
    } catch (error) {
      setTestStatus({ state: 'error', message: reasonFor(error) });
    }
  }

  return (
    <main className="app settings">
      <header className="settings-topbar">
        <div className="settings-topbar-inner">
          <button type="button" className="icon-button" aria-label={backLabel} onClick={onBack}>
            <IconChevronLeft size={22} />
          </button>
          <div className="settings-heading">
            <p className="eyebrow">{t('settings.eyebrow')}</p>
            <h1>{t('settings.title')}</h1>
          </div>
          <button
            type="button"
            className="button-primary settings-save-button"
            aria-label={t('settings.save')}
            title={t('settings.saveAll')}
            onClick={() => void save()}
            disabled={!adapter || saveStatus.state === 'saving'}
          >
            {saveStatus.state === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </header>

      <div className="settings-shell">
        <section className="settings-group" aria-labelledby="settings-language-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-language-title">{t('settings.languageTitle')}</h2>
              <p>{t('settings.languageDesc')}</p>
            </div>
          </header>

          <div className="settings-fields settings-language-fields">
            <label className="settings-field">
              <span className="settings-label">{t('settings.uiLanguage')}</span>
              <select
                aria-label={t('settings.uiLanguage')}
                value={uiLanguage}
                onChange={(event) => {
                  setUiLanguage(event.target.value as AppLanguage);
                  setSaveStatus({ state: 'idle' });
                }}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span className="settings-label">{t('settings.explainLanguage')}</span>
              <select
                aria-label={t('settings.explainLanguage')}
                value={explainLanguage}
                onChange={(event) => {
                  setExplainLanguage(event.target.value as AppLanguage);
                  setSaveStatus({ state: 'idle' });
                }}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="settings-hint">{t('settings.languageHint')}</p>
        </section>

        <section className="settings-group" aria-labelledby="settings-ai-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-ai-title">{t('settings.aiTitle')}</h2>
              <p>{t('settings.aiDesc')}</p>
            </div>
            <span
              className={`settings-badge${isLlmConfigured(draft) ? ' is-ready' : ''}`}
              aria-live="polite"
            >
              {isLlmConfigured(draft)
                ? t('settings.configured')
                : t('settings.notConfigured')}
            </span>
          </header>

          <div className="settings-fields">
            <label className="settings-field">
              <span className="settings-label">Base URL</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://api.example.com/v1"
                value={baseURL}
                onChange={(event) => {
                  setBaseURL(event.target.value);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">{t('settings.model')}</span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="gpt-4o-mini"
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
            <label className="settings-field">
              <span className="settings-label">
                API Key
                <small>
                  {apiKey ? t('settings.keySaved') : t('settings.keyOptional')}
                </small>
              </span>
              <input
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                value={keyDraft}
                onChange={(event) => {
                  setKeyDraft(event.target.value);
                  setKeyTouched(true);
                  setSaveStatus({ state: 'idle' });
                }}
              />
            </label>
          </div>

          <p className="settings-hint">{t('settings.keyHint')}</p>

          <div className="settings-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => void runTest()}
              disabled={testStatus.state === 'testing'}
            >
              {testStatus.state === 'testing' ? t('settings.testing') : t('settings.test')}
            </button>
          </div>

          {saveStatus.state === 'saved' ? (
            <p className="settings-feedback is-success" role="status">
              {t('settings.saved')}
            </p>
          ) : null}
          {saveStatus.state === 'error' ? (
            <p className="settings-feedback is-error" role="status">
              {saveStatus.message}
            </p>
          ) : null}
          {testStatus.state === 'ok' ? (
            <p className="settings-feedback is-success" role="status">
              {t('settings.testOk', { reply: testStatus.reply })}
            </p>
          ) : null}
          {testStatus.state === 'error' ? (
            <p className="settings-feedback is-error" role="status">
              {t('settings.testFailed', { message: testStatus.message })}
            </p>
          ) : null}
        </section>

        <section className="settings-group" aria-labelledby="settings-source-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-source-title">{t('settings.sourceTitle')}</h2>
              <p>{t('settings.sourceDesc')}</p>
            </div>
          </header>

          <div
            className="settings-options"
            role="radiogroup"
            aria-labelledby="settings-source-title"
          >
            {STRATEGIES.map((item) => (
              <label
                key={item.value}
                className={`settings-option${strategy === item.value ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="definition-strategy"
                  value={item.value}
                  checked={strategy === item.value}
                  onChange={() => {
                    setStrategy(item.value);
                    setSaveStatus({ state: 'idle' });
                  }}
                />
                <span className="settings-option-copy">
                  <strong>{t(item.titleKey)}</strong>
                  <span>{t(item.descriptionKey)}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="settings-switch">
            <span>
              <strong>{t('settings.autoRequest')}</strong>
              <span>{t('settings.autoRequestDesc')}</span>
            </span>
            <input
              type="checkbox"
              checked={autoRequest}
              onChange={(event) => {
                setAutoRequest(event.target.checked);
                setSaveStatus({ state: 'idle' });
              }}
            />
          </label>
        </section>

        <section className="settings-group" aria-labelledby="settings-preprocess-title">
          <header className="settings-group-head">
            <div>
              <h2 id="settings-preprocess-title">{t('settings.preprocessTitle')}</h2>
              <p>{t('settings.preprocessDesc')}</p>
            </div>
          </header>

          <div
            className="settings-options"
            role="radiogroup"
            aria-labelledby="settings-preprocess-title"
          >
            {PREPROCESS_POLICIES.map((item) => (
              <label
                key={item.value}
                className={`settings-option${preprocess === item.value ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="preprocess-policy"
                  value={item.value}
                  checked={preprocess === item.value}
                  onChange={() => {
                    setPreprocess(item.value);
                    setSaveStatus({ state: 'idle' });
                  }}
                />
                <span className="settings-option-copy">
                  <strong>{t(item.titleKey)}</strong>
                  <span>{t(item.descriptionKey)}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="settings-field">
            <span className="settings-label">
              {t('settings.preprocessChapters')}
              <small>{t('settings.preprocessChaptersHint')}</small>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={preprocessChapters}
              disabled={preprocess === 'off'}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 0) {
                  setPreprocessChapters(value);
                  setSaveStatus({ state: 'idle' });
                }
              }}
            />
          </label>
        </section>

        <section className="settings-group settings-privacy" aria-label={t('settings.privacyTitle')}>
          <h2>{t('settings.privacyTitle')}</h2>
          <p>{t('settings.privacyDesc')}</p>
          <p className="settings-version">{t('settings.defaultHint')}</p>
          <button
            type="button"
            className="settings-reset"
            onClick={() => {
              setBaseURL(DEFAULT_LLM_SETTINGS.baseURL);
              setModel(DEFAULT_LLM_SETTINGS.model);
              setStrategy(DEFAULT_LLM_SETTINGS.strategy);
              setAutoRequest(DEFAULT_LLM_SETTINGS.autoRequest);
              setPreprocess(DEFAULT_LLM_SETTINGS.preprocess);
              setPreprocessChapters(DEFAULT_LLM_SETTINGS.preprocessChapters);
              setSaveStatus({ state: 'idle' });
            }}
          >
            {t('settings.reset')}
          </button>
        </section>
      </div>
    </main>
  );
}
