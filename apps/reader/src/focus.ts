import type { FocusSegment, PageInfo } from './page-map.js';

export type FocusUnit = 'sentence' | 'chunk';

export interface FocusPosition {
  page: number;
  segment: FocusSegment;
}

export interface FocusTarget {
  kind: FocusUnit;
  id: string;
  blockId: string;
  start: number;
  end: number;
}

export function toFocusTarget(segment: FocusSegment): FocusTarget {
  return {
    kind: segment.kind,
    id: segment.id,
    blockId: segment.blockId,
    start: segment.start,
    end: segment.end,
  };
}

export function sameFocus(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (!a || !b) {
    return a === b;
  }
  return (
    a.kind === b.kind &&
    a.id === b.id &&
    a.blockId === b.blockId &&
    a.start === b.start &&
    a.end === b.end
  );
}

/** Flattens the page map into the focus advance order for one unit. */
export function focusPositions(pages: readonly PageInfo[], unit: FocusUnit): FocusPosition[] {
  const positions: FocusPosition[] = [];
  for (const page of pages) {
    for (const segment of page.segments) {
      if (segment.kind === unit) {
        positions.push({ page: page.index, segment });
      }
    }
  }
  return positions;
}

export function firstSegmentOnPage(
  positions: readonly FocusPosition[],
  page: number,
): FocusPosition | undefined {
  return positions.find((position) => position.page === page);
}

/** Picks the first segment on the current page, else the next available one. */
export function initialFocusPosition(
  positions: readonly FocusPosition[],
  page: number,
): FocusPosition | undefined {
  return (
    firstSegmentOnPage(positions, page) ??
    positions.find((position) => position.page > page) ??
    positions[positions.length - 1]
  );
}

export function findFocusIndex(
  positions: readonly FocusPosition[],
  target: FocusTarget | null,
): number {
  if (!target) {
    return -1;
  }
  const exact = positions.findIndex(
    (position) =>
      position.segment.kind === target.kind &&
      position.segment.id === target.id &&
      position.segment.blockId === target.blockId &&
      position.segment.start === target.start &&
      position.segment.end === target.end,
  );
  if (exact >= 0) {
    return exact;
  }
  return positions.findIndex(
    (position) => position.segment.kind === target.kind && position.segment.id === target.id,
  );
}

/** Moves one focus fragment, crossing page boundaries. */
export function stepFocus(
  positions: readonly FocusPosition[],
  target: FocusTarget | null,
  direction: 'next' | 'prev',
): FocusPosition | undefined {
  if (positions.length === 0) {
    return undefined;
  }
  const index = findFocusIndex(positions, target);
  if (index < 0) {
    return direction === 'next' ? positions[0] : positions[positions.length - 1];
  }
  return positions[direction === 'next' ? index + 1 : index - 1];
}

/** Sentence id for sentence segments and `sentenceId:k3` chunk segments. */
export function sentenceIdForSegment(segment: FocusSegment): string {
  return segment.kind === 'sentence' ? segment.id : (segment.id.split(':k')[0] ?? segment.id);
}

/** First focus fragment belonging to a sentence (chunk mode uses its first chunk). */
export function positionForSentence(
  positions: readonly FocusPosition[],
  sentenceId: string,
): FocusPosition | undefined {
  return positions.find((position) => sentenceIdForSegment(position.segment) === sentenceId);
}
