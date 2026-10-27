import type { Dictionary, DictionaryEntry } from '@garagara/lang-en';
import { openBrowserSqliteFromBytes } from '@garagara/storage/browser';

interface EntryRow {
  word: string;
  lemma: string;
  translation: string;
  definition: string | null;
  pos: string | null;
  bnc: number | null;
  frq: number | null;
}

let dictionaryPromise: Promise<Dictionary | undefined> | undefined;

async function loadBytes(): Promise<Uint8Array | undefined> {
  for (const path of ['/dictionary.sqlite', '/dictionary-demo.sqlite']) {
    const response = await fetch(path);
    if (!response.ok) {
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const magic = new TextDecoder().decode(bytes.slice(0, 15));
    if (magic === 'SQLite format 3') {
      return bytes;
    }
  }
  return undefined;
}

async function createDictionary(): Promise<Dictionary | undefined> {
  const bytes = await loadBytes();
  if (!bytes) {
    return undefined;
  }
  const database = await openBrowserSqliteFromBytes(bytes, 'dictionary.sqlite');
  const phraseRows = await database.all<{ phrase: string }>('SELECT phrase FROM phrases');
  const formRows = await database.all<{ form: string; lemma: string }>(
    'SELECT form, lemma FROM forms',
  );
  const phrases = new Set(phraseRows.map((row) => row.phrase.toLowerCase()));
  const forms = new Map<string, string[]>();
  for (const row of formRows) {
    const key = row.form.toLowerCase();
    const list = forms.get(key) ?? [];
    if (!list.includes(row.lemma.toLowerCase())) {
      list.push(row.lemma.toLowerCase());
    }
    forms.set(key, list);
  }

  const cache = new Map<string, DictionaryEntry[]>();
  const lookup = async (lemma: string): Promise<DictionaryEntry[]> => {
    const key = lemma.toLowerCase();
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const rows = await database.all<EntryRow>(
      `SELECT word, lemma, translation, definition, pos, bnc, frq
       FROM entries
       WHERE word = ? COLLATE NOCASE OR lemma = ? COLLATE NOCASE
       ORDER BY CASE WHEN word = ? COLLATE NOCASE THEN 0 ELSE 1 END,
                COALESCE(NULLIF(bnc, 0), 999999),
                COALESCE(NULLIF(frq, 0), 999999)
       LIMIT 12`,
      [key, key, key],
    );
    const entries = rows.map((row) => ({
      headword: row.word,
      translation: row.translation,
      ...(row.definition ? { definition: row.definition } : {}),
      ...(row.pos ? { pos: row.pos } : {}),
      ...(row.bnc && row.bnc > 0 ? { bnc: row.bnc } : {}),
      ...(row.frq && row.frq > 0 ? { coca: row.frq } : {}),
    }));
    cache.set(key, entries);
    return entries;
  };

  return {
    lookup: (_lemma, _lang, _explainLang) => lookup(_lemma),
    hasPhrase: (lemmaSeq) => phrases.has(lemmaSeq.join(' ').toLowerCase()),
    formsFor: (form) => forms.get(form.toLowerCase()) ?? [],
  };
}

/** Loads the bundled ECDICT SQLite dictionary once per browser session. */
export function loadDictionary(): Promise<Dictionary | undefined> {
  if (!dictionaryPromise) {
    dictionaryPromise = createDictionary();
  }
  return dictionaryPromise;
}
