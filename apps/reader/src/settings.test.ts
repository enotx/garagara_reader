import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LLM_SETTINGS,
  allowsPreprocess,
  isLlmConfigured,
  normalizeLlmSettings,
} from './settings.js';

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
        preprocess: 'always',
        preprocessChapters: 3,
      }),
    ).toEqual({
      baseURL: 'https://api.example.com/v1',
      model: 'test-model',
      strategy: 'dictionary-first',
      autoRequest: false,
      preprocess: 'always',
      preprocessChapters: 3,
    });
  });

  it('rejects invalid preprocessing values', () => {
    expect(normalizeLlmSettings({ preprocess: 'sometimes', preprocessChapters: -1 })).toMatchObject(
      { preprocess: 'wifi', preprocessChapters: 1 },
    );
    expect(normalizeLlmSettings({ preprocessChapters: 1.5 })).toMatchObject({
      preprocessChapters: 1,
    });
  });

  it('only preprocesses when the network policy allows it', () => {
    expect(allowsPreprocess('off', { online: true, kind: 'wifi' })).toBe(false);
    expect(allowsPreprocess('wifi', { online: false, kind: 'wifi' })).toBe(false);
    expect(allowsPreprocess('wifi', { online: true, kind: 'cellular' })).toBe(false);
    expect(allowsPreprocess('wifi', { online: true, kind: 'unknown' })).toBe(false);
    expect(allowsPreprocess('wifi', { online: true, kind: 'wifi' })).toBe(true);
    expect(allowsPreprocess('always', { online: true, kind: 'cellular' })).toBe(true);
    expect(allowsPreprocess('always', { online: false, kind: 'wifi' })).toBe(false);
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
