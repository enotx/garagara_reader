import { LlmError } from '@garagara/llm';
import { useEffect, useRef, useState } from 'react';

import { translator, type AppLanguage } from '../../../shared/i18n/i18n.js';
import { IconCheck, IconChevronRight, IconCopy, IconX } from '../../../shared/ui/icons';
import { describeLlmError } from '../../../shared/llm/llm-errors.js';
import { loadTranslation, type LlmRuntime } from '../../../shared/llm/llm.js';
import { isLlmConfigured } from '../../../shared/settings/reader-settings.js';

type TranslationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; translation: string; source: 'cache' | 'llm' }
  | { status: 'offline'; message: string }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

export function TranslationPopover({
  sentence,
  placement,
  language,
  llm,
  onClose,
  onOpenSettings,
}: {
  sentence: string;
  placement: 'top' | 'bottom';
  language: AppLanguage;
  llm?: LlmRuntime;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const t = translator(language);
  const [state, setState] = useState<TranslationState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  async function run(): Promise<void> {
    controllerRef.current?.abort();
    if (!llm || !isLlmConfigured(llm.settings)) {
      setState({ status: 'not-configured' });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });
    setCopied(false);
    try {
      const outcome = await loadTranslation(llm, sentence, {
        allowNetwork: typeof navigator === 'undefined' ? true : navigator.onLine,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (outcome.status === 'ready') {
        setState({
          status: 'ready',
          translation: outcome.translation,
          source: outcome.source,
        });
      } else {
        setState({ status: 'offline', message: outcome.message });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof LlmError && error.kind === 'aborted') {
        return;
      }
      setState({ status: 'error', message: describeLlmError(error, language) });
    }
  }

  useEffect(() => {
    void run();
    return () => {
      controllerRef.current?.abort();
    };
    // The primitive deps below cover the settings fields that affect a request.
  }, [sentence, llm?.settings.baseURL, llm?.settings.model, llm?.apiKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyTranslation(): Promise<void> {
    if (state.status !== 'ready') {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.translation);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const ready = state.status === 'ready';

  return (
    <aside
      className={`translation-popover ${placement}`}
      data-translation-popover
      data-translation-status={state.status}
      aria-label={t('translation.aria')}
    >
      <header className="translation-header">
        <div className="translation-heading">
          <span className="word-card-kicker">{t('translation.kicker')}</span>
          <h3>{t('translation.title')}</h3>
        </div>
        <div className="translation-header-actions">
          {ready ? (
            <span className="word-source-badge" data-translation-source={state.source}>
              {state.source === 'cache' ? t('common.cache') : t('common.ai')}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button word-card-close"
            aria-label={t('translation.close')}
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </div>
      </header>

      <blockquote className="translation-source">{sentence}</blockquote>

      {state.status === 'loading' ? (
        <p className="translation-loading" role="status">
          {t('translation.loading')}
        </p>
      ) : null}

      {ready ? (
        <p className="translation-text" data-translation-text>
          {state.translation}
        </p>
      ) : null}

      {state.status === 'offline' ? <p className="translation-message">{state.message}</p> : null}

      {state.status === 'error' ? (
        <p className="translation-message is-error">{state.message}</p>
      ) : null}

      {state.status === 'not-configured' ? (
        <p className="translation-message">
          {t('translation.notConfigured')}
          <button type="button" className="word-inline-action" onClick={onOpenSettings}>
            {t('common.goSettings')}
            <IconChevronRight size={14} />
          </button>
        </p>
      ) : null}

      <div className="translation-actions">
        <button
          type="button"
          className="translation-action"
          onClick={() => void copyTranslation()}
          disabled={!ready}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
          {copied ? t('common.copied') : t('common.copy')}
        </button>
        {state.status === 'error' || state.status === 'offline' ? (
          <button type="button" className="translation-action" onClick={() => void run()}>
            {t('common.retry')}
          </button>
        ) : null}
        <button type="button" className="translation-action" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </aside>
  );
}
