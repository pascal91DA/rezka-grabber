import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Список зеркал rezka. Разметка и пути у зеркал совпадают, поэтому URL фильма
 * переносится между зеркалами простой заменой origin.
 */
export const MIRRORS: { label: string; url: string }[] = [
  { label: 'rezka.ag', url: 'https://rezka.ag' },
  { label: 'rezka-ua.tv', url: 'https://rezka-ua.tv' },
];

/** 'auto' — основное зеркало с автопереключением на следующее при недоступности. */
export type MirrorSetting = 'auto' | string;

const KEY = 'mirror_setting_v1';

let setting: MirrorSetting = 'auto';
let activeUrl = MIRRORS[0].url;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeMirror(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMirrorSetting(): MirrorSetting {
  return setting;
}

/** Origin зеркала, к которому сейчас идут запросы. */
export function getActiveMirror(): string {
  return activeUrl;
}

export function isAutoMirror(): boolean {
  return setting === 'auto';
}

export async function loadMirrorSetting(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && (stored === 'auto' || MIRRORS.some((m) => m.url === stored))) {
      setting = stored;
      activeUrl = stored === 'auto' ? MIRRORS[0].url : stored;
      notify();
    }
  } catch {
    // остаёмся на значениях по умолчанию
  }
}

export function setMirrorSetting(value: MirrorSetting): void {
  setting = value;
  activeUrl = value === 'auto' ? MIRRORS[0].url : value;
  notify();
  AsyncStorage.setItem(KEY, value).catch(() => {});
}

/**
 * В режиме «Авто» переключает активное зеркало на следующее после `failedUrl`.
 * Возвращает новое зеркало или null, если переключаться некуда.
 */
export function switchToNextMirror(failedUrl: string): string | null {
  if (setting !== 'auto') return null;
  const idx = MIRRORS.findIndex((m) => m.url === failedUrl);
  const next = MIRRORS[(idx + 1) % MIRRORS.length];
  if (!next || next.url === failedUrl) return null;
  activeUrl = next.url;
  console.log('[mirror] переключение на', activeUrl);
  notify();
  return activeUrl;
}

/** Origin известного зеркала, с которого начинается url, либо null. */
export function findMirrorOrigin(url: string): string | null {
  return MIRRORS.find((m) => url === m.url || url.startsWith(`${m.url}/`))?.url ?? null;
}

/** Переносит URL любого известного зеркала на `target` (по умолчанию — активное). */
export function toMirror(url: string, target: string = activeUrl): string {
  const origin = findMirrorOrigin(url);
  return origin ? target + url.slice(origin.length) : url;
}

/** Хост зеркала без протокола: https://rezka.ag → rezka.ag. */
export function mirrorHost(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
