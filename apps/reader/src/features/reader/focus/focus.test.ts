import { describe, expect, it } from 'vitest';

import {
  findFocusIndex,
  firstSegmentOnPage,
  focusPositions,
  initialFocusPosition,
  isFocusBackPoint,
  positionForSentence,
  sentenceIdForSegment,
  stepFocus,
  toFocusTarget,
  type FocusPosition,
} from './focus.js';
import type { FocusSegment, PageInfo } from '../paging/page-map.js';

function segment(
  kind: 'sentence' | 'chunk',
  id: string,
  start: number,
  end: number,
  page: number,
): FocusPosition {
  return {
    page,
    segment: { kind, id, blockId: 'b', start, end },
  };
}

const sentenceSegments: FocusPosition[] = [
  segment('sentence', 's1', 0, 10, 0),
  segment('sentence', 's2', 10, 20, 0),
  segment('sentence', 's2', 20, 30, 1),
  segment('sentence', 's3', 30, 40, 1),
];

const chunkSegments: FocusPosition[] = [
  segment('chunk', 's1:k0', 0, 4, 0),
  segment('chunk', 's1:k1', 4, 10, 0),
  segment('chunk', 's2:k0', 10, 20, 1),
];

function page(index: number, segments: FocusSegment[]): PageInfo {
  return {
    index,
    startLocator: { bookId: 'b', chapterIndex: 0, blockIndex: 0, offset: 0 },
    endLocator: { bookId: 'b', chapterIndex: 0, blockIndex: 0, offset: 0 },
    segments,
  };
}

describe('focus positions', () => {
  it('flattens only the selected unit in reading order', () => {
    const pages = [
      page(0, [sentenceSegments[0]!.segment, chunkSegments[0]!.segment]),
      page(1, [sentenceSegments[2]!.segment]),
    ];
    expect(focusPositions(pages, 'sentence').map((item) => item.segment.id)).toEqual(['s1', 's2']);
    expect(focusPositions(pages, 'chunk').map((item) => item.segment.id)).toEqual(['s1:k0']);
  });

  it('chooses the first fragment on the page or the next available one', () => {
    expect(firstSegmentOnPage(sentenceSegments, 0)?.segment.id).toBe('s1');
    expect(initialFocusPosition(sentenceSegments, 0)?.segment.id).toBe('s1');
    expect(initialFocusPosition(sentenceSegments, 1)?.segment.id).toBe('s2');
    expect(initialFocusPosition(sentenceSegments, 9)?.segment.id).toBe('s3');
    expect(initialFocusPosition([], 0)).toBeUndefined();
  });

  it('steps across page boundaries, including split sentences', () => {
    const s2 = toFocusTarget(sentenceSegments[1]!.segment);
    expect(stepFocus(sentenceSegments, s2, 'next')?.segment.start).toBe(20);
    const continued = toFocusTarget(sentenceSegments[2]!.segment);
    expect(stepFocus(sentenceSegments, continued, 'next')?.page).toBe(1);
    expect(stepFocus(sentenceSegments, continued, 'prev')?.segment.start).toBe(10);
  });

  it('falls back to the same unit id when offsets changed after repagination', () => {
    const target = { ...toFocusTarget(sentenceSegments[1]!.segment), start: 11, end: 21 };
    expect(findFocusIndex(sentenceSegments, target)).toBe(1);
  });

  it('maps chunks back to their sentence and supports chapter jumps', () => {
    expect(sentenceIdForSegment(chunkSegments[1]!.segment)).toBe('s1');
    expect(positionForSentence(chunkSegments, 's2')?.segment.id).toBe('s2:k0');
    expect(positionForSentence(sentenceSegments, 's3')?.page).toBe(1);
  });

  it('recognizes the top-left Focus back zone', () => {
    const bounds = { left: 100, top: 200, width: 400, height: 800 };
    expect(isFocusBackPoint({ x: 100, y: 200 }, bounds)).toBe(true);
    expect(isFocusBackPoint({ x: 220, y: 440 }, bounds)).toBe(true);
    expect(isFocusBackPoint({ x: 221, y: 440 }, bounds)).toBe(false);
    expect(isFocusBackPoint({ x: 220, y: 441 }, bounds)).toBe(false);
    expect(isFocusBackPoint({ x: 99, y: 220 }, bounds)).toBe(false);
  });
});
