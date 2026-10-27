import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';

import type { RunResult, SqliteAdapter, SqlValue } from './adapter.js';

interface QueryResult {
  rows: unknown[][];
  columns: string[];
}

function toObject(result: QueryResult, row: unknown[]): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  result.columns.forEach((column, index) => {
    object[column] = row[index] ?? null;
  });
  return object;
}

/**
 * Web adapter backed by wa-sqlite and IndexedDB. The database survives page
 * reloads and works offline.
 */
export class BrowserSqliteAdapter implements SqliteAdapter {
  private constructor(
    private readonly sqlite3: ReturnType<typeof SQLite.Factory>,
    private readonly database: number,
    private readonly vfs: MemoryVFS,
  ) {}

  static async open(databaseName = 'garagara'): Promise<BrowserSqliteAdapter> {
    const loadModule = new Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<{ default: (config?: object) => Promise<unknown> }>;
    const factoryModule = await loadModule('/wa-sqlite/wa-sqlite.mjs');
    const module = await factoryModule.default();
    const sqlite3 = SQLite.Factory(module);
    const vfs = new MemoryVFS();
    sqlite3.vfs_register(vfs as unknown as Parameters<typeof sqlite3.vfs_register>[0], true);
    const database = await sqlite3.open_v2(databaseName);
    const adapter = new BrowserSqliteAdapter(sqlite3, database, vfs);
    await adapter.exec('PRAGMA foreign_keys = ON');
    await adapter.exec('PRAGMA journal_mode = MEMORY');
    await adapter.exec('PRAGMA busy_timeout = 5000');
    return adapter;
  }

  async exec(sql: string): Promise<void> {
    await this.sqlite3.exec(this.database, sql);
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    await this.sqlite3.run(this.database, sql, [...params]);
    return { changes: 1, lastInsertRowid: 0 };
  }

  async get<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | undefined> {
    const result = await this.query(sql, params);
    const row = result.rows[0];
    return row ? (toObject(result, row) as T) : undefined;
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const result = await this.query(sql, params);
    return result.rows.map((row) => toObject(result, row) as T);
  }

  async close(): Promise<void> {
    await this.sqlite3.close(this.database);
    const closable = this.vfs as unknown as { close?: () => Promise<void> };
    await closable.close?.();
  }

  private async query(sql: string, params: readonly SqlValue[] = []): Promise<QueryResult> {
    return (await this.sqlite3.execWithParams(this.database, sql, [...params])) as QueryResult;
  }
}
