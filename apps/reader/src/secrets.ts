import { Capacitor } from '@capacitor/core';

const API_KEY_STORAGE_KEY = 'garagara.llm.apiKey';

// Web development keeps the key in memory only. Native iOS uses Keychain.
let memoryKey = '';

/** Reads the API key from Keychain on iOS, or the in-memory value on the web. */
export async function readApiKey(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return memoryKey;
  }
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    const result = await SecureStoragePlugin.get({ key: API_KEY_STORAGE_KEY });
    return result.value || '';
  } catch {
    return memoryKey;
  }
}

/** Writes or removes the API key. Never touches SQLite or localStorage. */
export async function writeApiKey(value: string): Promise<void> {
  memoryKey = value;
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
  if (value) {
    await SecureStoragePlugin.set({ key: API_KEY_STORAGE_KEY, value });
  } else {
    await SecureStoragePlugin.remove({ key: API_KEY_STORAGE_KEY });
  }
}
