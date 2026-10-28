export interface DictionaryResponse {
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type DictionaryFetch = (path: string) => Promise<DictionaryResponse>;

const SQLITE_MAGIC = 'SQLite format 3';

/**
 * Loads the first available SQLite dictionary from the candidate paths.
 * A missing file rejects the fetch on the Capacitor asset scheme, so each
 * candidate is isolated and skipped on either a rejection or a non-OK status.
 */
export async function loadDictionaryBytes(
  paths: readonly string[],
  fetchBytes: DictionaryFetch,
): Promise<Uint8Array | undefined> {
  for (const path of paths) {
    let response: DictionaryResponse;
    try {
      response = await fetchBytes(path);
    } catch {
      continue;
    }
    if (!response.ok) {
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, SQLITE_MAGIC.length));
    if (magic === SQLITE_MAGIC) {
      return bytes;
    }
  }
  return undefined;
}
