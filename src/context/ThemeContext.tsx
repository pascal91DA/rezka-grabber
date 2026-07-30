import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { contrastText, hexToHsl, hslToHex, normalizeHex } from '../utils/color';

const KEY = 'accent_color_v1';

export const DEFAULT_ACCENT = '#5eb3ff';

export const ACCENT_PRESETS: { label: string; color: string }[] = [
  { label: 'Голубой', color: '#5eb3ff' },
  { label: 'Индиго', color: '#7c8cff' },
  { label: 'Фиолетовый', color: '#b388ff' },
  { label: 'Розовый', color: '#ff7ac6' },
  { label: 'Красный', color: '#ff6b6b' },
  { label: 'Оранжевый', color: '#ff9f45' },
  { label: 'Жёлтый', color: '#ffc857' },
  { label: 'Зелёный', color: '#5ed17a' },
  { label: 'Бирюзовый', color: '#2ecfc0' },
];

export interface AccentPalette {
  /** Основной акцент: текст, иконки, индикаторы загрузки. */
  accent: string;
  /** Насыщенный вариант для залитых кнопок. */
  accentStrong: string;
  /** Тёмная подложка с оттенком акцента. */
  accentSoft: string;
  /** Чуть более светлая подложка (чипы, бейджи). */
  accentSurface: string;
  /** Рамка поверх подложек. */
  accentBorder: string;
  /** Приглушённый вариант: заливка прогресс-баров. */
  accentMuted: string;
  /** Контрастный текст поверх accentStrong. */
  onAccent: string;
}

/**
 * Строит палитру из одного цвета. Коэффициенты подобраны так, чтобы при
 * accent = DEFAULT_ACCENT палитра совпадала с прежними захардкоженными цветами.
 */
export function buildPalette(accentHex: string): AccentPalette {
  const accent = normalizeHex(accentHex) ?? DEFAULT_ACCENT;
  const { h, s, l } = hexToHsl(accent);
  const strong = hslToHex(h, s, l * 0.73);

  return {
    accent,
    accentStrong: strong,
    accentSoft: hslToHex(h, s * 0.5, 23),
    accentSurface: hslToHex(h, s * 0.45, 30),
    accentBorder: hslToHex(h, s * 0.45, 50),
    accentMuted: hslToHex(h, s * 0.58, 39),
    onAccent: contrastText(strong),
  };
}

interface ThemeContextValue extends AccentPalette {
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  ...buildPalette(DEFAULT_ACCENT),
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const stored = raw ? normalizeHex(raw) : null;
        if (stored) setAccentState(stored);
      })
      .catch(() => {});
  }, []);

  const setAccent = useCallback((hex: string) => {
    const norm = normalizeHex(hex);
    if (!norm) return;
    setAccentState(norm);
    AsyncStorage.setItem(KEY, norm).catch(() => {});
  }, []);

  const value = useMemo(() => ({ ...buildPalette(accent), setAccent }), [accent, setAccent]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
