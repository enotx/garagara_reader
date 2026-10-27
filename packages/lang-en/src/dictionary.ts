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
