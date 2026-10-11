import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './theme';
import { getDb } from '../db';
import { getSetting, setSetting } from '../db/repo';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: lightTheme, mode: 'system', setMode: () => {} });

function readMode(): ThemeMode {
  try {
    const v = getSetting(getDb(), 'theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(readMode);

  const value = useMemo<ThemeContextValue>(() => {
    const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
    return {
      theme: dark ? darkTheme : lightTheme,
      mode,
      setMode: (m: ThemeMode) => {
        setModeState(m);
        try { setSetting(getDb(), 'theme', m); } catch { /* keep in-memory choice */ }
      },
    };
  }, [mode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext).theme;

export function useThemeMode(): { mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  const c = useContext(ThemeContext);
  return { mode: c.mode, setMode: c.setMode };
}