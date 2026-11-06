import type { StoredChapter } from '@garagara/storage';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import type { Theme } from '../../../shared/theme/theme.js';
import {
  findFocusIndex,
  firstSegmentOnPage,
  focusPositions,
  initialFocusPosition,
  positionForSentence,
  sameFocus,
  sentenceIdForSegment,
  stepFocus,
  toFocusTarget,
  type FocusTarget,
  type FocusUnit,
} from '../focus/focus.js';
import { outlineRects, rangeForBlockOffsets, type OutlineRect } from '../focus/highlight.js';
import type { PageInfo } from '../paging/page-map.js';
import type { ReaderPlayback } from '../types.js';

const FOCUS_UNIT_KEY = 'garagara.reader.focusUnit';

function initialFocusUnit(): FocusUnit {
  try {
    return localStorage.getItem(FOCUS_UNIT_KEY) === 'chunk' ? 'chunk' : 'sentence';
  } catch {
    return 'sentence';
  }
}

export function useReaderFocus({
  chapter,
  pageMap,
  page,
  theme,
  fontScale,
  size,
  playback,
  contentRef,
  viewportRef,
  setPage,
  resetGesture,
}: {
  chapter: StoredChapter;
  pageMap: PageInfo[];
  page: number;
  theme: Theme;
  fontScale: number;
  size: { width: number; height: number };
  playback: ReaderPlayback | undefined;
  contentRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  setPage: Dispatch<SetStateAction<number>>;
  resetGesture: () => void;
}) {
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [focusUnit, setFocusUnit] = useState<FocusUnit>(initialFocusUnit);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [subtitlePlacement, setSubtitlePlacement] = useState<'top' | 'bottom'>('bottom');
  const [focusOutlines, setFocusOutlines] = useState<OutlineRect[]>([]);
  const pageRef = useRef(page);
  pageRef.current = page;

  const focusOrder = useMemo(() => focusPositions(pageMap, focusUnit), [pageMap, focusUnit]);
  const focusIndex = useMemo(
    () => findFocusIndex(focusOrder, focusTarget),
    [focusOrder, focusTarget],
  );
  const focusSentence = useMemo(() => {
    if (!focusTarget) {
      return undefined;
    }
    const sentenceId = sentenceIdForSegment(focusTarget);
    return chapter.sentences.find((sentence) => sentence.id === sentenceId);
  }, [focusTarget, chapter.sentences]);
  const focusSentenceText = useMemo(() => {
    if (!focusSentence) {
      return '';
    }
    const block = chapter.blocks.find((item) => item.id === focusSentence.blockId);
    return block ? block.text.slice(focusSentence.start, focusSentence.end) : '';
  }, [focusSentence, chapter.blocks]);
  const nextSentenceTexts = useMemo(() => {
    if (!focusSentence) {
      return [];
    }
    const start = chapter.sentences.findIndex((sentence) => sentence.id === focusSentence.id);
    const texts: string[] = [];
    for (const sentence of chapter.sentences.slice(start + 1, start + 4)) {
      const block = chapter.blocks.find((item) => item.id === sentence.blockId);
      if (block) {
        texts.push(block.text.slice(sentence.start, sentence.end));
      }
    }
    return texts;
  }, [focusSentence, chapter.sentences, chapter.blocks]);

  useEffect(() => {
    if (!focusEnabled) {
      if (focusTarget) {
        setFocusTarget(null);
      }
      return;
    }
    if (focusOrder.length === 0) {
      if (focusTarget) {
        setFocusTarget(null);
      }
      return;
    }
    if (findFocusIndex(focusOrder, focusTarget) >= 0) {
      return;
    }
    const initial = initialFocusPosition(focusOrder, pageRef.current);
    setFocusTarget(initial ? toFocusTarget(initial.segment) : null);
  }, [focusEnabled, focusOrder, focusTarget]);

  useEffect(() => {
    if (!focusEnabled || !focusTarget || playback?.browsing) {
      return;
    }
    const index = findFocusIndex(focusOrder, focusTarget);
    if (index < 0) {
      return;
    }
    const targetPage = focusOrder[index]?.page;
    if (targetPage !== undefined && targetPage !== pageRef.current) {
      setPage(targetPage);
    }
  }, [focusEnabled, focusTarget, focusOrder, playback?.browsing]);

  useEffect(() => {
    if (!playback || playback.status === 'idle' || !playback.sentence || playback.browsing) {
      return;
    }
    if (playback.sentence.locator.chapterIndex !== chapter.index) {
      return;
    }
    if (!focusEnabled) {
      setFocusEnabled(true);
      resetGesture();
    }
    const position = positionForSentence(focusOrder, playback.sentence.id);
    if (!position) {
      return;
    }
    const target = toFocusTarget(position.segment);
    setFocusTarget((current) => (sameFocus(current, target) ? current : target));
  }, [
    playback?.status,
    playback?.sentence?.id,
    playback?.browsing,
    chapter.index,
    focusEnabled,
    focusOrder,
    resetGesture,
  ]);

  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights) {
      return;
    }
    CSS.highlights.delete('focus-dim');
    CSS.highlights.delete('focus-sentence');
    CSS.highlights.delete('focus-segment');
    setFocusOutlines([]);
    if (!focusEnabled || !focusTarget) {
      return;
    }
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content) {
      return;
    }
    const sentence = chapter.sentences.find(
      (item) => item.id === sentenceIdForSegment(focusTarget),
    );
    const sentenceRange = sentence
      ? rangeForBlockOffsets(content, sentence.blockId, sentence.start, sentence.end)
      : undefined;
    const segmentRange = rangeForBlockOffsets(
      content,
      focusTarget.blockId,
      focusTarget.start,
      focusTarget.end,
    );
    const dimRange = document.createRange();
    dimRange.selectNodeContents(content);
    CSS.highlights.set('focus-dim', new Highlight(dimRange));
    if (sentenceRange) {
      CSS.highlights.set('focus-sentence', new Highlight(sentenceRange));
    }
    if (segmentRange) {
      CSS.highlights.set('focus-segment', new Highlight(segmentRange));
    }

    let timer: number | undefined;
    const updateOutlines = (): void => {
      if (!segmentRange || !viewport) {
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      const rect = [...segmentRange.getClientRects()].find(
        (item) =>
          item.width > 0 && item.height > 0 && item.bottom > bounds.top && item.top < bounds.bottom,
      );
      if (rect) {
        setSubtitlePlacement(rect.top < bounds.top + bounds.height / 2 ? 'bottom' : 'top');
      }
      if (theme === 'eink') {
        setFocusOutlines(outlineRects(segmentRange, viewport));
        timer = window.setTimeout(() => {
          setFocusOutlines(outlineRects(segmentRange, viewport));
        }, 220);
      } else {
        setFocusOutlines([]);
      }
    };
    updateOutlines();

    return () => {
      CSS.highlights.delete('focus-dim');
      CSS.highlights.delete('focus-sentence');
      CSS.highlights.delete('focus-segment');
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [
    focusEnabled,
    focusTarget,
    chapter,
    theme,
    page,
    size.width,
    size.height,
    fontScale,
    pageMap,
    focusUnit,
    contentRef,
    viewportRef,
  ]);

  function setFocusMode(enabled: boolean): void {
    setFocusEnabled(enabled);
    if (!enabled) {
      setFocusTarget(null);
    }
    resetGesture();
  }

  function changeFocusUnit(unit: FocusUnit): void {
    setFocusUnit(unit);
    setFocusTarget(null);
    try {
      localStorage.setItem(FOCUS_UNIT_KEY, unit);
    } catch {
      // Ignore storage failures; the in-memory setting still applies.
    }
  }

  function moveFocus(direction: 'next' | 'prev'): void {
    const next = stepFocus(focusOrder, focusTarget, direction);
    if (next) {
      setFocusTarget(toFocusTarget(next.segment));
    }
  }

  function moveFocusToSentence(sentenceId: string): void {
    const position = positionForSentence(focusOrder, sentenceId);
    if (position) {
      setFocusTarget(toFocusTarget(position.segment));
    }
  }

  function focusPage(pageIndex: number): void {
    const first = firstSegmentOnPage(focusOrder, pageIndex);
    setFocusTarget(first ? toFocusTarget(first.segment) : null);
  }

  return {
    focusEnabled,
    focusUnit,
    focusTarget,
    focusOrder,
    focusIndex,
    focusSentenceText,
    nextSentenceTexts,
    subtitlePlacement,
    focusOutlines,
    setFocusMode,
    changeFocusUnit,
    moveFocus,
    moveFocusToSentence,
    focusPage,
  };
}
