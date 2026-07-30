import { buildPalette, DEFAULT_ACCENT, ACCENT_PRESETS } from '../context/ThemeContext';
import { hexToHsl, hslToHex, normalizeHex, luminance, contrastRatio } from '../utils/color';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** Максимальное покомпонентное расхождение двух hex-цветов (0..255). */
function maxChannelDiff(a: string, b: string): number {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
}

describe('color utils', () => {
  it('нормализует короткую и длинную запись', () => {
    expect(normalizeHex('#5EB3FF')).toBe('#5eb3ff');
    expect(normalizeHex('abc')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('not a color')).toBeNull();
  });

  it('hex → hsl → hex возвращает исходный цвет', () => {
    for (const hex of ['#5eb3ff', '#ff6b6b', '#2ecfc0', '#ffffff', '#000000', '#808080']) {
      const { h, s, l } = hexToHsl(hex);
      expect(maxChannelDiff(hslToHex(h, s, l), hex)).toBeLessThanOrEqual(1);
    }
  });

  it('различает светлые и тёмные цвета', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#000000'));
    expect(luminance('#ffc857')).toBeGreaterThan(0.5);
    expect(luminance('#0080ff')).toBeLessThan(0.5);
  });
});

describe('buildPalette', () => {
  it('воспроизводит прежние захардкоженные цвета для акцента по умолчанию', () => {
    const p = buildPalette(DEFAULT_ACCENT);
    // Допуск: производные цвета считаются в HSL, прежние подбирались вручную.
    expect(maxChannelDiff(p.accentStrong, '#007aff')).toBeLessThanOrEqual(16);
    expect(maxChannelDiff(p.accentSoft, '#1f3a5a')).toBeLessThanOrEqual(16);
    expect(maxChannelDiff(p.accentSurface, '#2d4a6e')).toBeLessThanOrEqual(16);
    expect(maxChannelDiff(p.accentBorder, '#4a7ab5')).toBeLessThanOrEqual(16);
    expect(maxChannelDiff(p.accentMuted, '#2a6a9e')).toBeLessThanOrEqual(16);
  });

  it('отдаёт валидные hex для всех пресетов', () => {
    for (const { color } of ACCENT_PRESETS) {
      const p = buildPalette(color);
      for (const value of Object.values(p)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(p.accent).toBe(color);
    }
  });

  it('подбирает наиболее контрастный текст поверх заливки кнопок', () => {
    for (const { color } of ACCENT_PRESETS) {
      const { accentStrong, onAccent } = buildPalette(color);
      const other = onAccent === '#ffffff' ? '#111111' : '#ffffff';
      expect(contrastRatio(accentStrong, onAccent)).toBeGreaterThanOrEqual(
        contrastRatio(accentStrong, other),
      );
    }
    // Светлый акцент (почти белый) должен получить тёмный текст.
    expect(buildPalette('#f5f5f5').onAccent).toBe('#111111');
  });

  it('откатывается на акцент по умолчанию для мусорного значения', () => {
    expect(buildPalette('нет такого цвета').accent).toBe(DEFAULT_ACCENT);
  });

  it('сохраняет тон акцента во всех производных', () => {
    const p = buildPalette('#5ed17a');
    const baseHue = hexToHsl(p.accent).h;
    for (const key of [
      'accentStrong',
      'accentSoft',
      'accentSurface',
      'accentBorder',
      'accentMuted',
    ] as const) {
      expect(Math.abs(hexToHsl(p[key]).h - baseHue)).toBeLessThan(3);
    }
  });
});
