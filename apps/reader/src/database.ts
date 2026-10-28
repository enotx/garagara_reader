import type { SqliteAdapter } from '@garagara/storage';
import { migrate } from '@garagara/storage';
import { BrowserSqliteAdapter } from '@garagara/storage/browser';
import { Capacitor } from '@capacitor/core';

let databasePromise: Promise<SqliteAdapter> | undefined;

/** Opens the persistent native database on iOS, or the in-memory web adapter. */
export function openDatabase(): Promise<SqliteAdapter> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const adapter = Capacitor.isNativePlatform()
        ? await (await import('./native-sqlite.js')).openNativeSqlite()
        : await BrowserSqliteAdapter.open();
      await migrate(adapter);
      return adapter;
    })();
  }
  return databasePromise;
}
