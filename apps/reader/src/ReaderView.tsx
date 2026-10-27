import type { Note } from '@garagara/core';
import type { BookSummary, ChapterSummary, StoredChapter } from '@garagara/storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ChapterView } from './ChapterView.js';
import { createGestureState, reduceGesture, type GestureEvent } from './gestures.js';
import { IconChevronLeft, IconChevronRight, IconX } from './icons';
import { buildPageMap, type PageInfo } from './page-map.js';
import { hitTestPoint, type HitTestResult } from './hit-test.js';
import { collectPageFragments } from './page-map-dom.js';
import type { LlmRuntime } from './llm.js';
import { THEMES, type Theme } from './theme.js';
import { WordCard } from './WordCard.js';

const COLUMN_GAP = 40;
const FONT_SCALE_KEY = 'garagara.reader.fontScale';
const MIN_FONT_SCALE = 70;
const MAX_FONT_SCALE = 180;

interface Anchor {
  blockId: string;
  start: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
      setPageMap(
        buildPageMap(
          book.id,
          chapter,
          collectPageFragments(content, size.width + COLUMN_GAP),
          pages,
        ),
      );
      setPageCount(pages);
      setPage(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter, size.width, size.height, fontScale, fontsReady]);

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
      setPage(page - 1);
      return;
    }
    if (previousChapter) {
      onChapterChange(previousChapter.index);
    }
  }

  function nextPage(): void {
    if (page < pageCount - 1) {
      setPage(page + 1);
      return;
    }
    if (nextChapter) {
      onChapterChange(nextChapter.index);
    }
  }

  function applyGesture(event: GestureEvent): void {
    const result = reduceGesture(gesture, event);
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
    <div className="reader" data-menu-open={gesture.menuOpen ? 'true' : 'false'}>
      <header
        className="reader-header"
        onClick={() => {
          setNote(null);
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
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (start === null) {
            return;
          }
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            applyGesture({
              type: 'swipe',
              direction: deltaX < 0 ? 'left' : 'right',
            });
            return;
          }
          if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
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
            setHit(result);
            if (result) {
              setNote(null);
              const viewport = viewportRef.current;
              const bounds = viewport?.getBoundingClientRect();
              const placement =
                bounds && event.clientY < bounds.top + bounds.height / 2 ? 'bottom' : 'top';
              setCard({ hit: result, placement });
              applyGesture({
                type: 'tap',
                target: 'word',
                word: result.token.surface,
                sentenceId: result.sentenceId ?? '',
                sameSentence: true,
              });
            } else {
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
          pointerStart.current = null;
        }}
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
          onOpenSettings={onOpenSettings}
          onClose={() => {
            setCard(null);
            setHit(null);
            setGesture(createGestureState());
          }}
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
        className="reader-footer"
        onClick={() => {
          setNote(null);
          applyGesture({ type: 'tap', target: 'chrome' });
        }}
      >
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
          <span className="menu-note">正文分页只在排版变化时重算</span>
        </div>
      ) : null}
    </div>
  );
}
