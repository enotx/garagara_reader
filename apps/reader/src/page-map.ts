import type { Block, Chunk, Locator, Sentence } from '@garagara/core';

export interface PageFragment {
  blockId: string;
  start: number;
  end: number;
  page: number;
}

export interface FocusSegment {
  kind: 'sentence' | 'chunk';
  id: string;
  blockId: string;
  /** Inclusive offset in the block text. */
  start: number;
  /** Exclusive offset in the block text. */
  end: number;
}

export interface PageInfo {
  index: number;
  startLocator: Locator;
  endLocator: Locator;
  segments: FocusSegment[];
}

export interface PageMapChapter {
  index: number;
  blocks: Array<Pick<Block, 'id' | 'index'>>;
  sentences: Sentence[];
  chunks: Chunk[];
}

interface Interval {
  blockId: string;
  start: number;
  end: number;
}

function locator(
  bookId: string,
  chapterIndex: number,
  blockIndex: number,
  offset: number,
): Locator {
  return { bookId, chapterIndex, blockIndex, offset };
}

function sortFragments(
  fragments: readonly PageFragment[],
  blockIndexes: ReadonlyMap<string, number>,
): PageFragment[] {
  return [...fragments].sort(
    (a, b) =>
      (blockIndexes.get(a.blockId) ?? 0) - (blockIndexes.get(b.blockId) ?? 0) || a.start - b.start,
  );
}

function intervalsForPage(
  fragments: readonly PageFragment[],
  blockIndexes: ReadonlyMap<string, number>,
): Map<string, Interval[]> {
  const byBlock = new Map<string, Interval[]>();
  for (const fragment of sortFragments(fragments, blockIndexes)) {
    const list = byBlock.get(fragment.blockId) ?? [];
    const last = list[list.length - 1];
    if (last && last.end >= fragment.start) {
      last.end = Math.max(last.end, fragment.end);
    } else {
      list.push({ blockId: fragment.blockId, start: fragment.start, end: fragment.end });
    }
    byBlock.set(fragment.blockId, list);
  }
  return byBlock;
}

function intersect(
  interval: Interval,
  start: number,
  end: number,
): { start: number; end: number } | undefined {
  const from = Math.max(interval.start, start);
  const to = Math.min(interval.end, end);
  return to > from ? { start: from, end: to } : undefined;
}

/**
 * Builds the page map from DOM-derived fragments. A sentence or chunk that
 * crosses a page boundary produces one focus segment per page.
 */
export function buildPageMap(
  bookId: string,
  chapter: PageMapChapter,
  fragments: readonly PageFragment[],
  pageCount: number,
): PageInfo[] {
  const blockIndexes = new Map(chapter.blocks.map((block) => [block.id, block.index]));
  const pages: PageInfo[] = [];
  let previousEnd = locator(bookId, chapter.index, 0, 0);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageFragments = sortFragments(
      fragments.filter((fragment) => fragment.page === pageIndex),
      blockIndexes,
    );
    const first = pageFragments[0];
    const last = pageFragments[pageFragments.length - 1];
    const startLocator = first
      ? locator(bookId, chapter.index, blockIndexes.get(first.blockId) ?? 0, first.start)
      : previousEnd;
    const endLocator = last
      ? locator(bookId, chapter.index, blockIndexes.get(last.blockId) ?? 0, last.end)
      : startLocator;
    previousEnd = endLocator;

    const intervals = intervalsForPage(pageFragments, blockIndexes);
    const segments: FocusSegment[] = [];

    for (const sentence of chapter.sentences) {
      for (const interval of intervals.get(sentence.blockId) ?? []) {
        const overlap = intersect(interval, sentence.start, sentence.end);
        if (overlap) {
          segments.push({
            kind: 'sentence',
            id: sentence.id,
            blockId: sentence.blockId,
            start: overlap.start,
            end: overlap.end,
          });
        }
      }
    }

    const sentenceById = new Map(chapter.sentences.map((sentence) => [sentence.id, sentence]));
    for (const chunk of chapter.chunks) {
      const sentence = sentenceById.get(chunk.sentenceId);
      if (!sentence) {
        continue;
      }
      for (const interval of intervals.get(sentence.blockId) ?? []) {
        const overlap = intersect(interval, chunk.start, chunk.end);
        if (overlap) {
          segments.push({
            kind: 'chunk',
            id: `${chunk.sentenceId}:k${chunk.index}`,
            blockId: sentence.blockId,
            start: overlap.start,
            end: overlap.end,
          });
        }
      }
    }

    segments.sort(
      (a, b) =>
        (blockIndexes.get(a.blockId) ?? 0) - (blockIndexes.get(b.blockId) ?? 0) ||
        a.start - b.start ||
        a.kind.localeCompare(b.kind),
    );

    pages.push({ index: pageIndex, startLocator, endLocator, segments });
  }

  if (pages.length === 0) {
    return [
      {
        index: 0,
        startLocator: locator(bookId, chapter.index, 0, 0),
        endLocator: locator(bookId, chapter.index, 0, 0),
        segments: [],
      },
    ];
  }
  return pages;
}
