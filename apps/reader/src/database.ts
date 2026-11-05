import type { SqliteAdapter } from '@garagara/storage';
import { migrate } from '@garagara/storage';
import { BrowserSqliteAdapter } from '@garagara/storage/browser';
import { Capacitor } from '@capacitor/core';

let databasePromise: Promise<SqliteAdapter> | undefined;
let snapshotFlushInstalled = false;

function installSnapshotFlush(adapter: BrowserSqliteAdapter): void {
  if (snapshotFlushInstalled || typeof window === 'undefined') {
    return;
  }
  snapshotFlushInstalled = true;
  const flush = (): void => {
    void adapter.flushSnapshot().catch(() => undefined);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });
}

/** Opens the persistent native database on iOS, or the snapshotted web adapter. */
export function openDatabase(): Promise<SqliteAdapter> {
  if (!databasePromise) {
    databasePromise = (async () => {
      if (Capacitor.isNativePlatform()) {
        const adapter = await (await import('./native-sqlite.js')).openNativeSqlite();
        await migrate(adapter);
        return adapter;
      }
      const adapter = await BrowserSqliteAdapter.open();
      installSnapshotFlush(adapter);
      await migrate(adapter);
      return adapter;
    })();
  }
  return databasePromise;
}
