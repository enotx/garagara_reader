const SNAPSHOT_DATABASE = 'garagara-reader-snapshots';
const SNAPSHOT_STORE = 'databases';
const SNAPSHOT_VERSION = 1;

function openSnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SNAPSHOT_DATABASE, SNAPSHOT_VERSION);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(SNAPSHOT_STORE);
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

function toBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return undefined;
}

/** Reads the last browser snapshot for a SQLite database name. */
export async function loadBrowserSnapshot(name: string): Promise<Uint8Array | undefined> {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }
  try {
    const database = await openSnapshotDatabase();
    try {
      const value = await requestResult(
        database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).get(name),
      );
      return toBytes(value);
    } finally {
      database.close();
    }
  } catch {
    return undefined;
  }
}

/** Stores a full SQLite database image so the web build survives a reload. */
export async function saveBrowserSnapshot(name: string, bytes: Uint8Array): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }
  const database = await openSnapshotDatabase();
  try {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    transaction.objectStore(SNAPSHOT_STORE).put(bytes, name);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
