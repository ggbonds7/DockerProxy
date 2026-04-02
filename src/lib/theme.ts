export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'system';
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return resolveTheme(theme);
  const root = document.documentElement;
  const resolved = resolveTheme(theme);

  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage write errors
  }

  return resolved;
}
