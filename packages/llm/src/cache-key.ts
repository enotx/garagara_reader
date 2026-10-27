import type { LlmTask } from './prompts.js';

export interface LlmCacheKeyInput {
  task: LlmTask;
  /** Sentence text exactly as stored in the book. */
  sentence: string;
  /** Target surface for wordInContext; omitted for sentence-level tasks. */
  targetWord?: string;
  /** Learning language, for example `en`. */
  l2: string;
  /** Explanation language, for example `zh`. */
  explainLang: string;
  model: string;
  promptVersion: string;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Builds the cache key from Spec §9.3: sha256 over
 * (task, sentence, target word, L2, explain language, model, promptVersion).
 * The JSON array fixes field order and encodes a missing target word as null.
 */
export async function buildLlmCacheKey(input: LlmCacheKeyInput): Promise<string> {
  const fields = [
    input.task,
    input.sentence,
    input.targetWord ?? null,
    input.l2,
    input.explainLang,
    input.model,
    input.promptVersion,
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(fields));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}
