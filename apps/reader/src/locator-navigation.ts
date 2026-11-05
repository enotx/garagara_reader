import type { Locator } from '@garagara/core';

/**
 * Returns the chapter index that contains the locator. A locator pointing at a
 * chapter that no longer exists yields undefined so callers can fall back.
 */
export function chapterIndexForLocator(
  chapters: readonly { index: number }[],
  locator: Locator | undefined,
): number | undefined {
  if (!locator) {
    return undefined;
  }
  return chapters.find((chapter) => chapter.index === locator.chapterIndex)?.index;
}
