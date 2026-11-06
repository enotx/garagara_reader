import { describe, expect, it } from 'vitest';

import { devLlmEnvFromEnv } from './dev-env.js';

describe('devLlmEnvFromEnv', () => {
  it('returns nothing outside development builds', () => {
    expect(devLlmEnvFromEnv({ DEV: false, VITE_LLM_BASE_URL: 'https://api' })).toEqual({
      settings: {},
      apiKey: '',
    });
    expect(devLlmEnvFromEnv({ VITE_LLM_BASE_URL: 'https://api' })).toEqual({
      settings: {},
      apiKey: '',
    });
  });

  it('parses every supported LLM setting including the API key', () => {
    expect(
      devLlmEnvFromEnv({
        DEV: true,
        VITE_LLM_BASE_URL: ' https://api.example.com/v1 ',
        VITE_LLM_MODEL: 'gpt-4o-mini',
        VITE_LLM_API_KEY: ' sk-dev-key ',
        VITE_LLM_STRATEGY: 'dictionary-first',
        VITE_LLM_AUTO_REQUEST: 'false',
        VITE_LLM_PREPROCESS: 'always',
        VITE_LLM_PREPROCESS_CHAPTERS: '3',
      }),
    ).toEqual({
      settings: {
        baseURL: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
        strategy: 'dictionary-first',
        autoRequest: false,
        preprocess: 'always',
        preprocessChapters: 3,
      },
      apiKey: 'sk-dev-key',
    });
  });

  it('drops invalid values instead of falling back to defaults', () => {
    expect(
      devLlmEnvFromEnv({
        DEV: true,
        VITE_LLM_BASE_URL: '   ',
        VITE_LLM_MODEL: 'gpt-4o-mini',
        VITE_LLM_API_KEY: '   ',
        VITE_LLM_STRATEGY: 'random',
        VITE_LLM_AUTO_REQUEST: 'yes',
        VITE_LLM_PREPROCESS: 'sometimes',
        VITE_LLM_PREPROCESS_CHAPTERS: '1.5',
      }),
    ).toEqual({ settings: { model: 'gpt-4o-mini' }, apiKey: '' });
  });

  it('accepts zero as a chapter count', () => {
    expect(
      devLlmEnvFromEnv({
        DEV: true,
        VITE_LLM_PREPROCESS_CHAPTERS: '0',
      }),
    ).toEqual({ settings: { preprocessChapters: 0 }, apiKey: '' });
  });
});
