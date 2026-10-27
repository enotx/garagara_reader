const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });

export interface Token {
  /** Inclusive start offset in the source text, UTF-16 code units. */
  start: number;
  /** Exclusive end offset in the source text, UTF-16 code units. */
  end: number;
  surface: string;
  isWord: boolean;
}

/**
 * Splits English text into word and non-word segments with UTF-16 offsets.
 * Concatenating every token's surface reconstructs the source string.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const segment of wordSegmenter.segment(text)) {
    tokens.push({
      start: segment.index,
      end: segment.index + segment.segment.length,
      surface: segment.segment,
      isWord: segment.isWordLike === true,
    });
  }
  return tokens;
}

/** Returns word tokens only, preserving their indices in the full token list. */
export function wordTokens(tokens: readonly Token[]): Array<{ index: number; token: Token }> {
  const words: Array<{ index: number; token: Token }> = [];
  tokens.forEach((token, index) => {
    if (token.isWord) {
      words.push({ index, token });
    }
  });
  return words;
}
