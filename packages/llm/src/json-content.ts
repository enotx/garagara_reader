import { LlmError } from './provider.js';

/**
 * Parses a JSON object out of an LLM reply, accepting an optional markdown
 * fence. Used by every task so malformed output fails with a single error kind.
 */
export function parseJsonObject(content: string): Record<string, unknown> {
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
