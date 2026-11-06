import type { Block } from '@garagara/core';
import {
  matchPhrases,
  tokenize,
  type Dictionary,
  type PhraseMatch,
  type Token,
} from '@garagara/lang-en';

const tokenCache = new WeakMap<Block, Token[]>();
let phraseDictionary: Dictionary | undefined;
let phraseCache = new WeakMap<Block, PhraseMatch[]>();

/**
 * Returns cached tokens for an immutable block. Offsets follow Spec §1
 * (UTF-16 code units, [start, end)).
 */
export function tokensForBlock(block: Block): Token[] {
  const cached = tokenCache.get(block);
  if (cached) {
    return cached;
  }
  const tokens = tokenize(block.text);
  tokenCache.set(block, tokens);
  return tokens;
}

/**
 * Returns cached phrase matches for an immutable block. Phrase matches depend
 * only on the block text and dictionary, not on the tapped token.
 */
export function phrasesForBlock(block: Block, dictionary: Dictionary): PhraseMatch[] {
  if (dictionary !== phraseDictionary) {
    phraseDictionary = dictionary;
    phraseCache = new WeakMap();
  }
  const cached = phraseCache.get(block);
  if (cached) {
    return cached;
  }
  const phrases = matchPhrases(tokensForBlock(block), dictionary);
  phraseCache.set(block, phrases);
  return phrases;
}
