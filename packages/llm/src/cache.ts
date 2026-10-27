import type { SqliteAdapter } from '@garagara/storage';

import { buildLlmCacheKey, type LlmCacheKeyInput } from './cache-key.js';

interface LlmCacheRow {
  resultJson: string;
}

export interface LlmCacheOptions {
  /** Injectable clock for deterministic `createdAt` values. */
  now?: () => number;
}

/**
 * Persistent LLM result cache backed by the `llm_cache` table (Spec §4.3).
 * A cache key already encodes the prompt version, so bumping a prompt makes
 * old rows unreachable without deleting them.
 */
export class LlmCache {
  private readonly adapter: SqliteAdapter;
  private readonly now: () => number;

  constructor(adapter: SqliteAdapter, options: LlmCacheOptions = {}) {
    this.adapter = adapter;
    this.now = options.now ?? Date.now;
  }

  /** Returns the cached JSON result, or undefined on a miss or unreadable row. */
  async get<T>(input: LlmCacheKeyInput): Promise<T | undefined> {
    const key = await buildLlmCacheKey(input);
    const row = await this.adapter.get<LlmCacheRow>(
      'SELECT resultJson FROM llm_cache WHERE key = ?',
      [key],
    );
    if (!row) {
      return undefined;
    }
    try {
      return JSON.parse(row.resultJson) as T;
    } catch {
      return undefined;
    }
  }

  /** Stores a JSON result and returns the derived cache key. */
  async set<T>(input: LlmCacheKeyInput, result: T): Promise<string> {
    const key = await buildLlmCacheKey(input);
    const resultJson = JSON.stringify(result);
    if (resultJson === undefined) {
      throw new TypeError('LLM cache result must be JSON-serializable');
    }
    await this.adapter.run(
      `INSERT INTO llm_cache (key, task, resultJson, model, promptVersion, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         task = excluded.task,
         resultJson = excluded.resultJson,
         model = excluded.model,
         promptVersion = excluded.promptVersion,
         createdAt = excluded.createdAt`,
      [key, input.task, resultJson, input.model, input.promptVersion, this.now()],
    );
    return key;
  }
}
