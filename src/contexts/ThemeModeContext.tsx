import { createContext, useContext, type PropsWithChildren } from 'react';
import { useTheme } from '../hooks/useTheme';

const ThemeModeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  const value = useTheme();
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);

  if (!context) {
    throw new Error('useThemeMode must be used inside ThemeModeProvider');
  }

  return context;
}
