import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const directory = fileURLToPath(new URL('.', import.meta.url));
const temporaryDirectories: string[] = [];

function build(): string {
  const temp = mkdtempSync(join(tmpdir(), 'garagara-dict-'));
  temporaryDirectories.push(temp);
  const output = join(temp, 'dict.sqlite');
  execFileSync('python3', [
    join(directory, 'build_dict.py'),
    '--input',
    join(directory, 'fixtures/sample.csv'),
    '--output',
    output,
  ]);
  return output;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('build_dict.py', () => {
  it('builds entries, lemmas, forms and phrase index', () => {
    const database = new DatabaseSync(build());
    try {
      const entry = database
        .prepare('SELECT word, lemma, translation FROM entries WHERE word = ?')
        .get('took') as Record<string, unknown>;
      expect(entry).toMatchObject({ word: 'took', lemma: 'take' });

      const better = database
        .prepare('SELECT lemma FROM entries WHERE word = ?')
        .get('better') as Record<string, unknown>;
      expect(better.lemma).toBe('good');

      const forms = database
        .prepare('SELECT lemma FROM forms WHERE form = ? ORDER BY lemma')
        .all('children');
      expect(forms).toEqual([{ lemma: 'child' }]);

      expect(database.prepare('SELECT lemma FROM forms WHERE form = ?').get('took')).toEqual({
        lemma: 'take',
      });
      expect(database.prepare('SELECT lemma FROM forms WHERE form = ?').get('better')).toEqual({
        lemma: 'good',
      });
      expect(database.prepare('SELECT lemma FROM forms WHERE form = ?').get('best')).toEqual({
        lemma: 'good',
      });

      expect(
        database.prepare('SELECT token_count FROM phrases WHERE phrase = ?').get('give up'),
      ).toEqual({ token_count: 2 });
      expect(
        database
          .prepare('SELECT token_count FROM phrases WHERE phrase = ?')
          .get('take into account'),
      ).toEqual({ token_count: 3 });

      const meta = database.prepare('SELECT key, value FROM dict_meta ORDER BY key').all();
      expect(meta).toContainEqual({ key: 'license', value: 'MIT' });
      expect(meta).toContainEqual({ key: 'source', value: 'ECDICT' });
      expect(meta).toContainEqual({ key: 'schemaVersion', value: '1' });
    } finally {
      database.close();
    }
  });
});
