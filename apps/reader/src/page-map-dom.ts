import type { PageFragment } from './page-map.js';

/**
 * Maps rendered text fragments to page indices. Long fragments are split with
 * a Range so a sentence crossing a column boundary contributes to both pages.
 */
export function collectPageFragments(content: HTMLElement, stride: number): PageFragment[] {
  const contentLeft = content.getBoundingClientRect().left;
  const range = document.createRange();
  const fragments: PageFragment[] = [];

  for (const span of content.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
    const blockId = span.dataset.block;
    const blockStart = Number(span.dataset.start ?? -1);
    const node = span.firstChild;
    if (!blockId || blockStart < 0 || !(node instanceof Text)) {
      continue;
    }
    const length = node.data.length;
    if (length === 0) {
      continue;
    }
    const pageAt = (offset: number): number => {
      range.setStart(node, offset);
      range.setEnd(node, Math.min(offset + 1, length));
      const rect = range.getBoundingClientRect();
      return Math.max(0, Math.floor((rect.left - contentLeft + 1) / stride));
    };

    let from = 0;
    while (from < length) {
      const page = pageAt(from);
      let low = from;
      let high = length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (pageAt(middle) === page) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }
      fragments.push({
        blockId,
        start: blockStart + from,
        end: blockStart + low + 1,
        page,
      });
      from = low + 1;
    }
  }

  return fragments;
}
