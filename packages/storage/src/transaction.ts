import type { SqliteAdapter } from './adapter.js';

/** Runs a callback inside BEGIN IMMEDIATE/COMMIT, rolling back on failure. */
export async function withTransaction<T>(
  adapter: SqliteAdapter,
  callback: () => Promise<T>,
): Promise<T> {
  await adapter.exec('BEGIN IMMEDIATE');
  try {
    const result = await callback();
    await adapter.exec('COMMIT');
    return result;
  } catch (error) {
    await adapter.exec('ROLLBACK');
    throw error;
  }
}
