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

async function loadEngine(): Promise<{
  sqlite3: ReturnType<typeof SQLite.Factory>;
  vfs: MemoryVFS;
}> {
  const loadModule = new Function('url', 'return import(url)') as (
    url: string,
  ) => Promise<{ default: (config?: object) => Promise<unknown> }>;
  const factoryModule = await loadModule('/wa-sqlite/wa-sqlite.mjs');
  const module = await factoryModule.default();
  const sqlite3 = SQLite.Factory(module);
  const vfs = new MemoryVFS();
  sqlite3.vfs_register(vfs as unknown as Parameters<typeof sqlite3.vfs_register>[0], true);
  return { sqlite3, vfs };
}

/** Web adapter backed by wa-sqlite's in-memory VFS for browser development. */
export class BrowserSqliteAdapter implements SqliteAdapter {
  constructor(
    private readonly sqlite3: ReturnType<typeof SQLite.Factory>,
    private readonly database: number,
    private readonly vfs: MemoryVFS,
  ) {}

  static async open(databaseName = 'garagara'): Promise<BrowserSqliteAdapter> {
    const { sqlite3, vfs } = await loadEngine();
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

/**
 * Opens a read-only SQLite database supplied as bytes. Used for the bundled
 * dictionary, which is shipped as a plain SQLite file.
 */
export async function openBrowserSqliteFromBytes(
  bytes: Uint8Array,
  fileName = 'memory.sqlite',
): Promise<SqliteAdapter> {
  const { sqlite3, vfs } = await loadEngine();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const data = copy.buffer;
  const files = vfs as unknown as {
    mapNameToFile: Map<string, { name: string; flags: number; size: number; data: ArrayBuffer }>;
  };
  files.mapNameToFile.set(fileName, { name: fileName, flags: 0, size: bytes.length, data });
  const database = await sqlite3.open_v2(fileName);
  const adapter = new BrowserSqliteAdapter(sqlite3, database, vfs);
  await adapter.exec('PRAGMA journal_mode = MEMORY');
  await adapter.exec('PRAGMA busy_timeout = 5000');
  return adapter;
}
