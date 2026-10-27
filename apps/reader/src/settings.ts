import type { SqliteAdapter } from '@garagara/storage';
import { getSetting, setSetting } from '@garagara/storage';

export type DefinitionStrategy = 'online-first' | 'dictionary-first';

export interface ReaderLlmSettings {
  baseURL: string;
  model: string;
  strategy: DefinitionStrategy;
  autoRequest: boolean;
}

export const DEFAULT_LLM_SETTINGS: ReaderLlmSettings = {
  baseURL: '',
  model: '',
  strategy: 'online-first',
  autoRequest: true,
};

const SETTING_KEYS = {
  baseURL: 'llm.baseURL',
  model: 'llm.model',
  strategy: 'llm.strategy',
  autoRequest: 'llm.autoRequest',
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

/** Normalizes untrusted settings JSON so a corrupt row never breaks the reader. */
export function normalizeLlmSettings(values: Readonly<Record<string, unknown>>): ReaderLlmSettings {
  return {
    baseURL: asString(values.baseURL, DEFAULT_LLM_SETTINGS.baseURL),
    model: asString(values.model, DEFAULT_LLM_SETTINGS.model),
    strategy: asStrategy(values.strategy, DEFAULT_LLM_SETTINGS.strategy),
    autoRequest: asBoolean(values.autoRequest, DEFAULT_LLM_SETTINGS.autoRequest),
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
  return normalizeLlmSettings({
    baseURL,
    model,
    strategy,
    autoRequest,
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
}
