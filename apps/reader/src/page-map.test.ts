import { describe, expect, it } from 'vitest';

import { buildPageMap, type PageFragment } from './page-map.js';

const chapter = {
  index: 2,
  blocks: [
    { id: 'b0', index: 0 },
    { id: 'b1', index: 1 },
  ],
  sentences: [
    { id: 's0', blockId: 'b0', index: 0, start: 0, end: 80 },
    { id: 's1', blockId: 'b0', index: 1, start: 80, end: 100 },
    { id: 's2', blockId: 'b1', index: 0, start: 0, end: 20 },
  ],
  chunks: [
    { sentenceId: 's0', index: 0, start: 0, end: 10 },
    { sentenceId: 's0', index: 1, start: 10, end: 80 },
  ],
};

const fragments: PageFragment[] = [
  { blockId: 'b0', start: 0, end: 20, page: 0 },
  { blockId: 'b0', start: 20, end: 60, page: 1 },
  { blockId: 'b0', start: 60, end: 100, page: 2 },
  { blockId: 'b1', start: 0, end: 20, page: 2 },
];

describe('buildPageMap', () => {
  it('records page start and end locators', () => {
    const pages = buildPageMap('book', chapter, fragments, 3);
    expect(pages.map((page) => page.startLocator)).toEqual([
      { bookId: 'book', chapterIndex: 2, blockIndex: 0, offset: 0 },
      { bookId: 'book', chapterIndex: 2, blockIndex: 0, offset: 20 },
      { bookId: 'book', chapterIndex: 2, blockIndex: 0, offset: 60 },
    ]);
    expect(pages.map((page) => page.endLocator)).toEqual([
      { bookId: 'book', chapterIndex: 2, blockIndex: 0, offset: 20 },
      { bookId: 'book', chapterIndex: 2, blockIndex: 0, offset: 60 },
      { bookId: 'book', chapterIndex: 2, blockIndex: 1, offset: 20 },
    ]);
  });

  it('splits a sentence across pages', () => {
    const pages = buildPageMap('book', chapter, fragments, 3);
    const s0 = pages.map((page) => page.segments.filter((segment) => segment.id === 's0'));
    expect(s0.map((segments) => segments.map((segment) => [segment.start, segment.end]))).toEqual([
      [[0, 20]],
      [[20, 60]],
      [[60, 80]],
    ]);
    expect(s0.flat().every((segment) => segment.kind === 'sentence')).toBe(true);
  });

  it('splits chunks and keeps them on the right page', () => {
    const pages = buildPageMap('book', chapter, fragments, 3);
    const chunks = pages.map((page) => page.segments.filter((segment) => segment.kind === 'chunk'));
    expect(chunks[0]?.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 10],
      [10, 20],
    ]);
    expect(chunks[1]?.map((segment) => [segment.start, segment.end])).toEqual([[20, 60]]);
    expect(chunks[2]?.map((segment) => [segment.start, segment.end])).toEqual([[60, 80]]);
  });

  it('keeps segments ordered by block and offset', () => {
    const pages = buildPageMap('book', chapter, fragments, 3);
    const last = pages[2]?.segments ?? [];
    expect(last.map((segment) => [segment.blockId, segment.start, segment.kind])).toEqual([
      ['b0', 60, 'chunk'],
      ['b0', 60, 'sentence'],
      ['b0', 80, 'sentence'],
      ['b1', 0, 'sentence'],
    ]);
  });
});
