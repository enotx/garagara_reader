import type { Dictionary } from './dictionary.js';
import { lemmatize } from './lemmatize.js';
import type { Token } from './tokenize.js';
import { wordTokens } from './tokenize.js';

export interface PhraseMatch {
  /** Inclusive start offset in the source text, UTF-16 code units. */
  start: number;
  /** Exclusive end offset in the source text, UTF-16 code units. */
  end: number;
  surface: string;
  /** Normalized phrase headword, e.g. "take into account". */
  lemma: string;
  /** Indices of the word tokens that belong to the phrase. */
  tokenIndices: number[];
}

const MAX_INSERTED_WORDS = 3;
const MAX_PHRASE_WORDS = 6;
const MAX_LEMMA_CANDIDATES = 2;
const SENTENCE_END = /[.!?…]/;

interface WordToken {
  index: number;
  token: Token;
  lemmas: string[];
}

interface SearchState {
  tokens: readonly Token[];
  words: readonly WordToken[];
  dictionary: Dictionary;
  matches: PhraseMatch[];
}

function isSentenceEnd(token: Token): boolean {
  return !token.isWord && SENTENCE_END.test(token.surface);
}

function buildWords(tokens: readonly Token[], dictionary: Dictionary): WordToken[] {
  return wordTokens(tokens).map(({ index, token }) => ({
    index,
    token,
    lemmas: lemmatize(token, tokens, dictionary).slice(0, MAX_LEMMA_CANDIDATES),
  }));
}

function crossesSentence(
  tokens: readonly Token[],
  words: readonly WordToken[],
  from: number,
  to: number,
): boolean {
  const fromToken = words[from]?.index ?? 0;
  const toToken = words[to]?.index ?? 0;
  for (let index = fromToken + 1; index < toToken; index += 1) {
    const token = tokens[index];
    if (token && isSentenceEnd(token)) {
      return true;
    }
  }
  return false;
}

function search(
  state: SearchState,
  start: number,
  last: number,
  selected: readonly number[],
  lemmas: readonly string[],
): void {
  const { words, dictionary, matches } = state;
  const limit = Math.min(words.length - 1, last + MAX_INSERTED_WORDS + 1);
  for (let nextIndex = last + 1; nextIndex <= limit; nextIndex += 1) {
    const next = words[nextIndex];
    if (!next) {
      continue;
    }
    if (crossesSentence(state.tokens, words, last, nextIndex)) {
      break;
    }
    for (const lemma of next.lemmas) {
      const nextLemmas = [...lemmas, lemma];
      const nextSelected = [...selected, nextIndex];
      if (dictionary.hasPhrase(nextLemmas)) {
        const first = words[start];
        const lastWord = words[nextIndex];
        if (first && lastWord) {
          matches.push({
            start: first.token.start,
            end: lastWord.token.end,
            surface: state.tokens
              .slice(first.index, lastWord.index + 1)
              .map((token) => token.surface)
              .join(''),
            lemma: nextLemmas.join(' '),
            tokenIndices: nextSelected.map((index) => words[index]?.index ?? 0),
          });
        }
      }
      if (nextLemmas.length < MAX_PHRASE_WORDS) {
        search(state, start, nextIndex, nextSelected, nextLemmas);
      }
    }
  }
}

/**
 * Matches dictionary phrases after lemmatizing, allowing up to three inserted
 * words between phrase words. Overlapping matches keep the longest span.
 */
export function matchPhrases(tokens: readonly Token[], dictionary: Dictionary): PhraseMatch[] {
  const words = buildWords(tokens, dictionary);
  const state: SearchState = { tokens, words, dictionary, matches: [] };

  for (let start = 0; start < words.length; start += 1) {
    const word = words[start];
    if (!word) {
      continue;
    }
    for (const lemma of word.lemmas) {
      search(state, start, start, [start], [lemma]);
    }
  }

  state.matches.sort((a, b) => b.end - b.start - (a.end - a.start));
  const chosen: PhraseMatch[] = [];
  for (const match of state.matches) {
    const overlaps = chosen.some((item) => match.start < item.end && item.start < match.end);
    if (overlaps) {
      continue;
    }
    chosen.push(match);
  }
  chosen.sort((a, b) => a.start - b.start);
  return chosen;
}
