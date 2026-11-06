import type { Theme } from '../../../shared/theme/theme.js';

export const EDGE_TURN_GUTTER = 28;

const EDGE_TURN_KEY = 'garagara.reader.edgeTurn';

/** Parses a stored preference; invalid or missing values fall back to the theme. */
export function parseEdgeTurnPreference(raw: string | null): boolean | undefined {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return undefined;
}

/** Edge tapping defaults on for e-ink and off for every other theme. */
export function resolveEdgeTurn(preference: boolean | undefined, theme: Theme): boolean {
  return preference ?? theme === 'eink';
}

export function readEdgeTurnPreference(): boolean | undefined {
  try {
    return parseEdgeTurnPreference(localStorage.getItem(EDGE_TURN_KEY));
  } catch {
    return undefined;
  }
}

export function writeEdgeTurnPreference(value: boolean): void {
  try {
    localStorage.setItem(EDGE_TURN_KEY, String(value));
  } catch {
    // Ignore storage failures; the in-memory setting still applies.
  }
}
