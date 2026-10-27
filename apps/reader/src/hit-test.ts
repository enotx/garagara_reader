import type { Block, Sentence } from '@garagara/core';
import type { Token } from '@garagara/lang-en';

import { tokensForBlock } from './text-analysis.js';

export interface HitTestResult {
  block: Block;
  blockOffset: number;
  token: Token;
  sentenceId?: string;
}

export interface HitTestChapter {
  blocks: Block[];
  sentences: Sentence[];
}

function rangeFromPoint(x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === 'function') {
    return document.caretRangeFromPoint(x, y);
  }
  const position = document.caretPositionFromPoint?.(x, y);
  if (!position) {
    return null;
  }
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function textOffsetInSpan(node: Text, offset: number, span: HTMLElement): number {
  let local = offset;
  let sibling: Node | null = node.previousSibling;
  while (sibling) {
    local += sibling.textContent?.length ?? 0;
    sibling = sibling.previousSibling;
  }
  return Number(span.dataset.start ?? 0) + local;
}

function spanContainsPoint(span: HTMLElement, x: number, y: number): boolean {
  const tolerance = 2;
  return [...span.getClientRects()].some(
    (rect) =>
      x >= rect.left - tolerance &&
      x <= rect.right + tolerance &&
      y >= rect.top - tolerance &&
      y <= rect.bottom + tolerance,
  );
}

/** Picks the word under the offset, snapping to the nearest word in gaps. */
export function snapToWord(tokens: readonly Token[], offset: number): Token | undefined {
  let best: Token | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    if (!token.isWord) {
      continue;
    }
    if (offset >= token.start && offset < token.end) {
      return token;
    }
    const distance = offset < token.start ? token.start - offset : offset - token.end + 1;
    if (distance < bestDistance) {
      best = token;
      bestDistance = distance;
    }
  }
  return best;
}

/** Maps a viewport point to a block-local offset and word token. */
export function hitTestPoint(
  x: number,
  y: number,
  chapter: HitTestChapter,
): HitTestResult | undefined {
  const range = rangeFromPoint(x, y);
  if (!range) {
    return undefined;
  }
  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) {
    return undefined;
  }
  const node = container as Text;
  const span = node.parentElement?.closest<HTMLElement>('[data-block][data-start]');
  if (!span || !spanContainsPoint(span, x, y)) {
    return undefined;
  }
  const blockId = span.dataset.block;
  const block = chapter.blocks.find((item) => item.id === blockId);
  if (!block) {
    return undefined;
  }
  const blockOffset = textOffsetInSpan(node, range.startOffset, span);
  const token = snapToWord(tokensForBlock(block), blockOffset);
  if (!token) {
    return undefined;
  }
  const sentence = chapter.sentences.find(
    (item) => item.blockId === block.id && token.start >= item.start && token.start < item.end,
  );
  return {
    block,
    blockOffset,
    token,
    ...(sentence ? { sentenceId: sentence.id } : {}),
  };
}
