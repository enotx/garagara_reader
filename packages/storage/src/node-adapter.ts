import { DatabaseSync, type StatementSync } from 'node:sqlite';

import type { RunResult, SqliteAdapter, SqlValue } from './adapter.js';

function statement(database: DatabaseSync, sql: string): StatementSync {
  return database.prepare(sql);
}

/** Node.js adapter backed by the built-in node:sqlite module. */
export class NodeSqliteAdapter implements SqliteAdapter {
  private readonly database: DatabaseSync;

  constructor(path = ':memory:') {
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON');
    this.database.exec('PRAGMA busy_timeout = 5000');
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const result = statement(this.database, sql).run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async get<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | undefined> {
    const row = statement(this.database, sql).get(...params);
    return row === undefined ? undefined : (row as unknown as T);
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return statement(this.database, sql).all(...params) as unknown as T[];
  }

  async close(): Promise<void> {
    this.database.close();
  }
}
