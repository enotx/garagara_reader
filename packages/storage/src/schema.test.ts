import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';
import { SCHEMA_VERSION } from './schema.js';

const adapters: NodeSqliteAdapter[] = [];

function createAdapter(): NodeSqliteAdapter {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  return adapter;
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('schema v1 migrations', () => {
  it('creates every table from Spec §4.3', async () => {
    const adapter = createAdapter();
    const result = await migrate(adapter);
    expect(result).toEqual({ fromVersion: 0, toVersion: SCHEMA_VERSION, applied: [1] });

    const tables = await adapter.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((table) => table.name)).toEqual([
      'assets',
      'blocks',
      'books',
      'chapters',
      'chunks',
      'llm_cache',
      'notes',
      'progress',
      'schema_migrations',
      'sentences',
      'settings',
      'vocab',
    ]);
    expect(await adapter.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  });

  it('is idempotent', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    const second = await migrate(adapter);
    expect(second).toEqual({ fromVersion: SCHEMA_VERSION, toVersion: SCHEMA_VERSION, applied: [] });
    const rows = await adapter.all<{ version: number }>('SELECT version FROM schema_migrations');
    expect(rows).toEqual([{ version: 1 }]);
  });

  it('applies versioned migrations in order and rolls back a failed step', async () => {
    const adapter = createAdapter();
    const clock = 1_700_000_000_000;
    const first = await migrate(adapter, {
      migrations: [
        { version: 2, statements: ['ALTER TABLE demo ADD COLUMN label TEXT'] },
        { version: 1, statements: ['CREATE TABLE demo (id INTEGER PRIMARY KEY)'] },
      ],
      now: () => clock,
    });
    expect(first).toEqual({ fromVersion: 0, toVersion: 2, applied: [1, 2] });
    const columns = await adapter.all<{ name: string }>('PRAGMA table_info(demo)');
    expect(columns.map((column) => column.name)).toEqual(['id', 'label']);

    const failed = migrate(adapter, {
      migrations: [
        { version: 3, statements: ['ALTER TABLE demo ADD COLUMN x INTEGER'] },
        { version: 4, statements: ['THIS IS NOT SQL'] },
      ],
    });
    await expect(failed).rejects.toThrow();
    const rows = await adapter.all<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(rows).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
    const after = await adapter.all<{ name: string }>('PRAGMA table_info(demo)');
    expect(after.map((column) => column.name)).toEqual(['id', 'label', 'x']);
  });

  it('records dependencies and uniqueness constraints', async () => {
    const adapter = createAdapter();
    await migrate(adapter);
    await adapter.run(
      'INSERT INTO books (id, title, author, lang, format, pipelineVersion, importedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['b', 'Book', '', 'en', 'txt', 1, 1, 1],
    );
    await adapter.run(
      'INSERT INTO chapters (id, bookId, "index", title, tocLevel) VALUES (?, ?, ?, ?, ?)',
      ['b:c0', 'b', 0, 'One', 1],
    );
    await expect(
      adapter.run(
        'INSERT INTO chapters (id, bookId, "index", title, tocLevel) VALUES (?, ?, ?, ?, ?)',
        ['b:c0b', 'b', 0, 'Duplicate', 1],
      ),
    ).rejects.toThrow();

    await adapter.run('DELETE FROM books WHERE id = ?', ['b']);
    expect(await adapter.all('SELECT * FROM chapters')).toEqual([]);
  });
});
