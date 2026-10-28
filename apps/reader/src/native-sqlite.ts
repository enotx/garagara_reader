import type { SqliteAdapter, RunResult, SqlValue } from '@garagara/storage';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';

const DATABASE = 'garagara';

/**
 * SQLite adapter backed by the Capacitor SQLite plugin. The database file lives
 * in the app sandbox and persists across launches. The high-level connection
 * wrapper is used so iOS column rows are normalized before reaching callers.
 */
export class NativeSqliteAdapter implements SqliteAdapter {
  private constructor(
    private readonly connection: SQLiteConnection,
    private readonly database: SQLiteDBConnection,
    private readonly name: string,
  ) {}

  static async open(name = DATABASE): Promise<NativeSqliteAdapter> {
    const connection = new SQLiteConnection(CapacitorSQLite);
    const database = await connection.createConnection(name, false, 'no-encryption', 1, false);
    await database.open();
    return new NativeSqliteAdapter(connection, database, name);
  }

  async exec(sql: string): Promise<void> {
    await this.database.execute(sql, false);
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const result = await this.database.run(sql, [...params], false);
    return {
      changes: result.changes?.changes ?? 0,
      lastInsertRowid: result.changes?.lastId ?? 0,
    };
  }

  async get<T>(sql: string, params: readonly SqlValue[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const result = await this.database.query(sql, [...params]);
    return (result.values ?? []) as T[];
  }

  async close(): Promise<void> {
    await this.database.close();
    await this.connection.closeConnection(this.name, false);
  }
}

export async function openNativeSqlite(): Promise<SqliteAdapter> {
  return NativeSqliteAdapter.open();
}
