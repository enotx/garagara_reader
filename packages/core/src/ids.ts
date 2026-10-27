const HEX = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX[byte >> 4] ?? '0';
    out += HEX[byte & 0x0f] ?? '0';
  }
  return out;
}

/**
 * Returns the SHA-256 digest of the given bytes as lowercase hex.
 * Uses Web Crypto, which is available in browsers, Node, and iOS WKWebView.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return toHex(new Uint8Array(digest));
}

/** Book id per Spec §4.1: the first 32 hex characters of SHA-256. */
export async function contentId(bytes: Uint8Array): Promise<string> {
  return (await sha256Hex(bytes)).slice(0, 32);
}

export function chapterId(bookId: string, chapterIndex: number): string {
  return `${bookId}:c${chapterIndex}`;
}

export function blockId(bookId: string, chapterIndex: number, blockIndex: number): string {
  return `${chapterId(bookId, chapterIndex)}:b${blockIndex}`;
}

export function sentenceId(
  bookId: string,
  chapterIndex: number,
  blockIndex: number,
  sentenceIndex: number,
): string {
  return `${blockId(bookId, chapterIndex, blockIndex)}:s${sentenceIndex}`;
}

export function assetId(bookId: string, index: number): string {
  return `${bookId}:a${index}`;
}

export function noteId(bookId: string, fragment: string): string {
  return `${bookId}:n${fragment}`;
}

/**
 * Generates a UUIDv7. `now` can be injected for tests.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  let timestamp = BigInt(Math.trunc(now));
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
