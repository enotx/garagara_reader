import { describe, expect, it } from 'vitest';

import { DEFAULT_LLM_SETTINGS, isLlmConfigured, normalizeLlmSettings } from './settings.js';

describe('LLM settings', () => {
  it('falls back to Spec §14 defaults for missing or invalid values', () => {
    expect(normalizeLlmSettings({})).toEqual(DEFAULT_LLM_SETTINGS);
    expect(
      normalizeLlmSettings({
        baseURL: 42,
        model: null,
        strategy: 'random',
        autoRequest: 'yes',
      }),
    ).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it('keeps valid values', () => {
    expect(
      normalizeLlmSettings({
        baseURL: 'https://api.example.com/v1',
        model: 'test-model',
        strategy: 'dictionary-first',
        autoRequest: false,
      }),
    ).toEqual({
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
      strategy: 'dictionary-first',
      autoRequest: false,
    });
  });

  it('treats a blank baseURL or model as not configured', () => {
    expect(isLlmConfigured({ ...DEFAULT_LLM_SETTINGS })).toBe(false);
    expect(
      isLlmConfigured({
        ...DEFAULT_LLM_SETTINGS,
        baseURL: 'https://api.example.com/v1',
        model: '  ',
      }),
    ).toBe(false);
    expect(
      isLlmConfigured({
        ...DEFAULT_LLM_SETTINGS,
        baseURL: 'https://api.example.com/v1',
        model: 'test-model',
      }),
    ).toBe(true);
  });
});
