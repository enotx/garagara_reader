import type { Locator } from '@garagara/core';
import { useEffect, useRef } from 'react';

import type { PageInfo } from '../paging/page-map.js';

/** Reports the current page's starting Locator and flushes it on unmount. */
export function useReaderProgress(
  pageMap: PageInfo[],
  page: number,
  onProgress: ((locator: Locator) => void) | undefined,
): void {
  const latestLocator = useRef<Locator | undefined>(undefined);

  useEffect(() => {
    const locator = pageMap[page]?.startLocator;
    if (!locator) {
      return;
    }
    latestLocator.current = locator;
    onProgress?.(locator);
  }, [pageMap, page, onProgress]);

  useEffect(() => {
    return () => {
      if (latestLocator.current) {
        onProgress?.(latestLocator.current);
      }
    };
  }, [onProgress]);
}
