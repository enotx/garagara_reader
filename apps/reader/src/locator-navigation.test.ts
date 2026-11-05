import type { Locator } from '@garagara/core';
import { describe, expect, it } from 'vitest';

import { chapterIndexForLocator } from './locator-navigation.js';

const chapters = [{ index: 0 }, { index: 1 }, { index: 2 }];

function locator(chapterIndex: number): Locator {
  return { bookId: 'book', chapterIndex, blockIndex: 0, offset: 0 };
}

describe('chapterIndexForLocator', () => {
  it('returns the chapter that owns the locator', () => {
    expect(chapterIndexForLocator(chapters, locator(2))).toBe(2);
  });

  it('returns undefined for a missing locator', () => {
    expect(chapterIndexForLocator(chapters, undefined)).toBeUndefined();
  });

  it('returns undefined when the chapter was removed from the book', () => {
    expect(chapterIndexForLocator(chapters, locator(9))).toBeUndefined();
  });
});
