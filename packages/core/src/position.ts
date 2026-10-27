import type { Block, Locator } from './types.js';

export interface TextBook {
  chapters: Array<{ blocks: Array<Pick<Block, 'text'>> }>;
}

function totalChars(book: TextBook): number {
  let total = 0;
  for (const chapter of book.chapters) {
    for (const block of chapter.blocks) {
      total += block.text.length;
    }
  }
  return total;
}

/** Returns the number of characters before the locator in the whole book. */
export function locatorToGlobalOffset(book: TextBook, locator: Locator): number {
  let offset = 0;
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    if (!chapter) {
      continue;
    }
    for (let blockIndex = 0; blockIndex < chapter.blocks.length; blockIndex += 1) {
      const block = chapter.blocks[blockIndex];
      if (!block) {
        continue;
      }
      if (chapterIndex < locator.chapterIndex) {
        offset += block.text.length;
      } else if (chapterIndex === locator.chapterIndex) {
        if (blockIndex < locator.blockIndex) {
          offset += block.text.length;
        } else if (blockIndex === locator.blockIndex) {
          return offset + Math.max(0, Math.min(block.text.length, locator.offset));
        }
      }
    }
  }
  return Math.max(0, Math.min(totalChars(book), offset));
}

/**
 * Converts a whole-book character offset back into a Locator. Offsets on a
 * block boundary resolve to the start of the next non-empty block; the end of
 * the book resolves to the last block.
 */
export function globalOffsetToLocator(bookId: string, book: TextBook, target: number): Locator {
  const total = totalChars(book);
  const offset = Math.max(0, Math.min(total, Math.trunc(target)));
  let remaining = offset;
  let last: Locator = { bookId, chapterIndex: 0, blockIndex: 0, offset: 0 };

  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    if (!chapter) {
      continue;
    }
    for (let blockIndex = 0; blockIndex < chapter.blocks.length; blockIndex += 1) {
      const block = chapter.blocks[blockIndex];
      if (!block) {
        continue;
      }
      last = { bookId, chapterIndex, blockIndex, offset: block.text.length };
      if (remaining < block.text.length) {
        return { bookId, chapterIndex, blockIndex, offset: remaining };
      }
      remaining -= block.text.length;
    }
  }

  return last;
}

/** Clamps chapter/block indices and the in-block offset to the book's bounds. */
export function clampLocator(book: TextBook, locator: Locator): Locator {
  const lastChapterIndex = Math.max(0, book.chapters.length - 1);
  const chapterIndex = Math.max(0, Math.min(lastChapterIndex, locator.chapterIndex));
  const chapter = book.chapters[chapterIndex];
  const lastBlockIndex = Math.max(0, (chapter?.blocks.length ?? 1) - 1);
  const blockIndex = Math.max(0, Math.min(lastBlockIndex, locator.blockIndex));
  const length = chapter?.blocks[blockIndex]?.text.length ?? 0;
  const offset = Math.max(0, Math.min(length, locator.offset));
  return { bookId: locator.bookId, chapterIndex, blockIndex, offset };
}
