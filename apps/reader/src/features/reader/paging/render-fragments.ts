import type { Mark, Sentence } from '@garagara/core';

export interface TextFragment {
  start: number;
  end: number;
  text: string;
  marks: Mark[];
  sentenceId?: string;
}

function boundaries(
  text: string,
  marks: readonly Mark[],
  sentences: readonly Sentence[],
): number[] {
  const points = new Set<number>([0, text.length]);
  for (const mark of marks) {
    if (mark.start >= 0 && mark.start < text.length) {
      points.add(mark.start);
    }
    if (mark.end > 0 && mark.end <= text.length) {
      points.add(mark.end);
    }
  }
  for (const sentence of sentences) {
    if (sentence.start >= 0 && sentence.start < text.length) {
      points.add(sentence.start);
    }
    if (sentence.end > 0 && sentence.end <= text.length) {
      points.add(sentence.end);
    }
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * Splits block text at every mark and sentence boundary. Each fragment carries
 * the complete set of marks and the sentence that covers it, so CSS ranges and
 * sentence ranges can cross without nesting spans incorrectly.
 */
export function buildFragments(
  text: string,
  marks: readonly Mark[],
  sentences: readonly Sentence[],
): TextFragment[] {
  if (!text) {
    return [];
  }
  const points = boundaries(text, marks, sentences);
  const fragments: TextFragment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined || end <= start) {
      continue;
    }
    const coveringMarks = marks.filter((mark) => mark.start <= start && mark.end >= end);
    const sentence = sentences.find((item) => item.start <= start && item.end >= end);
    fragments.push({
      start,
      end,
      text: text.slice(start, end),
      marks: coveringMarks,
      ...(sentence ? { sentenceId: sentence.id } : {}),
    });
  }
  return fragments;
}
