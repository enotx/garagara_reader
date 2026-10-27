const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export interface SentenceRange {
  /** Inclusive start offset in the source text, UTF-16 code units. */
  start: number;
  /** Exclusive end offset in the source text, UTF-16 code units. */
  end: number;
}

const ALWAYS_MERGE_ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'vs.']);

const TITLE_ABBREVIATIONS = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'rev.',
  'hon.',
  'capt.',
  'col.',
  'gen.',
  'lt.',
  'sgt.',
  'gov.',
  'pres.',
  'fr.',
]);

const PLACE_ABBREVIATIONS = new Set(['st.', 'mt.', 'ft.']);

const NUMBER_ABBREVIATIONS = new Set(['no.']);

const CONTINUATION_ABBREVIATIONS = new Set([
  'etc.',
  'cf.',
  'al.',
  'p.m.',
  'a.m.',
  'u.s.',
  'u.k.',
  'ph.d.',
  'inc.',
  'ltd.',
  'co.',
  'corp.',
  'jr.',
  'sr.',
  'fig.',
  'vol.',
  'dept.',
  'est.',
  'approx.',
  'min.',
  'max.',
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'sept.',
  'oct.',
  'nov.',
  'dec.',
]);

const SENTENCE_STARTERS = new Set([
  'a',
  'after',
  'although',
  'an',
  'and',
  'as',
  'at',
  'because',
  'before',
  'but',
  'by',
  'despite',
  'during',
  'finally',
  'for',
  'from',
  'he',
  'her',
  'his',
  'however',
  'i',
  'if',
  'in',
  'it',
  'later',
  'meanwhile',
  'my',
  'next',
  'no',
  'not',
  'now',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'still',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'though',
  'to',
  'we',
  'what',
  'when',
  'where',
  'while',
  'who',
  'why',
  'with',
  'without',
  'yet',
  'you',
]);

const TRAILING_QUOTE = /["'”’»)\]]$/;
const CLOSING_PUNCTUATION = /[.!?…]/;
const INITIAL = /(?:^|[\s"'“‘(—–-])([A-Z])\.$/;
const ABBREVIATION = /(?:^|[\s"'“‘(—–-])([A-Za-z](?:[A-Za-z.]*)\.)$/;
const FIRST_WORD = /^["'“‘(]*([A-Za-z]+)/;

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/u.test(char);
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && isWhitespace(text[index])) {
    index += 1;
  }
  return index;
}

function trimRange(text: string, range: SentenceRange): SentenceRange | undefined {
  let { start, end } = range;
  while (start < end && isWhitespace(text[start])) {
    start += 1;
  }
  while (end > start && isWhitespace(text[end - 1])) {
    end -= 1;
  }
  return end > start ? { start, end } : undefined;
}

function firstWord(text: string): string {
  return (FIRST_WORD.exec(text)?.[1] ?? '').toLowerCase();
}

function startsWithLowercase(text: string): boolean {
  return /^[a-z]/.test(text);
}

function startsWithDigit(text: string): boolean {
  return /^[0-9]/.test(text);
}

function abbreviationAtEnd(text: string): string | undefined {
  return ABBREVIATION.exec(text)?.[1]?.toLowerCase();
}

function isInitialAtEnd(text: string): boolean {
  return INITIAL.test(text);
}

function endsWithQuotedSentence(text: string): boolean {
  let index = text.length;
  while (index > 0 && TRAILING_QUOTE.test(text[index - 1] ?? '')) {
    index -= 1;
  }
  if (index === text.length) {
    return false;
  }
  return CLOSING_PUNCTUATION.test(text[index - 1] ?? '');
}

function quoteNeedsAttribution(text: string, nextText: string): boolean {
  return endsWithQuotedSentence(text) && startsWithLowercase(nextText);
}

function shouldMerge(text: string, previousEnd: number, nextStart: number): boolean {
  const previousText = text.slice(0, previousEnd).trimEnd();
  const nextText = text.slice(skipWhitespace(text, nextStart)).trimEnd();
  if (!nextText) {
    return false;
  }

  if (quoteNeedsAttribution(previousText, nextText)) {
    return true;
  }

  const abbreviation = abbreviationAtEnd(previousText);
  if (abbreviation) {
    if (ALWAYS_MERGE_ABBREVIATIONS.has(abbreviation)) {
      return true;
    }
    if (TITLE_ABBREVIATIONS.has(abbreviation)) {
      return true;
    }
    if (PLACE_ABBREVIATIONS.has(abbreviation)) {
      return !SENTENCE_STARTERS.has(firstWord(nextText));
    }
    if (NUMBER_ABBREVIATIONS.has(abbreviation)) {
      return startsWithDigit(nextText) || startsWithLowercase(nextText);
    }
    if (CONTINUATION_ABBREVIATIONS.has(abbreviation)) {
      return startsWithDigit(nextText) || startsWithLowercase(nextText);
    }
  }

  if (isInitialAtEnd(previousText)) {
    return /^[A-Z]/.test(nextText) && !SENTENCE_STARTERS.has(firstWord(nextText));
  }

  return false;
}

/**
 * Splits English text into sentences using Intl.Segmenter plus abbreviation,
 * initial and quoted-dialogue repair. Returns half-open UTF-16 ranges with
 * leading and trailing whitespace removed.
 */
export function splitSentences(text: string): SentenceRange[] {
  if (!text) {
    return [];
  }

  const parts: SentenceRange[] = [];
  for (const part of sentenceSegmenter.segment(text)) {
    parts.push({ start: part.index, end: part.index + part.segment.length });
  }

  const merged: SentenceRange[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && shouldMerge(text, last.end, part.start)) {
      last.end = part.end;
    } else {
      merged.push({ ...part });
    }
  }

  const sentences: SentenceRange[] = [];
  for (const range of merged) {
    const trimmed = trimRange(text, range);
    if (trimmed) {
      sentences.push(trimmed);
    }
  }
  return sentences;
}
