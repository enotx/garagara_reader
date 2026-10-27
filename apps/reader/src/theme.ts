const THEME_VALUES = ['light', 'dark', 'sepia', 'eink'] as const;

export type Theme = (typeof THEME_VALUES)[number];

export interface ThemeOption {
  value: Theme;
  label: string;
  description: string;
}

const THEME_KEY = 'garagara.theme';

/**
 * Theme registry. Add a value here and a matching
 * `:root[data-theme='…']` token block in styles.css to introduce a theme.
 */
export const THEMES: readonly ThemeOption[] = [
  { value: 'light', label: '浅色', description: '暖白纸张' },
  { value: 'dark', label: '深色', description: '夜间阅读' },
  { value: 'sepia', label: '护眼', description: '低蓝光暖纸' },
  { value: 'eink', label: '电子墨水', description: '无动画高对比' },
];

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
