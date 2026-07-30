export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Приводит #abc / #aabbcc к нормализованному #aabbcc в нижнем регистре. */
export function normalizeHex(hex: string): string | null {
  const m = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) return `#${m}`.toLowerCase();
  return null;
}

export function hexToHsl(hex: string): Hsl {
  const norm = normalizeHex(hex) ?? '#000000';
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 100) / 100;
  const lum = clamp(l, 0, 100) / 100;

  if (sat === 0) {
    const v = Math.round(lum * 255);
    return `#${toHex(v)}${toHex(v)}${toHex(v)}`;
  }

  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const r = hueToRgb(p, q, hue + 1 / 3);
  const g = hueToRgb(p, q, hue);
  const b = hueToRgb(p, q, hue - 1 / 3);

  return `#${toHex(Math.round(r * 255))}${toHex(Math.round(g * 255))}${toHex(Math.round(b * 255))}`;
}

/** Относительная яркость (WCAG) — для выбора контрастного текста поверх цвета. */
export function luminance(hex: string): number {
  const norm = normalizeHex(hex) ?? '#000000';
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(norm.slice(1, 3), 16));
  const g = channel(parseInt(norm.slice(3, 5), 16));
  const b = channel(parseInt(norm.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст двух цветов по WCAG: от 1 (одинаковые) до 21 (чёрный/белый). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Тёмный или светлый текст — тот, что читается поверх фона лучше. */
export function contrastText(background: string, dark = '#111111', light = '#ffffff'): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

function hueToRgb(p: number, q: number, t: number): number {
  let v = t;
  if (v < 0) v += 1;
  if (v > 1) v -= 1;
  if (v < 1 / 6) return p + (q - p) * 6 * v;
  if (v < 1 / 2) return q;
  if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
  return p;
}

function toHex(v: number): string {
  return clamp(v, 0, 255).toString(16).padStart(2, '0');
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
