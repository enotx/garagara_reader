export type Theme = 'light' | 'dark' | 'sepia' | 'eink';

const THEME_KEY = 'garagara.theme';

export const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'sepia', label: '护眼' },
  { value: 'eink', label: '电子墨水' },
];

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'sepia' || value === 'eink') {
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
