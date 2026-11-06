import type { Locator } from '@garagara/core';
import type { StoredChapter } from '@garagara/storage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { COLUMN_GAP } from '../paging/columns.js';
import { buildPageMap, pageIndexForLocator, type PageInfo } from '../paging/page-map.js';
import { collectPageFragments } from '../paging/page-map-dom.js';
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

export function useReaderPagination({
  bookId,
  chapter,
  initialLocator,
  contentRef,
  viewportRef,
}: {
  bookId: string;
  chapter: StoredChapter;
  initialLocator?: Locator;
  contentRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const pendingAnchor = useRef<Anchor | null>(null);
  const initialLocatorApplied = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [fontScale, setFontScale] = useState(initialFontScale);
  const [fontsReady, setFontsReady] = useState(false);
  const [pageMap, setPageMap] = useState<PageInfo[]>([]);

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
      const style = getComputedStyle(viewport);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const next = {
        width: Math.max(1, Math.floor(rect.width - horizontalPadding)),
        height: Math.max(1, Math.floor(rect.height - verticalPadding)),
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
  }, [contentRef, viewportRef]);

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
      const pages = Math.max(1, Math.ceil((maxRight - contentLeft) / stride));
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
            Math.floor((element.getBoundingClientRect().left - contentLeft + 1) / stride),
            0,
            pages - 1,
          );
        }
        pendingAnchor.current = null;
      }
      const nextPageMap = buildPageMap(
        bookId,
        chapter,
        collectPageFragments(content, stride),
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
  }, [
    bookId,
    chapter,
    contentRef,
    fontsReady,
    fontScale,
    initialLocator,
    size.height,
    size.width,
    stride,
  ]);

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

  return {
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
  };
}
