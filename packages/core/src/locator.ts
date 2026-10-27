import type { Block, Locator, Sentence } from './types.js';

export function createLocator(
  bookId: string,
  chapterIndex: number,
  blockIndex: number,
  offset: number,
): Locator {
  return { bookId, chapterIndex, blockIndex, offset };
}

/** Negative when a is before b, positive when a is after b. */
export function compareLocators(a: Locator, b: Locator): number {
  if (a.chapterIndex !== b.chapterIndex) {
    return a.chapterIndex - b.chapterIndex;
  }
  if (a.blockIndex !== b.blockIndex) {
    return a.blockIndex - b.blockIndex;
  }
  return a.offset - b.offset;
}

export function sentenceLocator(
  bookId: string,
  chapterIndex: number,
  blockIndex: number,
  sentence: Sentence,
): Locator {
  return createLocator(bookId, chapterIndex, blockIndex, sentence.start);
}

/**
 * Finds the sentence that contains the locator's offset. When the offset is at a
 * block boundary, the first sentence starting at that offset wins.
 */
export function locatorToSentence(
  sentences: readonly Sentence[],
  locator: Locator,
): Sentence | undefined {
  for (const sentence of sentences) {
    if (locator.offset >= sentence.start && locator.offset < sentence.end) {
      return sentence;
    }
  }
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const sentence = sentences[i];
    if (sentence && sentence.end <= locator.offset) {
      return sentence;
    }
  }
  return sentences[0];
}

export function locatorToSentenceIndex(sentences: readonly Sentence[], locator: Locator): number {
  const sentence = locatorToSentence(sentences, locator);
  return sentence ? sentences.indexOf(sentence) : -1;
}

export interface ChapterLike {
  blocks: Pick<Block, 'text'>[];
}

/**
 * Returns reading progress from 0 to 100 based on character counts, per Spec §5.
 */
export function progressPercent(
  chapters: readonly ChapterLike[],
  locator: Pick<Locator, 'chapterIndex' | 'blockIndex' | 'offset'>,
): number {
  let total = 0;
  let before = 0;
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    if (!chapter) {
      continue;
    }
    for (let blockIndex = 0; blockIndex < chapter.blocks.length; blockIndex += 1) {
      const block = chapter.blocks[blockIndex];
      if (!block) {
        continue;
      }
      const length = block.text.length;
      if (chapterIndex < locator.chapterIndex) {
        before += length;
      } else if (chapterIndex === locator.chapterIndex) {
        if (blockIndex < locator.blockIndex) {
          before += length;
        } else if (blockIndex === locator.blockIndex) {
          before += Math.max(0, Math.min(length, locator.offset));
        }
      }
      total += length;
    }
  }
  return total === 0 ? 0 : (before / total) * 100;
}
