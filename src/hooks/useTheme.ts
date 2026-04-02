import { useEffect, useState } from 'react';
import { applyTheme, getSystemTheme, readStoredTheme, resolveTheme, type ResolvedTheme, type Theme } from '../lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredTheme()));

  useEffect(() => {
    const syncTheme = () => setResolvedTheme(applyTheme(theme));
    syncTheme();

    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setResolvedTheme(getSystemTheme());
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return { theme, setTheme, resolvedTheme };
}
