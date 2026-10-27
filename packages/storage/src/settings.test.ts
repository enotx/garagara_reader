import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';
import { NodeSqliteAdapter } from './node-adapter.js';
import { getSetting, setSetting } from './repository.js';

const adapters: NodeSqliteAdapter[] = [];

async function createAdapter(): Promise<NodeSqliteAdapter> {
  const adapter = new NodeSqliteAdapter();
  adapters.push(adapter);
  await migrate(adapter);
  return adapter;
}

afterEach(async () => {
  for (const adapter of adapters.splice(0)) {
    await adapter.close();
  }
});

describe('settings repository', () => {
  it('returns undefined for a missing key', async () => {
    const adapter = await createAdapter();
    await expect(getSetting(adapter, 'llm.model')).resolves.toBeUndefined();
  });

  it('round-trips JSON values and replaces the same key', async () => {
    const adapter = await createAdapter();
    await setSetting(adapter, 'llm.model', 'gpt-4o-mini', 1_000);
    await expect(getSetting<string>(adapter, 'llm.model')).resolves.toBe('gpt-4o-mini');

    await setSetting(adapter, 'llm.model', 'local-model', 2_000);
    await expect(getSetting<string>(adapter, 'llm.model')).resolves.toBe('local-model');

    const rows = await adapter.all<{ key: string; valueJson: string; updatedAt: number }>(
      'SELECT key, valueJson, updatedAt FROM settings',
    );
    expect(rows).toEqual([{ key: 'llm.model', valueJson: '"local-model"', updatedAt: 2_000 }]);
  });

  it('treats a corrupt row as unset', async () => {
    const adapter = await createAdapter();
    await adapter.run('INSERT INTO settings (key, valueJson, updatedAt) VALUES (?, ?, ?)', [
      'llm.strategy',
      'not json',
      1_000,
    ]);
    await expect(getSetting(adapter, 'llm.strategy')).resolves.toBeUndefined();
  });

  it('rejects values that cannot be serialized', async () => {
    const adapter = await createAdapter();
    await expect(setSetting(adapter, 'bad', undefined)).rejects.toBeInstanceOf(TypeError);
  });
});
