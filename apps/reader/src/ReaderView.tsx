import type { Locator, Note } from '@garagara/core';
import type { BookSummary, ChapterSummary, StoredChapter } from '@garagara/storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ChapterView } from './ChapterView.js';
import {
  findFocusIndex,
  firstSegmentOnPage,
  focusPositions,
  initialFocusPosition,
  positionForSentence,
  sentenceIdForSegment,
  stepFocus,
  toFocusTarget,
  type FocusTarget,
  type FocusUnit,
} from './focus.js';
import { FocusSubtitle } from './FocusSubtitle.js';
import { createGestureState, reduceGesture, type GestureEvent } from './gestures.js';
import { outlineRects, rangeForBlockOffsets, type OutlineRect } from './highlight.js';
import { IconChevronLeft, IconChevronRight, IconPlay, IconX } from './icons';
import { buildPageMap, pageIndexForLocator, type PageInfo } from './page-map.js';
import { hitTestPoint, type HitTestResult } from './hit-test.js';
import { collectPageFragments } from './page-map-dom.js';
import type { LlmRuntime } from './llm.js';
import { THEMES, type Theme } from './theme.js';
import { TranslationPopover } from './TranslationPopover.js';
import { WordCard } from './WordCard.js';

const COLUMN_GAP = 40;
const FONT_SCALE_KEY = 'garagara.reader.fontScale';
const FOCUS_UNIT_KEY = 'garagara.reader.focusUnit';
const MIN_FONT_SCALE = 70;
const MAX_FONT_SCALE = 180;

interface Anchor {
  blockId: string;
  start: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function initialFocusUnit(): FocusUnit {
  try {
    return localStorage.getItem(FOCUS_UNIT_KEY) === 'chunk' ? 'chunk' : 'sentence';
  } catch {
    return 'sentence';
  }
}

function initialFontScale(): number {
  try {
    const value = Number(localStorage.getItem(FONT_SCALE_KEY));
    if (Number.isFinite(value) && value >= MIN_FONT_SCALE && value <= MAX_FONT_SCALE) {
      return value;
    }
  } catch {
    // Storage can be disabled; fall through to the default.
  }
  return 100;
}

export function ReaderView({
  book,
  chapters,
  chapter,
  chapterSizes,
  notes,
  theme,
  llm,
  initialLocator,
  onThemeChange,
  onChapterChange,
  onExit,
  onOpenSettings,
}: {
  book: BookSummary;
  chapters: ChapterSummary[];
  chapter: StoredChapter;
  chapterSizes: number[];
  notes: Note[];
  theme: Theme;
  llm?: LlmRuntime;
  initialLocator?: Locator;
  onThemeChange: (theme: Theme) => void;
  onChapterChange: (chapterIndex: number) => void;
  onExit: () => void;
  onOpenSettings: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [hit, setHit] = useState<HitTestResult | null>(null);
  const pendingAnchor = useRef<Anchor | null>(null);
  const initialLocatorApplied = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [fontScale, setFontScale] = useState(initialFontScale);
  const [fontsReady, setFontsReady] = useState(false);
  const [pageMap, setPageMap] = useState<PageInfo[]>([]);
  const [gesture, setGesture] = useState(createGestureState);
  const [card, setCard] = useState<{ hit: HitTestResult; placement: 'top' | 'bottom' } | null>(
    null,
  );
  const [note, setNote] = useState<Note | null>(null);
  const [translation, setTranslation] = useState<{
    text: string;
    placement: 'top' | 'bottom';
  } | null>(null);
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [focusUnit, setFocusUnit] = useState<FocusUnit>(initialFocusUnit);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [subtitlePlacement, setSubtitlePlacement] = useState<'top' | 'bottom'>('bottom');
  const [focusOutlines, setFocusOutlines] = useState<OutlineRect[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const pageRef = useRef(page);
  pageRef.current = page;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const chapterChars = useMemo(
    () => chapter.blocks.reduce((sum, block) => sum + block.text.length, 0),
    [chapter.blocks],
  );
  const maxColumns = useMemo(() => Math.max(3, Math.ceil(chapterChars / 180) + 4), [chapterChars]);
  const stride = size.width + COLUMN_GAP;
  const currentIndex = chapters.findIndex((item) => item.index === chapter.index);
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : undefined;
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : undefined;

  const totalChars = chapterSizes.reduce((sum, value) => sum + value, 0);
  const charsBefore = chapterSizes.slice(0, chapter.index).reduce((sum, value) => sum + value, 0);
  const pageFraction = pageCount <= 1 ? 1 : (page + 1) / pageCount;
  const overallPercent =
    totalChars > 0
      ? Math.round(((charsBefore + chapterChars * pageFraction) / totalChars) * 100)
      : 0;
  const splitSentenceIds = useMemo(() => {
    const pagesBySentence = new Map<string, Set<number>>();
    for (const page of pageMap) {
      for (const segment of page.segments) {
        if (segment.kind !== 'sentence') {
          continue;
        }
        const pages = pagesBySentence.get(segment.id) ?? new Set<number>();
        pages.add(page.index);
        pagesBySentence.set(segment.id, pages);
      }
    }
    return [...pagesBySentence.entries()].filter(([, pages]) => pages.size > 1).map(([id]) => id);
  }, [pageMap]);

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

  function captureVisibleAnchor(): Anchor | null {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) {
      return null;
    }
    const viewportRect = viewport.getBoundingClientRect();
    let found: Anchor | null = null;
    let foundTop = Number.POSITIVE_INFINITY;
    let foundLeft = Number.POSITIVE_INFINITY;
    for (const element of content.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
      if (!element.textContent?.trim()) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.right <= viewportRect.left + 0.5 || rect.left >= viewportRect.right - 0.5) {
        continue;
      }
      if (rect.bottom <= viewportRect.top + 0.5 || rect.top >= viewportRect.bottom - 0.5) {
        continue;
      }
      const better =
        found === null ||
        rect.top < foundTop - 0.5 ||
        (Math.abs(rect.top - foundTop) <= 0.5 && rect.left < foundLeft);
      if (better) {
        found = {
          blockId: element.dataset.block ?? '',
          start: Number(element.dataset.start ?? 0),
        };
        foundTop = rect.top;
        foundLeft = rect.left;
      }
    }
    return found;
  }

  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) {
        setFontsReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = (): void => {
      const rect = viewport.getBoundingClientRect();
      const next = {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      };
      const previous = sizeRef.current;
      if (
        previous.width > 0 &&
        (previous.width !== next.width || previous.height !== next.height)
      ) {
        pendingAnchor.current = pendingAnchor.current ?? captureVisibleAnchor();
      }
      setSize(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!fontsReady || size.width === 0 || size.height === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) {
        return;
      }
      const contentLeft = content.getBoundingClientRect().left;
      let maxRight = contentLeft;
      for (const element of content.querySelectorAll<HTMLElement>('[data-block-id]')) {
        maxRight = Math.max(maxRight, element.getBoundingClientRect().right);
      }
      const pages = Math.max(1, Math.ceil((maxRight - contentLeft) / (size.width + COLUMN_GAP)));
      const anchor = pendingAnchor.current;
      let target = clamp(pageRef.current, 0, pages - 1);
      if (anchor) {
        const element = [...content.querySelectorAll<HTMLElement>('[data-block][data-start]')].find(
          (item) =>
            item.dataset.block === anchor.blockId &&
            Number(item.dataset.start ?? -1) === anchor.start,
        );
        if (element) {
          target = clamp(
            Math.floor(
              (element.getBoundingClientRect().left - contentLeft + 1) / (size.width + COLUMN_GAP),
            ),
            0,
            pages - 1,
          );
        }
        pendingAnchor.current = null;
      }
      const nextPageMap = buildPageMap(
        book.id,
        chapter,
        collectPageFragments(content, size.width + COLUMN_GAP),
        pages,
      );
      setPageMap(nextPageMap);
      setPageCount(pages);
      if (
        initialLocator &&
        !initialLocatorApplied.current &&
        initialLocator.chapterIndex === chapter.index
      ) {
        target = pageIndexForLocator(nextPageMap, initialLocator);
        initialLocatorApplied.current = true;
      }
      setPage(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter, size.width, size.height, fontScale, fontsReady]);

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
    if (!focusEnabled || !focusTarget) {
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
  }, [focusEnabled, focusTarget, focusOrder]);

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
  ]);

  function setFocusMode(enabled: boolean): void {
    setFocusEnabled(enabled);
    if (!enabled) {
      setFocusTarget(null);
    }
    setGesture(createGestureState());
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

  function adjustFont(delta: number): void {
    pendingAnchor.current = captureVisibleAnchor() ?? pendingAnchor.current;
    setFontScale((value) => {
      const next = clamp(value + delta, MIN_FONT_SCALE, MAX_FONT_SCALE);
      try {
        localStorage.setItem(FONT_SCALE_KEY, String(next));
      } catch {
        // Ignore storage failures; the in-memory setting still applies.
      }
      return next;
    });
  }

  function previousPage(): void {
    if (page > 0) {
      const targetPage = page - 1;
      setPage(targetPage);
      if (focusEnabled) {
        focusPage(targetPage);
      }
      return;
    }
    if (previousChapter) {
      onChapterChange(previousChapter.index);
    }
  }

  function nextPage(): void {
    if (page < pageCount - 1) {
      const targetPage = page + 1;
      setPage(targetPage);
      if (focusEnabled) {
        focusPage(targetPage);
      }
      return;
    }
    if (nextChapter) {
      onChapterChange(nextChapter.index);
    }
  }

  function clearLongPress(): void {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function beginLongPress(x: number, y: number): void {
    clearLongPress();
    if (card || note || translation) {
      return;
    }
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      const result = hitTestPoint(x, y, chapter);
      if (!result?.sentenceId) {
        return;
      }
      if (focusEnabled) {
        longPressFired.current = true;
        moveFocusToSentence(result.sentenceId);
        setGesture(createGestureState());
        return;
      }
      const sentence = chapter.sentences.find((item) => item.id === result.sentenceId);
      if (!sentence) {
        return;
      }
      const block = chapter.blocks.find((item) => item.id === sentence.blockId);
      if (!block) {
        return;
      }
      const bounds = viewportRef.current?.getBoundingClientRect();
      const placement = bounds && y < bounds.top + bounds.height / 2 ? 'bottom' : 'top';
      longPressFired.current = true;
      setTranslation({
        text: block.text.slice(sentence.start, sentence.end),
        placement,
      });
      setCard(null);
      setHit(null);
      setNote(null);
      setGesture(createGestureState());
    }, 500);
  }

  function applyGesture(event: GestureEvent): void {
    const result = reduceGesture(gesture, event, { focus: focusEnabled });
    setGesture(result.state);
    for (const command of result.commands) {
      if (command.type === 'turnPage') {
        if (command.direction === 'next') {
          nextPage();
        } else {
          previousPage();
        }
      } else if (command.type === 'closeCard') {
        setCard(null);
        setHit(null);
      } else if (command.type === 'advanceFocus') {
        moveFocus('next');
      } else if (command.type === 'focusSentence') {
        moveFocusToSentence(command.sentenceId);
      }
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        previousPage();
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        nextPage();
      } else if (event.key === ' ') {
        event.preventDefault();
        if (focusEnabled) {
          moveFocus('next');
        } else {
          nextPage();
        }
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        setFocusMode(!focusEnabled);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights) {
      return;
    }
    CSS.highlights.delete('word-selected');
    const content = contentRef.current;
    if (!hit || !content) {
      return;
    }
    const blockRoot = content.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(hit.block.id)}"]`,
    );
    if (!blockRoot) {
      return;
    }
    for (const element of blockRoot.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
      const spanStart = Number(element.dataset.start ?? -1);
      const spanEnd = Number(element.dataset.end ?? -1);
      if (hit.token.start < spanStart || hit.token.end > spanEnd) {
        continue;
      }
      const node = element.firstChild;
      if (!(node instanceof Text)) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, hit.token.start - spanStart);
      range.setEnd(node, hit.token.end - spanStart);
      CSS.highlights.set('word-selected', new Highlight(range));
      break;
    }
    return () => {
      CSS.highlights.delete('word-selected');
    };
  }, [hit]);

  return (
    <div
      className="reader"
      data-menu-open={gesture.menuOpen ? 'true' : 'false'}
      data-focus={focusEnabled ? 'true' : 'false'}
      data-focus-unit={focusUnit}
      data-focus-id={focusTarget?.id}
      data-focus-next-count={nextSentenceTexts.length}
      data-page={page}
      data-page-count={pageCount}
    >
      <header
        className="reader-header"
        onClick={() => {
          if (translation || card || note) {
            setTranslation(null);
            setCard(null);
            setHit(null);
            setNote(null);
            setGesture(createGestureState());
            return;
          }
          applyGesture({ type: 'tap', target: 'chrome' });
        }}
      >
        <button
          type="button"
          className="reader-button reader-back"
          aria-label="返回书架"
          onClick={(event) => {
            event.stopPropagation();
            onExit();
          }}
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="reader-heading">
          <strong>{book.title}</strong>
          <span>{chapter.title}</span>
        </div>
        <span className="reader-percent" aria-hidden="true">
          {overallPercent}%
        </span>
      </header>

      {gesture.menuOpen ? (
        <div className="reader-menu reader-menu-top" data-menu="top">
          <div className="menu-top-row">
            <button
              type="button"
              className="reader-button"
              aria-label="关闭菜单"
              onClick={() => applyGesture({ type: 'tap', target: 'chrome' })}
            >
              <IconX size={18} />
            </button>
            <div className="menu-title">
              <span>阅读设置</span>
              <strong>{chapter.title}</strong>
            </div>
          </div>
          <div className="menu-settings-row">
            <label className="menu-field">
              <span className="menu-field-label">主题</span>
              <select
                className="theme-select"
                value={theme}
                aria-label="主题"
                onChange={(event) => onThemeChange(event.target.value as Theme)}
              >
                {THEMES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="menu-field">
              <span className="menu-field-label">章节</span>
              <select
                className="chapter-select"
                value={chapter.index}
                aria-label="选择章节"
                onChange={(event) => onChapterChange(Number(event.target.value))}
              >
                {chapters.map((item) => (
                  <option key={item.id} value={item.index}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="reader-viewport"
        data-page-start={JSON.stringify(pageMap[page]?.startLocator)}
        data-page-end={JSON.stringify(pageMap[page]?.endLocator)}
        data-split-sentences={splitSentenceIds.join(',')}
        data-hit-token={hit?.token.surface}
        data-hit-block={hit?.block.id}
        data-hit-offset={hit?.blockOffset}
        data-hit-start={hit?.token.start}
        data-hit-end={hit?.token.end}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
          longPressFired.current = false;
          beginLongPress(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          const start = pointerStart.current;
          if (!start) {
            return;
          }
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
            clearLongPress();
          }
        }}
        onPointerUp={(event) => {
          clearLongPress();
          if (longPressFired.current) {
            longPressFired.current = false;
            pointerStart.current = null;
            return;
          }
          const start = pointerStart.current;
          pointerStart.current = null;
          if (start === null) {
            return;
          }
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (translation || card || note) {
              setTranslation(null);
              setCard(null);
              setHit(null);
              setNote(null);
              setGesture(createGestureState());
              return;
            }
            applyGesture({
              type: 'swipe',
              direction: deltaX < 0 ? 'left' : 'right',
            });
            return;
          }
          if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            if (translation) {
              setTranslation(null);
              return;
            }
            const noteElement = (
              document.elementFromPoint(event.clientX, event.clientY) as Element | null
            )?.closest<HTMLElement>('[data-note-id]');
            const noteId = noteElement?.dataset.noteId;
            if (noteId) {
              const found = notes.find((item) => item.id === noteId);
              if (found) {
                setNote(found);
                setCard(null);
                setHit(null);
                setGesture(createGestureState());
                return;
              }
            }
            const result = hitTestPoint(event.clientX, event.clientY, chapter) ?? null;
            if (result) {
              const currentSentenceId = focusTarget ? sentenceIdForSegment(focusTarget) : undefined;
              const sameSentence =
                !focusEnabled ||
                currentSentenceId === undefined ||
                result.sentenceId === currentSentenceId;
              setHit(sameSentence ? result : null);
              setNote(null);
              applyGesture({
                type: 'tap',
                target: 'word',
                word: result.token.surface,
                sentenceId: result.sentenceId ?? '',
                sameSentence,
              });
              if (!sameSentence) {
                setCard(null);
                return;
              }
              const viewport = viewportRef.current;
              const bounds = viewport?.getBoundingClientRect();
              const placement =
                bounds && event.clientY < bounds.top + bounds.height / 2 ? 'bottom' : 'top';
              setCard({ hit: result, placement });
            } else {
              setHit(null);
              if (note) {
                setNote(null);
                return;
              }
              setCard(null);
              applyGesture({ type: 'tap', target: 'blank' });
            }
          }
        }}
        onPointerCancel={() => {
          clearLongPress();
          longPressFired.current = false;
          pointerStart.current = null;
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={contentRef}
          className="paged-content"
          style={{
            columnCount: maxColumns,
            columnGap: `${COLUMN_GAP}px`,
            width: `${maxColumns * size.width + (maxColumns - 1) * COLUMN_GAP}px`,
            height: `${size.height}px`,
            fontSize: `${((1.05 * fontScale) / 100).toFixed(3)}rem`,
            transform: `translateX(${-page * stride}px)`,
          }}
        >
          <ChapterView chapter={chapter} />
        </div>
        {focusEnabled && focusOutlines.length > 0 ? (
          <div className="focus-outline-layer" aria-hidden="true">
            {focusOutlines.map((rect, index) => (
              <span
                key={index}
                className="focus-outline"
                style={{
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {card ? (
        <WordCard
          hit={card.hit}
          {...(() => {
            const sentence = chapter.sentences.find((item) => item.id === card.hit.sentenceId);
            return sentence ? { sentence } : {};
          })()}
          placement={card.placement}
          {...(llm ? { llm } : {})}
          {...(llm ? { adapter: llm.adapter } : {})}
          bookId={book.id}
          onOpenSettings={onOpenSettings}
          onClose={() => {
            setCard(null);
            setHit(null);
            setGesture(createGestureState());
          }}
        />
      ) : null}

      {translation ? (
        <TranslationPopover
          sentence={translation.text}
          placement={translation.placement}
          {...(llm ? { llm } : {})}
          onOpenSettings={onOpenSettings}
          onClose={() => setTranslation(null)}
        />
      ) : null}

      {focusEnabled && subtitlesOn && focusSentenceText ? (
        <FocusSubtitle
          sentence={focusSentenceText}
          nextSentences={nextSentenceTexts}
          placement={subtitlePlacement}
          {...(llm ? { llm } : {})}
        />
      ) : null}

      {note ? (
        <aside className="note-popup" data-note-popup>
          <header className="note-header">
            <h3>脚注</h3>
            <button
              type="button"
              className="reader-button"
              aria-label="关闭脚注"
              onClick={() => setNote(null)}
            >
              <IconX size={18} />
            </button>
          </header>
          <p>{note.text}</p>
        </aside>
      ) : null}

      <footer
        className={`reader-footer${focusEnabled ? ' focus' : ''}`}
        onClick={() => {
          if (translation || card || note) {
            setTranslation(null);
            setCard(null);
            setHit(null);
            setNote(null);
            setGesture(createGestureState());
            return;
          }
          applyGesture({ type: 'tap', target: 'chrome' });
        }}
      >
        {focusEnabled ? (
          <>
            <button
              type="button"
              className="reader-button"
              aria-label="上一片段"
              onClick={(event) => {
                event.stopPropagation();
                moveFocus('prev');
              }}
              disabled={focusIndex <= 0}
            >
              <IconChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={`focus-subtitle-toggle${subtitlesOn ? ' is-active' : ''}`}
              aria-label="字幕"
              aria-pressed={subtitlesOn}
              onClick={(event) => {
                event.stopPropagation();
                setSubtitlesOn((value) => !value);
              }}
            >
              译
            </button>
            <button
              type="button"
              className="reader-button"
              aria-label="下一片段"
              onClick={(event) => {
                event.stopPropagation();
                moveFocus('next');
              }}
              disabled={focusIndex < 0 || focusIndex >= focusOrder.length - 1}
            >
              <IconChevronRight size={20} />
            </button>
            <button type="button" className="reader-button" aria-label="播放（v0.2）" disabled>
              <IconPlay size={18} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="reader-button"
              aria-label="上一页"
              onClick={(event) => {
                event.stopPropagation();
                previousPage();
              }}
              disabled={page === 0 && !previousChapter}
            >
              <IconChevronLeft size={20} />
            </button>
            <div className="reader-progress" aria-live="polite">
              <span className="progress-chapter">
                第 {chapter.index + 1} / {chapters.length} 章
              </span>
              <span className="progress-separator" aria-hidden="true">
                ·
              </span>
              <span className="progress-meta">
                {page + 1} / {pageCount} 页 · {overallPercent}%
              </span>
            </div>
            <button
              type="button"
              className="reader-button"
              aria-label="下一页"
              onClick={(event) => {
                event.stopPropagation();
                nextPage();
              }}
              disabled={page >= pageCount - 1 && !nextChapter}
            >
              <IconChevronRight size={20} />
            </button>
          </>
        )}
      </footer>

      {gesture.menuOpen ? (
        <div className="reader-menu reader-menu-bottom" data-menu="bottom">
          <div className="font-controls">
            <button
              type="button"
              className="reader-button"
              aria-label="减小字号"
              onClick={() => adjustFont(-10)}
            >
              A−
            </button>
            <span className="font-scale-value">{fontScale}%</span>
            <button
              type="button"
              className="reader-button"
              aria-label="增大字号"
              onClick={() => adjustFont(10)}
            >
              A+
            </button>
          </div>
          <button
            type="button"
            className={`reader-button focus-toggle${focusEnabled ? ' solid' : ''}`}
            aria-pressed={focusEnabled}
            onClick={() => setFocusMode(!focusEnabled)}
          >
            Focus
          </button>
          <label className="menu-field focus-unit-field">
            <span className="menu-field-label">推进单位</span>
            <select
              className="theme-select"
              aria-label="Focus 推进单位"
              value={focusUnit}
              onChange={(event) => changeFocusUnit(event.target.value as FocusUnit)}
            >
              <option value="sentence">句子</option>
              <option value="chunk">意群</option>
            </select>
          </label>
          <span className="menu-note">正文分页只在排版变化时重算</span>
        </div>
      ) : null}
    </div>
  );
}
