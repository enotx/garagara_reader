import { describe, expect, it } from 'vitest';

import { loadDictionaryBytes, type DictionaryFetch } from './dictionary-bytes.js';

function response(body: string, ok = true): Awaited<ReturnType<DictionaryFetch>> {
  return {
    ok,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

describe('loadDictionaryBytes', () => {
  it('skips a rejected fetch and returns the next valid SQLite file', async () => {
    const fetchBytes: DictionaryFetch = async (path) => {
      if (path === '/dictionary.sqlite') {
        throw new TypeError('Load failed');
      }
      return response('SQLite format 3\u0000demo');
    };

    const bytes = await loadDictionaryBytes(
      ['/dictionary.sqlite', '/dictionary-demo.sqlite'],
      fetchBytes,
    );

    expect(bytes).toBeDefined();
    expect(new TextDecoder().decode(bytes?.slice(0, 15))).toBe('SQLite format 3');
  });

  it('skips a non-OK response and keeps looking', async () => {
    const fetchBytes: DictionaryFetch = async (path) =>
      path === '/dictionary.sqlite'
        ? response('not found', false)
        : response('SQLite format 3\u0000demo');

    const bytes = await loadDictionaryBytes(
      ['/dictionary.sqlite', '/dictionary-demo.sqlite'],
      fetchBytes,
    );

    expect(bytes).toBeDefined();
  });

  it('rejects a non-SQLite payload and returns the next one', async () => {
    const fetchBytes: DictionaryFetch = async (path) =>
      path === '/dictionary.sqlite'
        ? response('<html>index</html>')
        : response('SQLite format 3\u0000demo');

    const bytes = await loadDictionaryBytes(
      ['/dictionary.sqlite', '/dictionary-demo.sqlite'],
      fetchBytes,
    );

    expect(new TextDecoder().decode(bytes?.slice(0, 15))).toBe('SQLite format 3');
  });

  it('returns undefined when every candidate fails', async () => {
    const fetchBytes: DictionaryFetch = async () => {
      throw new TypeError('Load failed');
    };

    await expect(
      loadDictionaryBytes(['/dictionary.sqlite', '/dictionary-demo.sqlite'], fetchBytes),
    ).resolves.toBeUndefined();
  });
});
