import type { Token } from './tokenize.js';

export interface LemmaFormSource {
  /** Returns ECDICT-derived base forms for an inflected surface form. */
  formsFor?(form: string): readonly string[];
}

const CONSONANT_DOUBLING = /([bcdfghjklmnpqrstvwxyz])\1$/;

function undouble(stem: string): string | undefined {
  const match = CONSONANT_DOUBLING.exec(stem);
  if (!match) {
    return undefined;
  }
  return stem.slice(0, -1);
}

function addCandidate(out: string[], candidate: string): void {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  if (!out.includes(normalized)) {
    out.push(normalized);
  }
}

interface RuleCandidates {
  strong: string[];
  weak: string[];
}

function inflectedEnding(stem: string, out: string[]): void {
  const single = undouble(stem);
  if (single) {
    addCandidate(out, single);
  }
  addCandidate(out, stem);
  addCandidate(out, `${stem}e`);
}

function ruleCandidates(word: string): RuleCandidates {
  const strong: string[] = [];
  const weak: string[] = [];
  const length = word.length;

  if (word.endsWith("'s") && length > 3) {
    addCandidate(strong, word.slice(0, -2));
  }
  if (word.endsWith("s'") && length > 3) {
    addCandidate(strong, word.slice(0, -1));
  }

  if (length > 4 && word.endsWith('ies')) {
    addCandidate(strong, `${word.slice(0, -3)}y`);
  }
  if (length > 4 && word.endsWith('ves')) {
    addCandidate(strong, `${word.slice(0, -3)}f`);
    addCandidate(strong, `${word.slice(0, -3)}fe`);
  }
  if (length > 4 && /(?:ches|shes|xes|zes|sses)$/.test(word)) {
    addCandidate(strong, word.slice(0, -2));
  }
  if (length > 4 && word.endsWith('oes')) {
    addCandidate(strong, word.slice(0, -2));
  }
  if (length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word) && !word.endsWith("'s")) {
    addCandidate(strong, word.slice(0, -1));
  }

  if (length > 4 && word.endsWith('ied')) {
    addCandidate(strong, `${word.slice(0, -3)}y`);
  }
  if (length > 4 && word.endsWith('ed')) {
    inflectedEnding(word.slice(0, -2), strong);
  }
  if (length > 4 && word.endsWith('ing')) {
    inflectedEnding(word.slice(0, -3), strong);
  }

  if (length > 4 && word.endsWith('iest')) {
    addCandidate(strong, `${word.slice(0, -4)}y`);
  }
  if (length > 4 && word.endsWith('ier')) {
    addCandidate(strong, `${word.slice(0, -3)}y`);
  }
  if (length > 3 && word.endsWith('est')) {
    addCandidate(weak, word.slice(0, -3));
    addCandidate(weak, word.slice(0, -2));
  }
  if (length > 3 && word.endsWith('er')) {
    addCandidate(weak, word.slice(0, -2));
    addCandidate(weak, word.slice(0, -1));
  }
  if (length > 3 && word.endsWith('ly')) {
    addCandidate(weak, word.slice(0, -2));
  }

  return { strong, weak };
}

/**
 * Returns candidate lemmas for an English token, most likely first. Dictionary
 * forms (e.g. took -> take, better -> good) win over suffix rules.
 */
export function lemmatize(
  token: Token,
  _context: readonly Token[] = [],
  forms?: LemmaFormSource,
): string[] {
  if (!token.isWord) {
    return [];
  }
  const surface = token.surface.toLowerCase();
  const candidates: string[] = [];
  if (forms?.formsFor) {
    for (const form of forms.formsFor(surface)) {
      addCandidate(candidates, form);
    }
  }
  const rules = ruleCandidates(surface);
  for (const candidate of rules.strong) {
    addCandidate(candidates, candidate);
  }
  addCandidate(candidates, surface);
  for (const candidate of rules.weak) {
    addCandidate(candidates, candidate);
  }
  return candidates;
}

/** Creates a two-argument lemmatizer suitable for the LanguagePack interface. */
export function createLemmatizer(
  forms?: LemmaFormSource,
): (token: Token, context: readonly Token[]) => string[] {
  return (token, context) => lemmatize(token, context, forms);
}
