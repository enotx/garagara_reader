import type { BookSummary, ChapterSummary, StoredChapter } from '@garagara/storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ChapterView } from './ChapterView.js';

const COLUMN_GAP = 40;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ReaderView({
  book,
  chapters,
  chapter,
  chapterSizes,
  onChapterChange,
  onExit,
}: {
  book: BookSummary;
  chapters: ChapterSummary[];
  chapter: StoredChapter;
  chapterSizes: number[];
  onChapterChange: (chapterIndex: number) => void;
  onExit: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const chapterChars = useMemo(
    () => chapter.blocks.reduce((sum, block) => sum + block.text.length, 0),
    [chapter.blocks],
  );
  const maxColumns = useMemo(() => Math.max(3, Math.ceil(chapterChars / 180) + 4), [chapterChars]);
  const stride = size.width + COLUMN_GAP;
  const currentIndex = chapters.findIndex((item) => item.index === chapter.index);
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : undefined;
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : undefined;

  const totalChars = chapterSizes.reduce((sum, value) => sum + value, 0);
  const charsBefore = chapterSizes
    .slice(0, chapter.index)
    .reduce((sum, value) => sum + value, 0);
  const pageFraction = pageCount <= 1 ? 1 : (page + 1) / pageCount;
  const overallPercent =
    totalChars > 0
      ? Math.round(((charsBefore + chapterChars * pageFraction) / totalChars) * 100)
      : 0;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = (): void => {
      const rect = viewport.getBoundingClientRect();
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (size.width === 0 || size.height === 0) {
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
      setPageCount(pages);
      setPage((value) => clamp(value, 0, pages - 1));
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter, size.width, size.height]);

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

  return (
    <div className="reader">
      <header className="reader-header">
        <button type="button" className="reader-button" onClick={onExit}>
          书架
        </button>
        <div className="reader-heading">
          <strong>{book.title}</strong>
          <span>{chapter.title}</span>
        </div>
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
      </header>

      <div
        ref={viewportRef}
        className="reader-viewport"
        onPointerDown={(event) => {
          pointerStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (start === null) {
            return;
          }
          const delta = event.clientX - start;
          if (delta < -50) {
            nextPage();
          } else if (delta > 50) {
            previousPage();
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
            transform: `translateX(${-page * stride}px)`,
          }}
        >
          <ChapterView chapter={chapter} />
        </div>
      </div>

      <footer className="reader-footer">
        <button
          type="button"
          className="reader-button"
          onClick={previousPage}
          disabled={page === 0 && !previousChapter}
        >
          上一页
        </button>
        <div className="reader-progress">
          <span>
            第 {chapter.index + 1} / {chapters.length} 章
          </span>
          <span>
            {page + 1} / {pageCount} 页 · {overallPercent}%
          </span>
        </div>
        <button
          type="button"
          className="reader-button"
          onClick={nextPage}
          disabled={page >= pageCount - 1 && !nextChapter}
        >
          下一页
        </button>
      </footer>
    </div>
  );
}
