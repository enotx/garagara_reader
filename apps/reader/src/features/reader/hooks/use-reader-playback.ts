import type { Locator } from '@garagara/core';
import type { BookSummary, StoredChapter } from '@garagara/storage';
import { useEffect } from 'react';

import type { FocusTarget } from '../focus/focus.js';
import type { PageInfo } from '../paging/page-map.js';
import type { ReaderPlayback } from '../types.js';

export function useReaderPlayback({
  book,
  chapter,
  pageMap,
  page,
  focusTarget,
  focusEnabled,
  setFocusMode,
  moveFocusToSentence,
  playback,
  setPage,
}: {
  book: BookSummary;
  chapter: StoredChapter;
  pageMap: PageInfo[];
  page: number;
  focusTarget: FocusTarget | null;
  focusEnabled: boolean;
  setFocusMode: (enabled: boolean) => void;
  moveFocusToSentence: (sentenceId: string) => void;
  playback: ReaderPlayback | undefined;
  setPage: (value: number | ((current: number) => number)) => void;
}) {
  useEffect(() => {
    const engine = playback?.engine;
    if (!engine) {
      return;
    }
    const onBoundary = (event: { sentenceId: string; start: number; end: number }): void => {
      if (playback?.browsing) {
        return;
      }
      const sentence = chapter.sentences.find((item) => item.id === event.sentenceId);
      if (!sentence) {
        return;
      }
      const offset = sentence.start + event.start;
      const targetPage = pageMap.find((item) =>
        item.segments.some(
          (segment) =>
            segment.kind === 'sentence' &&
            segment.id === event.sentenceId &&
            offset >= segment.start &&
            offset < segment.end,
        ),
      )?.index;
      if (targetPage !== undefined) {
        setPage((current) => (current === targetPage ? current : targetPage));
      }
    };
    engine.on('boundary', onBoundary);
    return () => engine.off('boundary', onBoundary);
  }, [playback?.engine, playback?.browsing, chapter.sentences, pageMap, setPage]);

  function locatorForFocus(): Locator | undefined {
    if (focusTarget) {
      const block = chapter.blocks.find((item) => item.id === focusTarget.blockId);
      if (block) {
        return {
          bookId: book.id,
          chapterIndex: chapter.index,
          blockIndex: block.index,
          offset: focusTarget.start,
        };
      }
    }
    return pageMap[page]?.startLocator;
  }

  function playFromSentence(sentenceId: string): void {
    const engine = playback?.engine;
    const sentence = chapter.sentences.find((item) => item.id === sentenceId);
    const block = sentence
      ? chapter.blocks.find((item) => item.id === sentence.blockId)
      : undefined;
    if (!engine || !sentence || !block) {
      moveFocusToSentence(sentenceId);
      return;
    }
    playback.onBrowsingChange(false);
    if (!focusEnabled) {
      setFocusMode(true);
    }
    void engine.play({
      bookId: book.id,
      chapterIndex: chapter.index,
      blockIndex: block.index,
      offset: sentence.start,
    });
  }

  function togglePlayback(): void {
    const engine = playback?.engine;
    if (!engine) {
      return;
    }
    if (playback.status === 'playing') {
      engine.pause();
      return;
    }
    if (playback.status === 'paused') {
      engine.resume();
      return;
    }
    const locator = locatorForFocus();
    if (!locator) {
      return;
    }
    playback.onBrowsingChange(false);
    if (!focusEnabled) {
      setFocusMode(true);
    }
    void engine.play(locator);
  }

  return { playFromSentence, togglePlayback };
}
