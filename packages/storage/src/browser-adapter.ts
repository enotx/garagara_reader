import * as SQLite from 'wa-sqlite';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';

import type { RunResult, SqliteAdapter, SqlValue } from './adapter.js';
import { loadBrowserSnapshot, saveBrowserSnapshot } from './browser-snapshot.js';

interface QueryResult {
  rows: unknown[][];
  columns: string[];
}

interface MemoryFile {
  name: string;
  flags: number;
  size: number;
  data: ArrayBuffer;
}

interface MemoryFileTable {
  mapNameToFile: Map<string, MemoryFile>;
}

const SNAPSHOT_DELAY_MS = 500;

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

function injectSnapshot(vfs: MemoryVFS, name: string, bytes: Uint8Array): void {
  const files = vfs as unknown as MemoryFileTable;
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  files.mapNameToFile.set(name, { name, flags: 0, size: bytes.byteLength, data });
}

/**
 * Web adapter backed by wa-sqlite. SQLite itself runs on an in-memory VFS; the
 * complete database image is snapshotted to IndexedDB after writes settle so
 * the browser build survives reloads without changing the SQLite schema.
 */
export class BrowserSqliteAdapter implements SqliteAdapter {
  private snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshotChain: Promise<void> = Promise.resolve();
  private persistenceEnabled = false;
  private snapshotCounter = 0;

  constructor(
    private readonly sqlite3: ReturnType<typeof SQLite.Factory>,
    private readonly database: number,
    private readonly vfs: unknown,
    private readonly databaseName?: string,
  ) {}

  static async open(databaseName = 'garagara'): Promise<BrowserSqliteAdapter> {
    const { sqlite3, vfs } = await loadEngine();
    const snapshot = await loadBrowserSnapshot(databaseName);
    if (snapshot) {
      injectSnapshot(vfs, databaseName, snapshot);
    }
    const database = await sqlite3.open_v2(databaseName);
    const adapter = new BrowserSqliteAdapter(sqlite3, database, vfs, databaseName);
    await adapter.exec('PRAGMA foreign_keys = ON');
    await adapter.exec('PRAGMA journal_mode = MEMORY');
    await adapter.exec('PRAGMA busy_timeout = 5000');
    adapter.persistenceEnabled = true;
    return adapter;
  }

  async exec(sql: string): Promise<void> {
    await this.sqlite3.exec(this.database, sql);
    this.scheduleSnapshot();
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    await this.sqlite3.run(this.database, sql, [...params]);
    this.scheduleSnapshot();
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

  /** Writes the current database image immediately, bypassing the debounce. */
  async flushSnapshot(): Promise<void> {
    this.cancelSnapshot();
    await this.snapshot();
  }

  async close(): Promise<void> {
    this.cancelSnapshot();
    await this.snapshot().catch(() => undefined);
    await this.sqlite3.close(this.database);
    const closable = this.vfs as { close?: () => Promise<void> } | undefined;
    await closable?.close?.();
  }

  private scheduleSnapshot(): void {
    if (!this.persistenceEnabled || !this.databaseName) {
      return;
    }
    this.cancelSnapshot();
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = undefined;
      void this.snapshot().catch(() => undefined);
    }, SNAPSHOT_DELAY_MS);
  }

  private cancelSnapshot(): void {
    if (this.snapshotTimer !== undefined) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
  }

  private snapshot(): Promise<void> {
    if (!this.persistenceEnabled || !this.databaseName || !this.vfs) {
      return Promise.resolve();
    }
    const databaseName = this.databaseName;
    const files = (this.vfs as Partial<MemoryFileTable>).mapNameToFile;
    if (!files) {
      return Promise.resolve();
    }

    const run = this.snapshotChain.then(async () => {
      const name = `${databaseName}-snapshot-${this.snapshotCounter}`;
      this.snapshotCounter += 1;
      try {
        await this.sqlite3.exec(this.database, `VACUUM INTO '${name}'`);
        const file = files.get(name);
        if (!file) {
          return;
        }
        const bytes = new Uint8Array(file.data.slice(0, file.size));
        files.delete(name);
        await saveBrowserSnapshot(databaseName, bytes);
      } finally {
        files.delete(name);
      }
    });
    this.snapshotChain = run.catch(() => undefined);
    return run;
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
  injectSnapshot(vfs, fileName, copy);
  const database = await sqlite3.open_v2(fileName);
  const adapter = new BrowserSqliteAdapter(sqlite3, database, vfs);
  await adapter.exec('PRAGMA journal_mode = MEMORY');
  await adapter.exec('PRAGMA busy_timeout = 5000');
  return adapter;
}
