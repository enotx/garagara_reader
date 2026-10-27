import { describe, expect, it } from 'vitest';

import { clampLocator, globalOffsetToLocator, locatorToGlobalOffset } from './position.js';

const book = {
  chapters: [
    { blocks: [{ text: 'abc' }, { text: 'de' }, { text: 'fghij' }] },
    { blocks: [{ text: 'kl' }] },
  ],
};

describe('global offsets and locators', () => {
  it('converts locators to whole-book offsets', () => {
    expect(
      locatorToGlobalOffset(book, { bookId: 'b', chapterIndex: 0, blockIndex: 0, offset: 0 }),
    ).toBe(0);
    expect(
      locatorToGlobalOffset(book, { bookId: 'b', chapterIndex: 0, blockIndex: 0, offset: 2 }),
    ).toBe(2);
    expect(
      locatorToGlobalOffset(book, { bookId: 'b', chapterIndex: 0, blockIndex: 1, offset: 0 }),
    ).toBe(3);
    expect(
      locatorToGlobalOffset(book, { bookId: 'b', chapterIndex: 0, blockIndex: 2, offset: 5 }),
    ).toBe(10);
    expect(
      locatorToGlobalOffset(book, { bookId: 'b', chapterIndex: 1, blockIndex: 0, offset: 1 }),
    ).toBe(11);
  });

  it('round-trips every in-block character offset', () => {
    for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
      const chapter = book.chapters[chapterIndex];
      for (let blockIndex = 0; blockIndex < (chapter?.blocks.length ?? 0); blockIndex += 1) {
        const block = chapter?.blocks[blockIndex];
        for (let offset = 0; offset < (block?.text.length ?? 0); offset += 1) {
          const locator = { bookId: 'b', chapterIndex, blockIndex, offset };
          const global = locatorToGlobalOffset(book, locator);
          expect(globalOffsetToLocator('b', book, global)).toEqual(locator);
        }
      }
    }
  });

  it('maps block boundaries and the end of the book to a canonical locator', () => {
    expect(globalOffsetToLocator('b', book, 2)).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 0,
      offset: 2,
    });
    expect(globalOffsetToLocator('b', book, 3)).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 1,
      offset: 0,
    });
    expect(globalOffsetToLocator('b', book, 12)).toEqual({
      bookId: 'b',
      chapterIndex: 1,
      blockIndex: 0,
      offset: 2,
    });
    expect(globalOffsetToLocator('b', book, -5)).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 0,
      offset: 0,
    });
  });

  it('skips empty blocks when resolving a boundary', () => {
    const withEmpty = { chapters: [{ blocks: [{ text: 'ab' }, { text: '' }, { text: 'cd' }] }] };
    expect(globalOffsetToLocator('b', withEmpty, 2)).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 2,
      offset: 0,
    });
  });

  it('clamps out-of-range locators', () => {
    expect(clampLocator(book, { bookId: 'b', chapterIndex: 9, blockIndex: 9, offset: 9 })).toEqual({
      bookId: 'b',
      chapterIndex: 1,
      blockIndex: 0,
      offset: 2,
    });
    expect(
      clampLocator(book, { bookId: 'b', chapterIndex: -1, blockIndex: -1, offset: -1 }),
    ).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 0,
      offset: 0,
    });
    expect(
      clampLocator({ chapters: [] }, { bookId: 'b', chapterIndex: 3, blockIndex: 3, offset: 3 }),
    ).toEqual({
      bookId: 'b',
      chapterIndex: 0,
      blockIndex: 0,
      offset: 0,
    });
  });
});
