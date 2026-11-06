/**
 * Builds a DOM Range for a block-local [start, end) interval. Reader blocks are
 * split into spans carrying `data-block` and `data-start`, often at mark or
 * sentence boundaries, so a range may span several sibling text nodes.
 */
export function rangeForBlockOffsets(
  root: ParentNode,
  blockId: string,
  start: number,
  end: number,
): Range | undefined {
  const block = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!block || end <= start) {
    return undefined;
  }
  let startNode: Text | undefined;
  let endNode: Text | undefined;
  let startOffset = 0;
  let endOffset = 0;

  for (const span of block.querySelectorAll<HTMLElement>('[data-block][data-start]')) {
    const spanStart = Number(span.dataset.start ?? -1);
    const spanEnd = Number(span.dataset.end ?? -1);
    if (spanStart < 0 || spanEnd <= start) {
      continue;
    }
    if (spanStart >= end) {
      break;
    }
    const node = span.firstChild;
    if (!(node instanceof Text)) {
      continue;
    }
    if (!startNode) {
      startNode = node;
      startOffset = Math.max(start, spanStart) - spanStart;
    }
    endNode = node;
    endOffset = Math.min(end, spanEnd) - spanStart;
  }

  if (!startNode || !endNode) {
    return undefined;
  }
  const range = document.createRange();
  range.setStart(startNode, Math.max(0, startOffset));
  range.setEnd(endNode, Math.max(0, endOffset));
  return range;
}

export interface OutlineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Visible client rects for a focus segment, relative to the viewport element. */
export function outlineRects(range: Range, viewport: HTMLElement): OutlineRect[] {
  const bounds = viewport.getBoundingClientRect();
  return [...range.getClientRects()]
    .filter(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > bounds.left &&
        rect.left < bounds.right &&
        rect.bottom > bounds.top &&
        rect.top < bounds.bottom,
    )
    .map((rect) => ({
      left: rect.left - bounds.left,
      top: rect.top - bounds.top,
      width: rect.width,
      height: rect.height,
    }));
}
