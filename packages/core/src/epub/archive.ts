import { unzipSync } from 'fflate';

export interface ArchiveFile {
  path: string;
  data: Uint8Array;
}

export interface EpubArchive {
  entries: Map<string, Uint8Array>;
  read(path: string): Uint8Array | undefined;
  readText(path: string): string | undefined;
}

export class InvalidEpubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEpubError';
  }
}

function normalizeEntryName(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function openEpubArchive(data: Uint8Array): EpubArchive {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch (error) {
    throw new InvalidEpubError(`Not a valid ZIP/EPUB file: ${String(error)}`);
  }

  const entries = new Map<string, Uint8Array>();
  for (const [rawPath, bytes] of Object.entries(files)) {
    if (rawPath.endsWith('/')) {
      continue;
    }
    const path = normalizeEntryName(rawPath);
    if (!entries.has(path)) {
      entries.set(path, bytes);
    }
  }

  const lowerCaseLookup = new Map<string, string>();
  for (const path of entries.keys()) {
    const key = path.toLowerCase();
    if (!lowerCaseLookup.has(key)) {
      lowerCaseLookup.set(key, path);
    }
  }

  const decoder = new TextDecoder('utf-8');

  return {
    entries,
    read(path) {
      const exact = entries.get(path);
      if (exact) {
        return exact;
      }
      const actual = lowerCaseLookup.get(path.toLowerCase());
      return actual ? entries.get(actual) : undefined;
    },
    readText(path) {
      const bytes = this.read(path);
      if (!bytes) {
        return undefined;
      }
      return decoder.decode(bytes).replace(/^\uFEFF/, '');
    },
  };
}
