import { LlmError } from '@garagara/llm';
import { useEffect, useRef, useState } from 'react';

import { IconCheck, IconChevronRight, IconCopy, IconX } from './icons';
import { describeLlmError } from './llm-errors.js';
import { loadTranslation, type LlmRuntime } from './llm.js';
import { isLlmConfigured } from './settings.js';

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
  llm,
  onClose,
  onOpenSettings,
}: {
  sentence: string;
  placement: 'top' | 'bottom';
  llm?: LlmRuntime;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
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
      setState({ status: 'error', message: describeLlmError(error) });
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
      aria-label="整句翻译"
    >
      <header className="translation-header">
        <div className="translation-heading">
          <span className="word-card-kicker">整句 · 结合上下文</span>
          <h3>翻译</h3>
        </div>
        <div className="translation-header-actions">
          {ready ? (
            <span className="word-source-badge" data-translation-source={state.source}>
              {state.source === 'cache' ? '缓存' : 'AI'}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button word-card-close"
            aria-label="关闭翻译"
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </div>
      </header>

      <blockquote className="translation-source">{sentence}</blockquote>

      {state.status === 'loading' ? (
        <p className="translation-loading" role="status">
          正在翻译整句…
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
          尚未配置 AI 服务。
          <button type="button" className="word-inline-action" onClick={onOpenSettings}>
            去设置
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
          {copied ? '已复制' : '复制'}
        </button>
        {state.status === 'error' || state.status === 'offline' ? (
          <button type="button" className="translation-action" onClick={() => void run()}>
            重试
          </button>
        ) : null}
        <button type="button" className="translation-action" onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  );
}
