import { LlmError, type ChatMessage } from './provider.js';

export interface WordInContextInput {
  /** Sentence text without Mark delimiters, offsets relative to it. */
  sentence: string;
  /** Start offset of the tapped word inside `sentence` (UTF-16). */
  targetStart: number;
  /** End offset of the tapped word inside `sentence`, exclusive (UTF-16). */
  targetEnd: number;
  /** Language used for the explanation, for example `zh`. */
  explainLang: string;
}

export interface WordInContextPhrase {
  text: string;
  lemma: string;
  /** Start offset inside the source sentence (UTF-16). */
  start: number;
  /** End offset inside the source sentence, exclusive (UTF-16). */
  end: number;
}

export interface WordInContextResult {
  lemma: string;
  pos: string;
  meaning: string;
  phrase?: WordInContextPhrase;
}

const LANGUAGE_NAMES: Record<string, string> = {
  zh: 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function markedSentence(input: WordInContextInput): string {
  return `${input.sentence.slice(0, input.targetStart)}⟦${input.sentence.slice(
    input.targetStart,
    input.targetEnd,
  )}⟧${input.sentence.slice(input.targetEnd)}`;
}

/**
 * Builds the wordInContext chat messages from Spec §9.2. The target offsets
 * are validated locally; the model never receives or returns offsets.
 */
export function buildWordInContextMessages(input: WordInContextInput): ChatMessage[] {
  if (
    input.targetStart < 0 ||
    input.targetEnd <= input.targetStart ||
    input.targetEnd > input.sentence.length
  ) {
    throw new RangeError('Target offsets must be inside the sentence');
  }
  const marked = markedSentence(input);
  return [
    {
      role: 'system',
      content:
        'You help language learners understand a word in context. ' +
        `Explain meanings in ${languageName(input.explainLang)}. ` +
        'Answer with one JSON object only, without markdown fences or extra text.',
    },
    {
      role: 'user',
      content: [
        'Sentence (the target is marked with ⟦ ⟧):',
        marked,
        '',
        'Return JSON with these fields:',
        '{"lemma": "dictionary form of the target", "pos": "part of speech", "meaning": "contextual meaning", "phrase": {"text": "exact phrase from the sentence", "lemma": "dictionary form of the phrase"}}',
        'Include "phrase" only when the target is part of an idiom or fixed multi-word phrase in this sentence.',
        'Omit "phrase" otherwise. Never invent words that are not in the sentence.',
      ].join('\n'),
    },
  ];
}

function parseJsonObject(content: string): Record<string, unknown> {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new LlmError('invalid_response', 'LLM response is not valid JSON', {
      retryable: false,
      cause: error,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LlmError('invalid_response', 'LLM response must be a JSON object', {
      retryable: false,
    });
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: Record<string, unknown>, field: string, allowEmpty = false): string {
  const item = value[field];
  if (typeof item !== 'string' || (!allowEmpty && !item.trim())) {
    throw new LlmError('invalid_response', `LLM response is missing "${field}"`, {
      retryable: false,
    });
  }
  return item.trim();
}

function parsePhrase(value: unknown, sentence: string): WordInContextPhrase | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const phrase = value as Record<string, unknown>;
  const text = typeof phrase.text === 'string' ? phrase.text : '';
  const lemma = typeof phrase.lemma === 'string' ? phrase.lemma : '';
  if (!text || !lemma) {
    return undefined;
  }
  const start = sentence.indexOf(text);
  if (start < 0) {
    return undefined;
  }
  return { text, lemma: lemma.trim(), start, end: start + text.length };
}

/**
 * Parses the wordInContext JSON result. Unknown fields are dropped. A phrase
 * whose text is not found verbatim in the sentence is discarded, because LLM
 * offsets cannot be trusted (Spec §9.2).
 */
export function parseWordInContextResult(content: string, sentence: string): WordInContextResult {
  const root = parseJsonObject(content);
  const lemma = requireString(root, 'lemma');
  const pos = requireString(root, 'pos', true);
  const meaning = requireString(root, 'meaning');
  const phrase = parsePhrase(root.phrase, sentence);
  return phrase ? { lemma, pos, meaning, phrase } : { lemma, pos, meaning };
}
