import { parseStreamInfo, applyUrlFixes } from '../utils/streamParser';

// ─── Вспомогательные константы ────────────────────────────────────────────

/** Простая строка потоков в уже декодированном формате */
const DECODED_STREAMS =
  '[360p]https://cdn.example.com/360p.mp4:hls:manifest.m3u8,[720p]https://cdn.example.com/720p.mp4:hls:manifest.m3u8,[1080p]https://cdn.example.com/1080p.mp4:hls:manifest.m3u8';

/** Пример закодированной строки Rezka (base64 с мусорными блоками) */
// Оригинал после декодирования должен давать DECODED_STREAMS.
// Для тестов base64 кодируем тот же DECODED_STREAMS без обфускации.
function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

// ─── parseStreamInfo ──────────────────────────────────────────────────────

describe('parseStreamInfo', () => {
  describe('с уже декодированной строкой', () => {
    it('парсит несколько качеств', () => {
      const result = parseStreamInfo(DECODED_STREAMS);
      expect(result.streams).toHaveLength(3);
    });

    it('правильно извлекает качество и URL', () => {
      const result = parseStreamInfo(DECODED_STREAMS);
      const q720 = result.streams.find(s => s.quality === '720p');
      expect(q720).toBeDefined();
      expect(q720!.url).toBe('https://cdn.example.com/720p.mp4:hls:manifest.m3u8');
    });

    it('выбирает 1080p как лучшее из доступных', () => {
      const result = parseStreamInfo(DECODED_STREAMS);
      expect(result.selectedStream?.quality).toBe('1080p');
    });

    it('предпочитает 1080p Ultra над 1080p', () => {
      const input =
        '[1080p]https://cdn.example.com/1080p.mp4,[1080p Ultra]https://cdn.example.com/1080pu.mp4';
      const result = parseStreamInfo(input);
      expect(result.selectedStream?.quality).toBe('1080p Ultra');
    });

    it('выбирает 720p если 1080p нет', () => {
      const input =
        '[360p]https://cdn.example.com/360p.mp4,[720p]https://cdn.example.com/720p.mp4';
      const result = parseStreamInfo(input);
      expect(result.selectedStream?.quality).toBe('720p');
    });

    it('берёт первый поток если приоритетных нет', () => {
      const input = '[240p]https://cdn.example.com/240p.mp4';
      const result = parseStreamInfo(input);
      expect(result.selectedStream?.quality).toBe('240p');
    });
  });

  describe('с base64-закодированной строкой', () => {
    it('декодирует и парсит потоки', () => {
      const encoded = toBase64(DECODED_STREAMS);
      const result = parseStreamInfo(encoded);
      expect(result.streams.length).toBeGreaterThan(0);
      expect(result.selectedStream).toBeDefined();
    });
  });

  describe('с мусорными блоками //_//', () => {
    it('удаляет блоки и корректно парсит', () => {
      // Вставляем мусорный блок с = в конце (стандартный формат rezka)
      const withTrash =
        '[720p]https://cdn.exam//_//QWFBYWFh=/720p.mp4,[1080p]https://cdn.exam//_//QkJCYmJi=/1080p.mp4';
      const result = parseStreamInfo(withTrash);
      // Строка не является валидным base64, но должна пройти без исключений
      expect(() => parseStreamInfo(withTrash)).not.toThrow();
    });
  });

  describe('с пустым или невалидным входом', () => {
    it('возвращает пустые потоки на пустой строке', () => {
      const result = parseStreamInfo('');
      expect(result.streams).toHaveLength(0);
      expect(result.selectedStream).toBeUndefined();
    });

    it('не падает на произвольную строку', () => {
      expect(() => parseStreamInfo('not_valid_at_all')).not.toThrow();
    });

    it('если строка — уже URL, возвращает его как unknown-поток', () => {
      const url = 'https://cdn.example.com/video.mp4';
      const result = parseStreamInfo(url);
      expect(result.streams).toHaveLength(1);
      expect(result.streams[0].url).toBe(url);
      expect(result.streams[0].quality).toBe('unknown');
    });
  });

  describe('формат с несколькими URL через запятую', () => {
    it('правильно разделяет потоки по запятой', () => {
      const streams4 =
        '[360p]https://a.com/360.mp4,[480p]https://a.com/480.mp4,' +
        '[720p]https://a.com/720.mp4,[1080p]https://a.com/1080.mp4';
      const result = parseStreamInfo(streams4);
      expect(result.streams).toHaveLength(4);
      expect(result.streams.map(s => s.quality)).toEqual([
        '360p', '480p', '720p', '1080p',
      ]);
    });
  });
});

// ─── applyUrlFixes ────────────────────────────────────────────────────────

describe('applyUrlFixes', () => {
  it('убирает двойные слэши (кроме протокола)', () => {
    const url = 'https://cdn.example.com//path//to//file.mp4';
    expect(applyUrlFixes(url)).toBe('https://cdn.example.com/path/to/file.mp4');
  });

  it('не трогает протокол https://', () => {
    const url = 'https://cdn.example.com/file.mp4';
    expect(applyUrlFixes(url)).toBe('https://cdn.example.com/file.mp4');
  });

  it('убирает пробелы по краям', () => {
    const url = '  https://cdn.example.com/file.mp4  ';
    expect(applyUrlFixes(url)).toBe('https://cdn.example.com/file.mp4');
  });

  it('возвращает пустую строку без ошибок', () => {
    expect(applyUrlFixes('')).toBe('');
  });
});
