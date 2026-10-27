import { importEpub } from './epub/import.js';
import { importTxt } from './txt.js';
import type { ImportedBook } from './types.js';

export interface BookImportOptions {
  title?: string;
  author?: string;
  lang?: string;
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Imports either EPUB or TXT based on the ZIP signature and file extension.
 */
export async function importBook(
  bytes: Uint8Array,
  fileName = 'book',
  options: BookImportOptions = {},
): Promise<ImportedBook> {
  const lowerName = fileName.toLowerCase();
  if (looksLikeZip(bytes) || lowerName.endsWith('.epub')) {
    return importEpub(bytes, fileName, {
      ...(options.title ? { fallbackTitle: options.title } : {}),
    });
  }
  return importTxt(bytes, fileName, options);
}
