import { extractStreamsFromHtml, parseTranslatorSlugs } from '../services/rezkaService';

// ─── Фикстуры HTML ────────────────────────────────────────────────────────

/** HTML с одним блоком streams в скрипте initCDNSeriesEvents */
function makeHtmlWithStreams(streamsValue: string): string {
  return `
<html>
<body>
<script>
sof.tv.initCDNSeriesEvents(456, 0, {
  "streams": "${streamsValue}",
  "season": "1",
  "episode": "1"
}, {});
</script>
</body>
</html>`;
}

/** HTML с переводчиками */
const HTML_WITH_TRANSLATORS = `
<html>
<body>
<ul id="translators-list">
  <li data-translator_id="56" title="Дублированный" class="b-translator__item active">Дублированный</li>
  <li data-translator_id="238" title="Оригинал" class="b-translator__item">Оригинал</li>
  <li data-translator_id="111" title="Кубик в кубе" class="b-translator__item">Кубик в кубе</li>
</ul>
<ul id="simple-seasons-tabs">
  <li data-tab_id="1">Сезон 1</li>
  <li data-tab_id="2">Сезон 2</li>
</ul>
<div id="simple-episodes-tabs">
  <div>
    <li data-season_id="1" data-episode_id="1">Серия 1</li>
    <li data-season_id="1" data-episode_id="2">Серия 2</li>
    <li data-season_id="2" data-episode_id="1">Серия 1</li>
  </div>
</div>
<a href="/films/5278-mandalorian-2019/56-dublyazh/1-season.html">сезон 1</a>
<a href="/films/5278-mandalorian-2019/238-original/1-season.html">сезон 1</a>
<a href="/films/5278-mandalorian-2019/111-kubik/1-season.html">сезон 1</a>
</body>
</html>`;

/** HTML без блока streams */
const HTML_WITHOUT_STREAMS = `<html><body><p>Ничего нет</p></body></html>`;

// ─── extractStreamsFromHtml ────────────────────────────────────────────────

describe('extractStreamsFromHtml', () => {
  it('извлекает значение streams из script-блока', () => {
    const streamsValue = '[720p]https:\\/\\/cdn.example.com\\/video.mp4';
    const html = makeHtmlWithStreams(streamsValue);
    const result = extractStreamsFromHtml(html);
    expect(result).not.toBeNull();
    // Слэши должны быть разэскейплены
    expect(result).toContain('https://cdn.example.com/video.mp4');
  });

  it('возвращает null если streams не найдены', () => {
    const result = extractStreamsFromHtml(HTML_WITHOUT_STREAMS);
    expect(result).toBeNull();
  });

  it('корректно обрабатывает экранированные слэши \\/', () => {
    const html = makeHtmlWithStreams(
      '[1080p]https:\\/\\/cdn.example.com\\/hd\\/video.m3u8'
    );
    const result = extractStreamsFromHtml(html);
    expect(result).toBe('[1080p]https://cdn.example.com/hd/video.m3u8');
  });

  it('корректно парсит несколько качеств через запятую', () => {
    const value =
      '[360p]https:\\/\\/cdn.example.com\\/360.mp4,[720p]https:\\/\\/cdn.example.com\\/720.mp4';
    const html = makeHtmlWithStreams(value);
    const result = extractStreamsFromHtml(html);
    expect(result).toContain('[360p]');
    expect(result).toContain('[720p]');
  });

  it('не падает на пустой HTML', () => {
    expect(() => extractStreamsFromHtml('')).not.toThrow();
    expect(extractStreamsFromHtml('')).toBeNull();
  });

  it('работает когда streams находятся в initCDNMovieEvents', () => {
    const html = `
<script>
sof.tv.initCDNMovieEvents(789, {"streams":"[1080p]https:\\/\\/cdn.example.com\\/film.mp4"}, {});
</script>`;
    const result = extractStreamsFromHtml(html);
    expect(result).not.toBeNull();
    expect(result).toContain('[1080p]');
  });
});

// ─── parseTranslatorSlugs ─────────────────────────────────────────────────

describe('parseTranslatorSlugs', () => {
  it('извлекает slugs для всех переводчиков', () => {
    const slugs = parseTranslatorSlugs(HTML_WITH_TRANSLATORS);
    expect(slugs['56']).toBe('56-dublyazh');
    expect(slugs['238']).toBe('238-original');
    expect(slugs['111']).toBe('111-kubik');
  });

  it('возвращает пустой объект если нет ссылок на сезоны', () => {
    const slugs = parseTranslatorSlugs(HTML_WITHOUT_STREAMS);
    expect(slugs).toEqual({});
  });

  it('не падает на пустой HTML', () => {
    expect(() => parseTranslatorSlugs('')).not.toThrow();
    expect(parseTranslatorSlugs('')).toEqual({});
  });

  it('корректно разбивает составной slug', () => {
    const html = `
<a href="/films/123-some-movie/99-multi-word-slug/1-season.html">сезон</a>
`;
    const slugs = parseTranslatorSlugs(html);
    expect(slugs['99']).toBe('99-multi-word-slug');
  });

  it('первый id из составного slug определяется правильно', () => {
    const html = `
<a href="/films/123-movie/42-some-translator/2-season.html">сезон</a>
<a href="/films/123-movie/42-some-translator/3-season.html">сезон</a>
`;
    const slugs = parseTranslatorSlugs(html);
    // Дублирующиеся ссылки не должны создавать проблем
    expect(slugs['42']).toBe('42-some-translator');
    expect(Object.keys(slugs)).toHaveLength(1);
  });
});

// ─── Интеграция: extractStreamsFromHtml + parseStreamInfo ─────────────────

describe('Интеграция: извлечение и парсинг потоков из HTML', () => {
  it('полный цикл: HTML → streams string → StreamInfo', () => {
    const { parseStreamInfo } = require('../utils/streamParser');

    const html = makeHtmlWithStreams(
      '[360p]https:\\/\\/cdn.example.com\\/360.mp4,[1080p]https:\\/\\/cdn.example.com\\/1080.mp4'
    );

    const raw = extractStreamsFromHtml(html);
    expect(raw).not.toBeNull();

    const info = parseStreamInfo(raw!);
    expect(info.streams).toHaveLength(2);
    expect(info.selectedStream?.quality).toBe('1080p');
    expect(info.selectedStream?.url).toBe('https://cdn.example.com/1080.mp4');
  });
});
