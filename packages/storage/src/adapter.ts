export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Minimal async SQLite surface shared by node:sqlite and wa-sqlite adapters.
 * Keys must match exactly to keep migrations identical on every platform.
 */
export interface SqliteAdapter {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
