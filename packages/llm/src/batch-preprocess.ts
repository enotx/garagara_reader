import { parseJsonObject } from './json-content.js';
import { LlmError, type ChatMessage } from './provider.js';

export interface BatchPreprocessSentence {
  id: string;
  /** Sentence text exactly as stored in the book. */
  text: string;
}

export interface BatchPreprocessInput {
  sentences: readonly BatchPreprocessSentence[];
  /** Language used for translations and explanations, for example `zh`. */
  explainLang: string;
}

export interface BatchPreprocessPhrase {
  text: string;
  lemma: string;
  meaning: string;
  /** Start offset inside the source sentence (UTF-16). */
  start: number;
  /** End offset inside the source sentence, exclusive (UTF-16). */
  end: number;
}

export interface BatchPreprocessItem {
  id: string;
  translation: string;
  phrases: BatchPreprocessPhrase[];
  hardWords: BatchPreprocessPhrase[];
}

export interface BatchPreprocessResult {
  items: BatchPreprocessItem[];
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Builds the batchPreprocess chat messages from Spec §9.2. Each sentence is
 * sent with its stable id; the model only returns ids and source fragments,
 * never offsets.
 */
export function buildBatchPreprocessMessages(input: BatchPreprocessInput): ChatMessage[] {
  if (input.sentences.length === 0) {
    throw new RangeError('At least one sentence is required');
  }
  const seen = new Set<string>();
  for (const sentence of input.sentences) {
    if (!sentence.id.trim()) {
      throw new RangeError('Sentence id must not be empty');
    }
    if (seen.has(sentence.id)) {
      throw new RangeError(`Duplicate sentence id: ${sentence.id}`);
    }
    if (!sentence.text.trim()) {
      throw new RangeError(`Sentence ${sentence.id} must not be empty`);
    }
    seen.add(sentence.id);
  }

  const payload = input.sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
  }));

  return [
    {
      role: 'system',
      content:
        'You preprocess literature for language learners. ' +
        `Translate and explain in ${languageName(input.explainLang)}. ` +
        'Answer with one JSON object only, without markdown fences or extra text. ' +
        'Never invent words or phrases that are not in the source sentence.',
    },
    {
      role: 'user',
      content: [
        'Sentences:',
        JSON.stringify(payload),
        '',
        'Return JSON with exactly this shape:',
        '{"items":[{"id":"the source id","translation":"full sentence translation","phrases":[{"text":"exact source phrase","lemma":"dictionary form","meaning":"contextual meaning"}],"hardWords":[{"text":"exact source word","lemma":"dictionary form","meaning":"contextual meaning"}]}]}',
        'Include one item for every input id. Use [] when a sentence has no phrases or hard words.',
        'Only include fixed phrases and words that are likely difficult for a learner.',
      ].join('\n'),
    },
  ];
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.trim();
  return text ? text : undefined;
}

function parseSpans(value: unknown, sentence: string): BatchPreprocessPhrase[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const spans: BatchPreprocessPhrase[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const text = readText(record.text);
    const lemma = readText(record.lemma);
    const meaning = readText(record.meaning);
    if (!text || !lemma || !meaning) {
      continue;
    }
    const start = sentence.indexOf(text);
    if (start < 0) {
      continue;
    }
    spans.push({ text, lemma, meaning, start, end: start + text.length });
  }
  return spans;
}

/**
 * Parses the batchPreprocess JSON result. Items with unknown ids or missing
 * translations are dropped; phrases and hard words that do not appear verbatim
 * in the source sentence are discarded (Spec §9.2).
 */
export function parseBatchPreprocessResult(
  content: string,
  sentences: readonly BatchPreprocessSentence[],
): BatchPreprocessResult {
  const root = parseJsonObject(content);
  if (!Array.isArray(root.items)) {
    throw new LlmError('invalid_response', 'LLM response is missing "items"', {
      retryable: false,
    });
  }
  const sources = new Map(sentences.map((sentence) => [sentence.id, sentence.text]));
  const seen = new Set<string>();
  const items: BatchPreprocessItem[] = [];

  for (const entry of root.items) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const id = readText(record.id);
    const translation = readText(record.translation);
    const source = id ? sources.get(id) : undefined;
    if (!id || !translation || source === undefined || seen.has(id)) {
      continue;
    }
    seen.add(id);
    items.push({
      id,
      translation,
      phrases: parseSpans(record.phrases, source),
      hardWords: parseSpans(record.hardWords, source),
    });
  }

  return { items };
}
