import { describe, expect, it } from 'vitest';

import { LANGUAGE_OPTIONS, localeFor, translate, translator } from './i18n.js';

describe('i18n', () => {
  it('offers Chinese, English and Japanese as native labels', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(['zh', 'en', 'ja']);
    expect(LANGUAGE_OPTIONS.map((option) => option.label)).toEqual(['中文', 'English', '日本語']);
  });

  it('translates and interpolates parameters in every language', () => {
    expect(translate('zh', 'reader.pageOf', { page: 2, pages: 9, percent: 20 })).toBe(
      '2 / 9 页 · 20%',
    );
    expect(translate('en', 'reader.pageOf', { page: 2, pages: 9, percent: 20 })).toBe(
      '2 / 9 · 20%',
    );
    expect(translate('ja', 'reader.pageOf', { page: 2, pages: 9, percent: 20 })).toBe(
      '2 / 9ページ · 20%',
    );
  });

  it('creates a translator bound to one language', () => {
    const t = translator('en');
    expect(t('nav.library')).toBe('Library');
    expect(t('word.onlyWord', { word: 'took' })).toBe('Only “took”');
  });

  it('maps languages to Intl locales', () => {
    expect(localeFor('zh')).toBe('zh-CN');
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('ja')).toBe('ja-JP');
  });
});
