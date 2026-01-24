import type { StreamInfo, StreamQuality } from '../types/Stream';

/**
 * Base64 декодирование для React Native (atob не доступен)
 */
function base64Decode(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = input.replace(/=+$/, '');
  let output = '';

  // Если длина % 4 === 1, это невалидный base64. Обрезаем лишний символ.
  if (str.length % 4 === 1) {
    str = str.slice(0, -1);
  }

  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    buffer = chars.indexOf(buffer);
    if (buffer === -1) continue;
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }

  return output;
}

/**
 * Удаляет мусорные блоки //_// + base64-мусор из строки
 * Мусорные блоки декодируются в символы @#!$^
 */
function removeTrashBlocks(str: string): string {
  const marker = '//_//';
  let result = str;

  while (result.includes(marker)) {
    const idx = result.indexOf(marker);
    const after = result.slice(idx + marker.length);

    // Ищем = в первых 50 символах (признак полного base64 блока мусора)
    const eqMatch = after.match(/^[A-Za-z0-9+/]{1,50}?={1,2}/);

    if (eqMatch) {
      // Удаляем //_// + мусорный блок до = включительно
      result = result.slice(0, idx) + result.slice(idx + marker.length + eqMatch[0].length);
    } else {
      // Мусорный блок без = обычно 16-20 символов
      // Удаляем //_// + первые 16 символов мусора
      const trashLen = Math.min(16, after.length);
      result = result.slice(0, idx) + result.slice(idx + marker.length + trashLen);
    }
  }

  return result;
}

/**
 * Декодирует закодированный URL от Rezka
 * Rezka использует base64 с вставленными мусорными блоками для обфускации
 */
function decodeUrl(encoded: string): string {
  if (!encoded) return '';

  console.log('[decodeUrl] RAW INPUT:', encoded.substring(0, 200));
  console.log('[decodeUrl] RAW INPUT LENGTH:', encoded.length);

  // Если уже URL - возвращаем как есть
  if (/^https?:\/\//.test(encoded)) {
    return encoded;
  }

  let result = encoded;

  // Шаг 1: Удаляем мусорные блоки //_// + trash
  result = removeTrashBlocks(result);
  console.log('[decodeUrl] After removeTrashBlocks:', result.substring(0, 200));

  // Шаг 2: Удаляем символы обфускации из base64 (символ + следующий за ним)
  result = result.replace(/[#@!$^]./g, '');
  console.log('[decodeUrl] After remove obfuscation:', result.substring(0, 200));

  // Шаг 3: Удаляем все невалидные base64 символы (пробелы, переносы и т.д.)
  result = result.replace(/[^A-Za-z0-9+/=]/g, '');
  console.log('[decodeUrl] After cleanup, length:', result.length);

  // Шаг 4: Добавляем padding если нужно (base64 должен иметь длину кратную 4)
  const padding = result.length % 4;
  if (padding > 0) {
    result += '='.repeat(4 - padding);
  }

  // Шаг 5: Декодируем base64
  try {
    result = base64Decode(result);
    console.log('[decodeUrl] DECODED:', result.substring(0, 300));
  } catch (e) {
    console.error('[decodeUrl] Failed to decode base64:', e);
    console.error('[decodeUrl] Input length:', result.length, 'Input (first 100 chars):', result.substring(0, 100));
    return encoded;
  }

  // Шаг 6: Удаляем мусорные последовательности из декодированного результата
  // Это @#!$^ символы которые остались после декодирования мусорных блоков
  result = result.replace(/[@#!$^]+/g, '');

  return result;
}

/**
 * Парсит строку с потоками в структурированный формат
 * Формат входа: "[720p]https://...,[1080p]https://..." или закодированная строка
 */
export function parseStreamInfo(rawUrl: string): StreamInfo {
  const decoded = decodeUrl(rawUrl);
  const streams: StreamQuality[] = [];

  // Разбиваем по запятой и парсим каждый поток
  // Формат: [качество]url или [качество]url
  const parts = decoded.split(',');

  for (const part of parts) {
    const match = part.match(/\[([^\]]+)\](https?:\/\/[^\s,]+)/);
    if (match) {
      streams.push({
        quality: match[1],
        url: match[2],
      });
    }
  }

  // Если не удалось распарсить - возвращаем как один поток
  if (streams.length === 0 && decoded) {
    streams.push({
      quality: 'unknown',
      url: decoded,
    });
  }

  // Приоритет качества для выбора лучшего
  const qualityPriority = ['1080p Ultra', '1080p', '720p', '480p', '360p'];

  // Выбираем лучший поток
  let selectedStream: StreamQuality | undefined;
  for (const quality of qualityPriority) {
    const found = streams.find(s => s.quality === quality);
    if (found) {
      selectedStream = found;
      break;
    }
  }

  // Если не нашли по приоритету - берём первый
  if (!selectedStream && streams.length > 0) {
    selectedStream = streams[0];
  }

  return {
    streams,
    selectedStream,
  };
}

/**
 * Применяет фиксы к URL для корректного воспроизведения
 */
export function applyUrlFixes(url: string): string {
  if (!url) return url;

  let fixed = url;

  // Убираем возможные двойные слэши (кроме протокола)
  fixed = fixed.replace(/([^:])\/\//g, '$1/');

  // Убираем trailing пробелы
  fixed = fixed.trim();

  return fixed;
}

/**
 * Парсит URL видео из ответа API (устаревшая функция, оставлена для совместимости)
 */
export function parseVideoUrlFromResponse(response: string): string | null {
  const streamInfo = parseStreamInfo(response);
  return streamInfo.selectedStream?.url || null;
}
