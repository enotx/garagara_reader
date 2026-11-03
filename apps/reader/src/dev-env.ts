import type { ReaderLlmSettings } from './settings.js';

export interface DevEnvInput {
  DEV?: boolean;
  VITE_LLM_BASE_URL?: string;
  VITE_LLM_MODEL?: string;
  VITE_LLM_API_KEY?: string;
  VITE_LLM_STRATEGY?: string;
  VITE_LLM_AUTO_REQUEST?: string;
  VITE_LLM_PREPROCESS?: string;
  VITE_LLM_PREPROCESS_CHAPTERS?: string;
}

export interface DevLlmEnv {
  settings: Partial<ReaderLlmSettings>;
  apiKey: string;
}

/**
 * Reads LLM settings and the API key from Vite env variables. Only
 * `VITE_`-prefixed values are exposed, and the result is empty outside web
 * development builds. The API key lives in `.env` (gitignored) and is used
 * only as an in-memory default; production builds never see it because
 * `import.meta.env.DEV` is `false` and the dead branch is eliminated.
 */
export function devLlmEnvFromEnv(env: DevEnvInput): DevLlmEnv {
  if (env.DEV !== true) {
    return { settings: {}, apiKey: '' };
  }

  const settings: Partial<ReaderLlmSettings> = {};
  const baseURL = env.VITE_LLM_BASE_URL?.trim();
  const model = env.VITE_LLM_MODEL?.trim();
  if (baseURL) {
    settings.baseURL = baseURL;
  }
  if (model) {
    settings.model = model;
  }

  const strategy = env.VITE_LLM_STRATEGY?.trim();
  if (strategy === 'online-first' || strategy === 'dictionary-first') {
    settings.strategy = strategy;
  }

  const autoRequest = env.VITE_LLM_AUTO_REQUEST?.trim();
  if (autoRequest === 'true' || autoRequest === 'false') {
    settings.autoRequest = autoRequest === 'true';
  }

  const preprocess = env.VITE_LLM_PREPROCESS?.trim();
  if (preprocess === 'off' || preprocess === 'wifi' || preprocess === 'always') {
    settings.preprocess = preprocess;
  }

  const chapters = Number(env.VITE_LLM_PREPROCESS_CHAPTERS?.trim());
  if (Number.isInteger(chapters) && chapters >= 0) {
    settings.preprocessChapters = chapters;
  }

  return { settings, apiKey: env.VITE_LLM_API_KEY?.trim() ?? '' };
}
