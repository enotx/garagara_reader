import { LlmError } from '@garagara/llm';

import { translate, type AppLanguage } from './i18n.js';

/** Maps provider failures to short localized messages for the reader UI. */
export function describeLlmError(error: unknown, language: AppLanguage): string {
  if (error instanceof LlmError) {
    if (error.kind === 'timeout') {
      return translate(language, 'error.timeout');
    }
    if (error.kind === 'network') {
      return translate(language, 'error.network');
    }
    if (error.kind === 'http' && (error.status === 401 || error.status === 403)) {
      return translate(language, 'error.config');
    }
    if (error.kind === 'invalid_response') {
      return translate(language, 'error.invalidResponse');
    }
    if (error.kind === 'config') {
      return translate(language, 'error.config');
    }
    if (error.kind === 'http') {
      return translate(language, 'error.generic');
    }
    return error.message;
  }
  return error instanceof Error ? error.message : translate(language, 'error.generic');
}
