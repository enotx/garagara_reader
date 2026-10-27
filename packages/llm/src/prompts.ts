/**
 * Prompt registry for the MVP LLM tasks (Spec §9.2). Every prompt template
 * carries a version; changing a template requires bumping its version so the
 * cache key from Spec §9.3 changes and old results stop being served.
 */
export const LLM_PROMPT_VERSIONS = {
  wordInContext: 'wordInContext/v1',
  translateSentence: 'translateSentence/v1',
} as const;

export type LlmTask = keyof typeof LLM_PROMPT_VERSIONS;

export function promptVersionFor(task: LlmTask): string {
  return LLM_PROMPT_VERSIONS[task];
}
