import type { SqliteAdapter } from '@garagara/storage';
import { getSetting, setSetting } from '@garagara/storage';

export type DefinitionStrategy = 'online-first' | 'dictionary-first';
export type PreprocessPolicy = 'off' | 'wifi' | 'always';
export type NetworkKind = 'wifi' | 'cellular' | 'unknown';

export interface NetworkStatus {
  online: boolean;
  kind: NetworkKind;
}

export interface ReaderLlmSettings {
  baseURL: string;
  model: string;
  strategy: DefinitionStrategy;
  autoRequest: boolean;
  preprocess: PreprocessPolicy;
  /** Number of chapters after the current one to preprocess (Spec §9.4). */
  preprocessChapters: number;
}

export const DEFAULT_LLM_SETTINGS: ReaderLlmSettings = {
  baseURL: '',
  model: '',
  strategy: 'online-first',
  autoRequest: true,
  preprocess: 'wifi',
  preprocessChapters: 1,
};

const SETTING_KEYS = {
  baseURL: 'llm.baseURL',
  model: 'llm.model',
  strategy: 'llm.strategy',
  autoRequest: 'llm.autoRequest',
  preprocess: 'llm.preprocess',
  preprocessChapters: 'llm.preprocessChapters',
} as const;

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asStrategy(value: unknown, fallback: DefinitionStrategy): DefinitionStrategy {
  return value === 'online-first' || value === 'dictionary-first' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asPreprocess(value: unknown, fallback: PreprocessPolicy): PreprocessPolicy {
  return value === 'off' || value === 'wifi' || value === 'always' ? value : fallback;
}

function asChapterCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Applies the preprocessing policy from Spec §9.4. `wifi` never runs on
 * cellular or on an unknown connection type.
 */
export function allowsPreprocess(policy: PreprocessPolicy, network: NetworkStatus): boolean {
  if (!network.online || policy === 'off') {
    return false;
  }
  return policy === 'always' || network.kind === 'wifi';
}

/** Normalizes untrusted settings JSON so a corrupt row never breaks the reader. */
export function normalizeLlmSettings(values: Readonly<Record<string, unknown>>): ReaderLlmSettings {
  return {
    baseURL: asString(values.baseURL, DEFAULT_LLM_SETTINGS.baseURL),
    model: asString(values.model, DEFAULT_LLM_SETTINGS.model),
    strategy: asStrategy(values.strategy, DEFAULT_LLM_SETTINGS.strategy),
    autoRequest: asBoolean(values.autoRequest, DEFAULT_LLM_SETTINGS.autoRequest),
    preprocess: asPreprocess(values.preprocess, DEFAULT_LLM_SETTINGS.preprocess),
    preprocessChapters: asChapterCount(
      values.preprocessChapters,
      DEFAULT_LLM_SETTINGS.preprocessChapters,
    ),
  };
}

export function isLlmConfigured(settings: ReaderLlmSettings): boolean {
  return Boolean(settings.baseURL.trim() && settings.model.trim());
}

export async function readLlmSettings(adapter: SqliteAdapter): Promise<ReaderLlmSettings> {
  const baseURL = await getSetting<unknown>(adapter, SETTING_KEYS.baseURL);
  const model = await getSetting<unknown>(adapter, SETTING_KEYS.model);
  const strategy = await getSetting<unknown>(adapter, SETTING_KEYS.strategy);
  const autoRequest = await getSetting<unknown>(adapter, SETTING_KEYS.autoRequest);
  const preprocess = await getSetting<unknown>(adapter, SETTING_KEYS.preprocess);
  const preprocessChapters = await getSetting<unknown>(adapter, SETTING_KEYS.preprocessChapters);
  return normalizeLlmSettings({
    baseURL,
    model,
    strategy,
    autoRequest,
    preprocess,
    preprocessChapters,
  });
}

export async function writeLlmSettings(
  adapter: SqliteAdapter,
  settings: ReaderLlmSettings,
  now: number = Date.now(),
): Promise<void> {
  await setSetting(adapter, SETTING_KEYS.baseURL, settings.baseURL, now);
  await setSetting(adapter, SETTING_KEYS.model, settings.model, now);
  await setSetting(adapter, SETTING_KEYS.strategy, settings.strategy, now);
  await setSetting(adapter, SETTING_KEYS.autoRequest, settings.autoRequest, now);
  await setSetting(adapter, SETTING_KEYS.preprocess, settings.preprocess, now);
  await setSetting(adapter, SETTING_KEYS.preprocessChapters, settings.preprocessChapters, now);
}
