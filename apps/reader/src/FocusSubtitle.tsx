import { LlmError } from '@garagara/llm';
import { useEffect, useRef, useState } from 'react';

import { describeLlmError } from './llm-errors.js';
import { loadTranslation, type LlmRuntime } from './llm.js';
import { isLlmConfigured } from './settings.js';

type SubtitleState =
  | { status: 'loading' }
  | { status: 'ready'; translation: string }
  | { status: 'offline' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

export function FocusSubtitle({
  sentence,
  nextSentences,
  placement,
  llm,
}: {
  /** Whole current sentence, even when it spans pages. */
  sentence: string;
  /** Following sentences for the 3-sentence prefetch. */
  nextSentences: readonly string[];
  placement: 'top' | 'bottom';
  llm?: LlmRuntime;
}) {
  const [state, setState] = useState<SubtitleState>({ status: 'loading' });
  const controllerRef = useRef<AbortController | null>(null);
  const nextKey = nextSentences.slice(0, 3).join('\n');

  useEffect(() => {
    controllerRef.current?.abort();
    if (!llm || !isLlmConfigured(llm.settings)) {
      setState({ status: 'not-configured' });
      return;
    }
    const runtime = llm;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });
    const allowNetwork = typeof navigator === 'undefined' ? true : navigator.onLine;

    async function loadCurrent(): Promise<void> {
      try {
        const outcome = await loadTranslation(runtime, sentence, {
          allowNetwork,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        if (outcome.status === 'ready') {
          setState({ status: 'ready', translation: outcome.translation });
        } else {
          setState({ status: 'offline' });
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

    async function prefetch(): Promise<void> {
      for (const text of nextSentences.slice(0, 3)) {
        if (controller.signal.aborted) {
          return;
        }
        try {
          await loadTranslation(runtime, text, {
            allowNetwork,
            signal: controller.signal,
          });
        } catch {
          // Prefetch is best-effort; the current subtitle owns error reporting.
        }
      }
    }

    void (async () => {
      await loadCurrent();
      if (!controller.signal.aborted) {
        await prefetch();
      }
    })();
    return () => controller.abort();
  }, [sentence, nextKey, llm?.settings.baseURL, llm?.settings.model, llm?.apiKey]);

  return (
    <aside
      className={`focus-subtitle ${placement}`}
      data-focus-subtitle
      data-subtitle-status={state.status}
      aria-live="polite"
    >
      <span className="focus-subtitle-label" aria-hidden="true">
        译
      </span>
      <p>
        {state.status === 'loading' ? '翻译中…' : null}
        {state.status === 'ready' ? state.translation : null}
        {state.status === 'offline' ? '离线，暂无译文' : null}
        {state.status === 'not-configured' ? '未配置 AI 服务' : null}
        {state.status === 'error' ? state.message : null}
      </p>
    </aside>
  );
}
