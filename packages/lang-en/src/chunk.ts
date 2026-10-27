import type { SentenceRange } from './sentences.js';
import type { Token } from './tokenize.js';
import { tokenize } from './tokenize.js';

const MIN_CHUNK_CHARS = 6;
const MAX_CHUNK_CHARS = 48;
const PUNCTUATION_BOUNDARY = /^[,;:—–-]$/u;
const SCONJ = new Set([
  'although',
  'because',
  'before',
  'after',
  'if',
  'unless',
  'until',
  'since',
  'though',
  'while',
  'whereas',
  'when',
  'whenever',
  'where',
  'wherever',
  'whether',
  'that',
  'which',
  'who',
  'whom',
  'whose',
]);
const CONJUNCTIONS = new Set(['and', 'but', 'or', 'so', 'yet', 'nor', 'for']);
const ADVERBIAL_CONNECTORS = new Set([
  'however',
  'therefore',
  'thus',
  'meanwhile',
  'otherwise',
  'moreover',
  'furthermore',
]);

function trimRange(text: string, range: SentenceRange): SentenceRange | undefined {
  let start = range.start;
  let end = range.end;
  while (start < end && /\s/u.test(text[start] ?? '')) {
    start += 1;
  }
  while (end > start && /\s/u.test(text[end - 1] ?? '')) {
    end -= 1;
  }
  return end > start ? { start, end } : undefined;
}

function isCutWord(word: string): boolean {
  return SCONJ.has(word) || CONJUNCTIONS.has(word) || ADVERBIAL_CONNECTORS.has(word);
}

function collectCuts(sentence: string, tokens: readonly Token[]): number[] {
  const cuts = new Set<number>();
  for (const token of tokens) {
    if (!token.isWord) {
      if (PUNCTUATION_BOUNDARY.test(token.surface) && token.end < sentence.length) {
        cuts.add(token.end);
      }
      continue;
    }
    const word = token.surface.toLowerCase();
    if (isCutWord(word) && token.start > 0) {
      cuts.add(token.start);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}

function buildRanges(sentence: string, cuts: readonly number[]): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  let start = 0;
  for (const cut of cuts) {
    const range = trimRange(sentence, { start, end: cut });
    if (range) {
      ranges.push(range);
    }
    start = cut;
  }
  const tail = trimRange(sentence, { start, end: sentence.length });
  if (tail) {
    ranges.push(tail);
  }
  return ranges;
}

function mergeShort(ranges: readonly SentenceRange[]): SentenceRange[] {
  const merged: SentenceRange[] = [];
  for (const range of ranges) {
    const length = range.end - range.start;
    const previous = merged[merged.length - 1];
    if (previous && length < MIN_CHUNK_CHARS) {
      previous.end = range.end;
      continue;
    }
    if (previous && previous.end - previous.start < MIN_CHUNK_CHARS) {
      previous.end = range.end;
      continue;
    }
    merged.push({ ...range });
  }
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    const previous = merged[merged.length - 2];
    if (last && previous && last.end - last.start < MIN_CHUNK_CHARS) {
      previous.end = last.end;
      merged.pop();
    }
  }
  return merged;
}

function wordBoundary(tokens: readonly Token[], start: number, limit: number): number | undefined {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token || !token.isWord) {
      continue;
    }
    if (token.end > limit) {
      continue;
    }
    if (token.end - start >= MIN_CHUNK_CHARS) {
      return token.end;
    }
  }
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token.start >= start + MIN_CHUNK_CHARS && token.start <= limit) {
      return token.start;
    }
  }
  return undefined;
}

function splitLong(
  sentence: string,
  ranges: readonly SentenceRange[],
  cuts: readonly number[],
  tokens: readonly Token[],
): SentenceRange[] {
  const output: SentenceRange[] = [];
  for (const range of ranges) {
    let start = range.start;
    while (range.end - start > MAX_CHUNK_CHARS) {
      const limit = start + MAX_CHUNK_CHARS;
      const candidate = [...cuts]
        .reverse()
        .find(
          (cut) =>
            cut > start + MIN_CHUNK_CHARS && cut <= limit && range.end - cut >= MIN_CHUNK_CHARS,
        );
      const cut = candidate ?? wordBoundary(tokens, start, limit);
      if (!cut || cut <= start) {
        break;
      }
      const head = trimRange(sentence, { start, end: cut });
      if (head) {
        output.push(head);
      }
      start = cut;
    }
    const tail = trimRange(sentence, { start, end: range.end });
    if (!tail) {
      continue;
    }
    const previous = output[output.length - 1];
    if (previous && tail.end - tail.start < MIN_CHUNK_CHARS) {
      previous.end = tail.end;
    } else {
      output.push(tail);
    }
  }
  return output;
}

/**
 * Splits a sentence into meaning groups at punctuation, conjunctions and
 * clause introducers. Ranges are relative to the sentence string, half-open,
 * with surrounding whitespace trimmed.
 */
export function chunk(sentence: string, tokens?: readonly Token[]): SentenceRange[] {
  if (!sentence.trim()) {
    return [];
  }
  const sourceTokens = tokens ?? tokenize(sentence);
  const cuts = collectCuts(sentence, sourceTokens);
  const ranges = buildRanges(sentence, cuts);
  return splitLong(sentence, mergeShort(ranges), cuts, sourceTokens);
}
