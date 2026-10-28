import { parseJsonObject } from './json-content.js';
import { LlmError, type ChatMessage } from './provider.js';

export interface TranslateSentenceInput {
  sentence: string;
  /** Language used for the translation, for example `zh`. */
  explainLang: string;
}

export interface TranslateSentenceResult {
  translation: string;
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

/** Builds the translateSentence chat messages from Spec §9.2. */
export function buildTranslateSentenceMessages(input: TranslateSentenceInput): ChatMessage[] {
  if (!input.sentence.trim()) {
    throw new RangeError('Sentence must not be empty');
  }
  return [
    {
      role: 'system',
      content:
        'You translate literature for language learners. ' +
        `Translate into ${languageName(input.explainLang)}. ` +
        'Preserve meaning, tone and names. Answer with one JSON object only, ' +
        'without markdown fences or extra text.',
    },
    {
      role: 'user',
      content: [
        'Sentence:',
        input.sentence,
        '',
        'Return JSON with exactly this field:',
        '{"translation": "the full sentence translated into the target language"}',
      ].join('\n'),
    },
  ];
}

/** Parses `{ translation }`, rejecting empty or non-string values. */
export function parseTranslateSentenceResult(content: string): TranslateSentenceResult {
  const root = parseJsonObject(content);
  const translation = root.translation;
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new LlmError('invalid_response', 'LLM response is missing "translation"', {
      retryable: false,
    });
  }
  return { translation: translation.trim() };
}
