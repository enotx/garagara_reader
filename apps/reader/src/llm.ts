import {
  LlmCache,
  OpenAiCompatibleProvider,
  buildLlmCacheKey,
  buildTranslateSentenceMessages,
  buildWordInContextMessages,
  parseTranslateSentenceResult,
  parseWordInContextResult,
  promptVersionFor,
  type LlmCacheKeyInput,
  type WordInContextResult,
} from '@garagara/llm';
import type { SqliteAdapter } from '@garagara/storage';

import { isLlmConfigured, type ReaderLlmSettings } from './settings.js';

const BOOK_LANG = 'en';
const EXPLAIN_LANG = 'zh';

export interface LlmRuntime {
  adapter: SqliteAdapter;
  settings: ReaderLlmSettings;
  /** Kept in memory for the web build; iOS stores it in Keychain (Spec §16). */
  apiKey: string;
}

export interface WordContextTarget {
  sentence: string;
  /** Start offset inside the sentence, UTF-16. */
  start: number;
  /** End offset inside the sentence, exclusive, UTF-16. */
  end: number;
}

export type WordContextOutcome =
  | { status: 'ready'; result: WordInContextResult; source: 'cache' | 'llm' }
  | { status: 'offline'; message: string };

export type TranslationOutcome =
  | { status: 'ready'; translation: string; source: 'cache' | 'llm' }
  | { status: 'offline'; message: string };

function cacheInput(runtime: LlmRuntime, target: WordContextTarget): LlmCacheKeyInput {
  return {
    task: 'wordInContext',
    sentence: target.sentence,
    targetWord: target.sentence.slice(target.start, target.end),
    l2: BOOK_LANG,
    explainLang: EXPLAIN_LANG,
    model: runtime.settings.model,
    promptVersion: promptVersionFor('wordInContext'),
  };
}

function translationCacheInput(runtime: LlmRuntime, sentence: string): LlmCacheKeyInput {
  return {
    task: 'translateSentence',
    sentence,
    l2: BOOK_LANG,
    explainLang: EXPLAIN_LANG,
    model: runtime.settings.model,
    promptVersion: promptVersionFor('translateSentence'),
  };
}

function createProvider(runtime: LlmRuntime): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    baseURL: runtime.settings.baseURL,
    model: runtime.settings.model,
    ...(runtime.apiKey ? { apiKey: runtime.apiKey } : {}),
  });
}

/**
 * Reads a cached wordInContext result without touching the network. Returns
 * undefined when the cache is cold or the LLM settings are incomplete.
 */
export async function readCachedWordContext(
  runtime: LlmRuntime,
  target: WordContextTarget,
): Promise<WordInContextResult | undefined> {
  if (!isLlmConfigured(runtime.settings)) {
    return undefined;
  }
  const cache = new LlmCache(runtime.adapter);
  return cache.get<WordInContextResult>(cacheInput(runtime, target));
}

/**
 * Cache-first lookup for Spec §9.4. Never calls the network when `allowNetwork`
 * is false, so offline reading falls back to a cached result or the dictionary.
 */
export async function loadWordContext(
  runtime: LlmRuntime,
  target: WordContextTarget,
  options: { allowNetwork: boolean; signal?: AbortSignal },
): Promise<WordContextOutcome> {
  if (!isLlmConfigured(runtime.settings)) {
    throw new Error('LLM is not configured');
  }
  const cache = new LlmCache(runtime.adapter);
  const input = cacheInput(runtime, target);
  const cached = await cache.get<WordInContextResult>(input);
  if (cached) {
    return { status: 'ready', result: cached, source: 'cache' };
  }
  if (!options.allowNetwork) {
    return { status: 'offline', message: '当前处于离线状态，且没有缓存。' };
  }

  const provider = createProvider(runtime);
  const completion = await provider.complete({
    messages: buildWordInContextMessages({
      sentence: target.sentence,
      targetStart: target.start,
      targetEnd: target.end,
      explainLang: EXPLAIN_LANG,
    }),
    responseFormat: 'json',
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const result = parseWordInContextResult(completion.content, target.sentence);
  await cache.set(input, result);
  return { status: 'ready', result, source: 'llm' };
}

/**
 * Cache-first sentence translation with the same offline rules as wordInContext.
 * Translation is always requested for the whole sentence, even when it spans pages.
 */
export async function loadTranslation(
  runtime: LlmRuntime,
  sentence: string,
  options: { allowNetwork: boolean; signal?: AbortSignal },
): Promise<TranslationOutcome> {
  if (!isLlmConfigured(runtime.settings)) {
    throw new Error('LLM is not configured');
  }
  const cache = new LlmCache(runtime.adapter);
  const input = translationCacheInput(runtime, sentence);
  const cached = await cache.get<{ translation: string }>(input);
  if (cached) {
    return { status: 'ready', translation: cached.translation, source: 'cache' };
  }
  if (!options.allowNetwork) {
    return { status: 'offline', message: '当前处于离线状态，且没有缓存。' };
  }

  const provider = createProvider(runtime);
  const completion = await provider.complete({
    messages: buildTranslateSentenceMessages({ sentence, explainLang: EXPLAIN_LANG }),
    responseFormat: 'json',
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const result = parseTranslateSentenceResult(completion.content);
  await cache.set(input, result);
  return { status: 'ready', translation: result.translation, source: 'llm' };
}

/** Pings the configured endpoint and returns a short model reply. */
export async function testLlmConnection(
  settings: ReaderLlmSettings,
  apiKey: string,
): Promise<string> {
  if (!isLlmConfigured(settings)) {
    throw new Error('请先填写 Base URL 和模型');
  }
  const provider = new OpenAiCompatibleProvider({
    baseURL: settings.baseURL,
    model: settings.model,
    ...(apiKey ? { apiKey } : {}),
    timeoutMs: 15_000,
    retries: 0,
  });
  const completion = await provider.complete({
    messages: [
      {
        role: 'user',
        content: 'Reply with exactly the two letters: OK',
      },
    ],
    responseFormat: 'text',
  });
  return completion.content.trim().slice(0, 80) || 'OK';
}

/** Builds a cache key without a request; exposed for tests and diagnostics. */
export async function wordContextCacheKey(
  runtime: LlmRuntime,
  target: WordContextTarget,
): Promise<string> {
  return buildLlmCacheKey(cacheInput(runtime, target));
}
