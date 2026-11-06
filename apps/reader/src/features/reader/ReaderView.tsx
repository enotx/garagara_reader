import type { Locator, Note } from '@garagara/core';
import type { BookSummary, ChapterSummary, StoredChapter } from '@garagara/storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChapterView } from './components/ChapterView.js';
import { NotePopover } from './components/NotePopover.js';
import { ReaderBottomMenu } from './components/ReaderBottomMenu.js';
import { ReaderFooter } from './components/ReaderFooter.js';
import { ReaderHeader } from './components/ReaderHeader.js';
import { ReaderTopMenu } from './components/ReaderTopMenu.js';
import { useReaderFocus } from './hooks/use-reader-focus.js';
import { useReaderPagination } from './hooks/use-reader-pagination.js';
import { useReaderPlayback } from './hooks/use-reader-playback.js';
import { useReaderProgress } from './hooks/use-reader-progress.js';
import {
  EDGE_TURN_GUTTER,
  readEdgeTurnPreference,
  resolveEdgeTurn,
  writeEdgeTurnPreference,
} from './interaction/edge-turn.js';
import { isFocusBackPoint, sentenceIdForSegment } from './focus/focus.js';
import { FocusSubtitle } from './overlays/FocusSubtitle.js';
import { createGestureState, reduceGesture, type GestureEvent } from './interaction/gestures.js';
import { translator, type AppLanguage } from '../../shared/i18n/i18n.js';
import type { Theme } from '../../shared/theme/theme.js';
import { hitTestPoint, type HitTestResult } from './interaction/hit-test.js';
import type { LlmRuntime } from '../../shared/llm/llm.js';
import { TranslationPopover } from './overlays/TranslationPopover.js';
import { WordCard } from './overlays/WordCard.js';
import type { ReaderPlayback } from './types.js';

import { COLUMN_GAP } from './paging/columns.js';

export function ReaderView({
  book,
  chapters,
  chapter,
  chapterSizes,
  notes,
  theme,
  language,
  llm,
  initialLocator,
  playback,
  onThemeChange,
  onProgress,
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
  language: AppLanguage;
  llm?: LlmRuntime;
  initialLocator?: Locator;
  playback?: ReaderPlayback;
  onThemeChange: (theme: Theme) => void;
  onProgress?: (locator: Locator) => void;
  onChapterChange: (chapterIndex: number) => void;
  onExit: () => void;
  onOpenSettings: () => void;
}) {
  const t = translator(language);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [hit, setHit] = useState<HitTestResult | null>(null);
  const [edgeTurnPreference, setEdgeTurnPreference] = useState(readEdgeTurnPreference);
  const edgeTurn = resolveEdgeTurn(edgeTurnPreference, theme);
  const [gesture, setGesture] = useState(createGestureState);
  const [card, setCard] = useState<{ hit: HitTestResult; placement: 'top' | 'bottom' } | null>(
    null,
  );
  const [note, setNote] = useState<Note | null>(null);
  const [translation, setTranslation] = useState<{
    text: string;
    placement: 'top' | 'bottom';
  } | null>(null);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const resumeAfterCard = useRef(false);

  const {
    page,
    setPage,
    pageCount,
    pageMap,
    fontScale,
    size,
    chapterChars,
    maxColumns,
    stride,
    adjustFont,
  } = useReaderPagination({
    bookId: book.id,
    chapter,
    ...(initialLocator ? { initialLocator } : {}),
    contentRef,
    viewportRef,
  });

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

  const resetGesture = useCallback(() => setGesture(createGestureState()), []);
  const {
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
  } = useReaderFocus({
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
  });

  useReaderProgress(pageMap, page, onProgress);

  const { playFromSentence, togglePlayback } = useReaderPlayback({
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
  });

  function closeCard(): void {
    setCard(null);
    setHit(null);
    if (resumeAfterCard.current) {
      resumeAfterCard.current = false;
      playback?.engine.resume();
    }
  }

  function previousPage(): void {
    if (playback?.status === 'playing') {
      playback.onBrowsingChange(true);
    }
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
    if (playback?.status === 'playing') {
      playback.onBrowsingChange(true);
    }
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
      if (playback?.status === 'playing') {
        longPressFired.current = true;
        playFromSentence(result.sentenceId);
        setGesture(createGestureState());
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
    const result = reduceGesture(gesture, event, {
      focus: focusEnabled,
      playing: playback?.status === 'playing',
      edgeTurn,
    });
    setGesture(result.state);
    for (const command of result.commands) {
      if (command.type === 'turnPage') {
        if (command.direction === 'next') {
          nextPage();
        } else {
          previousPage();
        }
      } else if (command.type === 'closeCard') {
        closeCard();
      } else if (command.type === 'advanceFocus') {
        if (playback?.status === 'playing') {
          playback.engine.next();
        }
        moveFocus('next');
      } else if (command.type === 'focusSentence') {
        moveFocusToSentence(command.sentenceId);
      } else if (command.type === 'playSentence') {
        playFromSentence(command.sentenceId);
      } else if (command.type === 'pausePlayback') {
        if (playback?.status === 'playing') {
          resumeAfterCard.current = true;
          playback.engine.pause();
        }
      } else if (command.type === 'browsePlayback') {
        playback?.onBrowsingChange(true);
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
      data-focus-block={focusTarget?.blockId}
      data-focus-start={focusTarget?.start}
      data-focus-end={focusTarget?.end}
      data-focus-next-count={nextSentenceTexts.length}
      data-page={page}
      data-page-count={pageCount}
      data-playback-status={playback?.status ?? 'idle'}
      data-playback-sentence={playback?.sentence?.id}
      data-playback-browsing={playback?.browsing ? 'true' : 'false'}
    >
      <ReaderHeader
        bookTitle={book.title}
        chapterTitle={chapter.title}
        percent={overallPercent}
        t={t}
        onBack={onExit}
        onClick={() => {
          if (translation || card || note) {
            setTranslation(null);
            closeCard();
            setNote(null);
            setGesture(createGestureState());
            return;
          }
          applyGesture({ type: 'tap', target: 'chrome' });
        }}
      />

      {gesture.menuOpen ? (
        <ReaderTopMenu
          chapterTitle={chapter.title}
          chapterIndex={chapter.index}
          chapters={chapters}
          theme={theme}
          t={t}
          onClose={() => applyGesture({ type: 'tap', target: 'chrome' })}
          onThemeChange={onThemeChange}
          onChapterChange={onChapterChange}
        />
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
        data-edge-turn={edgeTurn ? 'true' : 'false'}
        style={{
          paddingLeft: edgeTurn ? EDGE_TURN_GUTTER : 0,
          paddingRight: edgeTurn ? EDGE_TURN_GUTTER : 0,
        }}
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
            if (
              focusEnabled &&
              playback?.status !== 'playing' &&
              !card &&
              !note &&
              viewportRef.current &&
              isFocusBackPoint(
                { x: event.clientX, y: event.clientY },
                viewportRef.current.getBoundingClientRect(),
              )
            ) {
              setHit(null);
              moveFocus('prev');
              setGesture(createGestureState());
              return;
            }
            if (edgeTurn) {
              const bounds = viewportRef.current?.getBoundingClientRect();
              if (bounds) {
                const side =
                  event.clientX <= bounds.left + EDGE_TURN_GUTTER
                    ? 'left'
                    : event.clientX >= bounds.right - EDGE_TURN_GUTTER
                      ? 'right'
                      : undefined;
                if (side) {
                  if (card || note) {
                    setCard(null);
                    setHit(null);
                    setNote(null);
                    setGesture(createGestureState());
                    return;
                  }
                  setHit(null);
                  applyGesture({ type: 'tap', target: 'edge', side });
                  return;
                }
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
          <ChapterView chapter={chapter} language={language} />
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
          language={language}
          {...(llm ? { llm } : {})}
          {...(llm ? { adapter: llm.adapter } : {})}
          bookId={book.id}
          onOpenSettings={onOpenSettings}
          onClose={() => {
            closeCard();
            setGesture(createGestureState());
          }}
        />
      ) : null}

      {translation ? (
        <TranslationPopover
          sentence={translation.text}
          placement={translation.placement}
          language={language}
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
          language={language}
          {...(llm ? { llm } : {})}
        />
      ) : null}

      {note ? <NotePopover note={note} t={t} onClose={() => setNote(null)} /> : null}

      {playback && playback.status !== 'idle' && playback.browsing ? (
        <button
          type="button"
          className="playback-return"
          data-playback-return
          onClick={() => {
            playback.onBrowsingChange(false);
            if (playback.sentence) {
              moveFocusToSentence(playback.sentence.id);
            }
          }}
        >
          {t('reader.backToCurrent')}
        </button>
      ) : null}

      <ReaderFooter
        focusEnabled={focusEnabled}
        playbackStatus={playback?.status ?? 'idle'}
        playbackAvailable={Boolean(playback)}
        focusIndex={focusIndex}
        focusOrderLength={focusOrder.length}
        subtitlesOn={subtitlesOn}
        page={page}
        pageCount={pageCount}
        chapterIndex={chapter.index}
        chaptersLength={chapters.length}
        overallPercent={overallPercent}
        previousChapter={Boolean(previousChapter)}
        nextChapter={Boolean(nextChapter)}
        t={t}
        onClick={() => {
          if (translation || card || note) {
            setTranslation(null);
            closeCard();
            setNote(null);
            setGesture(createGestureState());
            return;
          }
          applyGesture({ type: 'tap', target: 'chrome' });
        }}
        onPrevFocus={() => {
          if (playback?.status === 'playing') {
            playback.engine.prev();
          } else {
            moveFocus('prev');
          }
        }}
        onNextFocus={() => {
          if (playback?.status === 'playing') {
            playback.engine.next();
          } else {
            moveFocus('next');
          }
        }}
        onToggleSubtitles={() => setSubtitlesOn((value) => !value)}
        onTogglePlayback={togglePlayback}
        onPrevPage={previousPage}
        onNextPage={nextPage}
      />

      {gesture.menuOpen ? (
        <ReaderBottomMenu
          fontScale={fontScale}
          focusEnabled={focusEnabled}
          focusUnit={focusUnit}
          edgeTurn={edgeTurn}
          t={t}
          onAdjustFont={adjustFont}
          onToggleFocus={() => setFocusMode(!focusEnabled)}
          onChangeFocusUnit={changeFocusUnit}
          onToggleEdgeTurn={(value) => {
            setEdgeTurnPreference(value);
            writeEdgeTurnPreference(value);
          }}
        />
      ) : null}
    </div>
  );
}
