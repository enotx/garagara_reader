export interface Token {
  /** Inclusive start offset in the source text, UTF-16 code units. */
  start: number;
  /** Exclusive end offset in the source text, UTF-16 code units. */
  end: number;
  surface: string;
  isWord: boolean;
}

export interface SentenceRange {
  /** Inclusive start offset in the source text. */
  start: number;
  /** Exclusive end offset in the source text. */
  end: number;
}

export interface PhraseMatch {
  /** Inclusive start offset in the source text. */
  start: number;
  /** Exclusive end offset in the source text. */
  end: number;
  surface: string;
  /** Normalized phrase headword, e.g. "take into account". */
  lemma: string;
  /** Indices of the word tokens that belong to the phrase. */
  tokenIndices: number[];
}

export interface DictionaryEntry {
  headword: string;
  translation: string;
  definition?: string;
  pos?: string;
  bnc?: number;
  coca?: number;
}

export interface Dictionary {
  lookup(lemma: string, lang: string, explainLang: string): Promise<DictionaryEntry[]>;
  /** Synchronous phrase-index lookup used by matchPhrases. */
  hasPhrase(lemmaSeq: readonly string[]): boolean;
  /** Synchronous irregular-form lookup used by lemmatize. */
  formsFor?(form: string): readonly string[];
}

export interface LanguagePack {
  lang: string;
  splitSentences(text: string): SentenceRange[];
  tokenize(text: string): Token[];
  lemmatize(token: Token, ctx: Token[]): string[];
  matchPhrases(tokens: Token[], dict: Dictionary): PhraseMatch[];
  chunk(sentence: string, tokens: Token[]): SentenceRange[];
}
