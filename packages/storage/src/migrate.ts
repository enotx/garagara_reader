import type { SqliteAdapter } from './adapter.js';
import { SCHEMA_MIGRATIONS, type Migration } from './schema.js';

export interface MigrateOptions {
  migrations?: readonly Migration[];
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  applied: number[];
}

async function currentVersion(adapter: SqliteAdapter): Promise<number> {
  const row = await adapter.get<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  return row?.version ?? 0;
}

/**
 * Applies pending migrations in a transaction and records each version.
 * Calling it again with no pending migrations is a no-op.
 */
export async function migrate(
  adapter: SqliteAdapter,
  options: MigrateOptions = {},
): Promise<MigrationResult> {
  const migrations = [...(options.migrations ?? SCHEMA_MIGRATIONS)].sort(
    (a, b) => a.version - b.version,
  );
  const now = options.now ?? Date.now;

  await adapter.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt INTEGER NOT NULL)',
  );
  const fromVersion = await currentVersion(adapter);
  let version = fromVersion;
  const applied: number[] = [];

  for (const migration of migrations) {
    if (migration.version <= version) {
      continue;
    }
    await adapter.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.statements) {
        await adapter.exec(statement);
      }
      await adapter.run('INSERT INTO schema_migrations (version, appliedAt) VALUES (?, ?)', [
        migration.version,
        now(),
      ]);
      await adapter.exec('COMMIT');
      version = migration.version;
      applied.push(migration.version);
    } catch (error) {
      await adapter.exec('ROLLBACK');
      throw error;
    }
  }

  return { fromVersion, toVersion: version, applied };
}
