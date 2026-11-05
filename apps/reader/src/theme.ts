const THEME_VALUES = ['light', 'dark', 'sepia', 'eink'] as const;

export type Theme = (typeof THEME_VALUES)[number];

const THEME_KEY = 'garagara.theme';

/** Theme identifiers; labels live in the i18n dictionary. */
export const THEMES: readonly Theme[] = THEME_VALUES;

export function isTheme(value: string | null | undefined): value is Theme {
  return THEME_VALUES.some((theme) => theme === value);
}

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (isTheme(value)) {
      return value;
    }
  } catch {
    // Storage can be disabled; use the default theme.
  }
  return 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage failures; the theme still applies for this session.
  }
}
