import {
  extractStreamsFromHtml,
  parseTranslatorSlugs,
  parseTranslatorsList,
  parseTranslatorStats,
} from '../services/rezkaService';

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
    const html = makeHtmlWithStreams('[1080p]https:\\/\\/cdn.example.com\\/hd\\/video.m3u8');
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
      '[360p]https:\\/\\/cdn.example.com\\/360.mp4,[1080p]https:\\/\\/cdn.example.com\\/1080.mp4',
    );

    const raw = extractStreamsFromHtml(html);
    expect(raw).not.toBeNull();

    const info = parseStreamInfo(raw!);
    expect(info.streams).toHaveLength(2);
    expect(info.selectedStream?.quality).toBe('1080p');
    expect(info.selectedStream?.url).toBe('https://cdn.example.com/1080.mp4');
  });
});

// ─── parseTranslatorsList ─────────────────────────────────────────────────

describe('parseTranslatorsList', () => {
  // Фрагмент реальной разметки фильма: список выводится дважды (скрытый b-translator__items
  // со случайным префиксом в href и видимый b-translator__item с "{id}-{slug}.html").
  const base = 'https://hdrezka-home.tv/films/thriller/90250-serdce-zverya-2026-latest';
  const LIST = `
<li style="float: left;"><a title="HDrezka Studio" class="b-translator__items b-prem_translator" data-id="90250" data-translator_id="111" data-camrip="0" data-ads="0" data-director="0" data-cdn_quality="" href="${base}/mibzelxa-hdrezka-studio.html">HDrezka Studio</a></li>
<li style="float: left;"><a title="Дубляж (официальный)" class="b-translator__items" data-id="90250" data-translator_id="56" data-camrip="1" data-ads="0" data-director="0" data-cdn_quality="" href="${base}/mhxivesb-dublyazh.html">Дубляж (официальный)</a></li>
<li style="float: left;"><a title="Украинский дубляж " class="b-translator__items" data-id="90250" data-translator_id="358" data-camrip="0" data-ads="0" data-director="0" href="${base}/miwtrtpn-ukrainskiy-dublyazh.html">Украинский дубляж <img src="ua.png" /></a></li>
<li style="float: left;"><a title="HDrezka Studio" class="b-translator__item b-prem_translator active" data-id="90250" data-translator_id="111" data-camrip="0" data-ads="0" data-director="0" data-cdn_quality="" href="${base}/111-hdrezka-studio.html">HDrezka Studio</a></li>
<li style="float: left;"><a title="Дубляж (официальный)" class="b-translator__item" data-id="90250" data-translator_id="56" data-camrip="1" data-ads="0" data-director="0" data-cdn_quality="" href="${base}/56-dublyazh.html">Дубляж (официальный)</a></li>
<li style="float: left;"><a title="Украинский дубляж " class="b-translator__item" data-id="90250" data-translator_id="358" data-camrip="0" data-ads="0" data-director="0" href="${base}/358-ukrainskiy-dublyazh.html">Украинский дубляж <img src="ua.png" /></a></li>`;

  it('дедуплицирует, помечает премиум и берёт slug вида {id}-...', () => {
    const list = parseTranslatorsList(LIST);
    expect(list.map((t) => t.id)).toEqual(['111', '56', '358']);
    expect(list[0]).toMatchObject({ title: 'HDrezka Studio', premium: true, slug: '111-hdrezka-studio' });
    expect(list[1]).toMatchObject({ premium: false, slug: '56-dublyazh' });
    expect(list[1].flags).toEqual({ camrip: '1', ads: '0', director: '0' });
    expect(list[2]).toMatchObject({ title: 'Украинский дубляж', slug: '358-ukrainskiy-dublyazh' });
  });

  it('поддерживает старую разметку <li> без href', () => {
    const list = parseTranslatorsList(
      '<li data-translator_id="56" title="Дублированный" class="b-translator__item active">Дублированный</li>',
    );
    expect(list).toEqual([
      { id: '56', title: 'Дублированный', slug: undefined, premium: false, flags: { camrip: '0', ads: '0', director: '0' } },
    ]);
  });
});

// ─── parseTranslatorStats ─────────────────────────────────────────────────

describe('parseTranslatorStats', () => {
  // Фрагмент реальной разметки «Не можешь выбрать озвучку?» (Игра престолов).
  const HTML = `<div class="b-translators__title">В русской озвучке от: <span class="b-rgstats__help hd-tooltip-custom" data-attrs='{"animation":"fade","position":"top-right"}' title="&lt;div class='b-rgstats__title'&gt;Популярность озвучек для данного сериала&lt;/div&gt;&lt;ul class=&quot;b-rgstats__list&quot;&gt;&lt;li class=&quot;b-rgstats__list_item&quot;&gt;&lt;div class=&quot;inner&quot;&gt;&lt;div class=&quot;title&quot;&gt;HDrezka Studio&lt;/div&gt;&lt;div class=&quot;bar&quot; style=&quot;width: 39%;&quot;&gt;&lt;/div&gt;&lt;div class=&quot;count&quot;&gt;39,73%&lt;/div&gt;&lt;/div&gt;&lt;/li&gt;
&lt;li class=&quot;b-rgstats__list_item&quot;&gt;&lt;div class=&quot;inner&quot;&gt;&lt;div class=&quot;title&quot;&gt;Украинский &lt;img title=&quot;Украинский&quot; src=&quot;https://static.test/ua.png&quot; /&gt;&lt;/div&gt;&lt;div class=&quot;bar&quot; style=&quot;width: 3%;&quot;&gt;&lt;/div&gt;&lt;div class=&quot;count&quot;&gt;3,51%&lt;/div&gt;&lt;/div&gt;&lt;/li&gt;
&lt;li class=&quot;b-rgstats__list_item&quot;&gt;&lt;div class=&quot;inner&quot;&gt;&lt;div class=&quot;title&quot;&gt;Дубляж&lt;/div&gt;&lt;div class=&quot;bar&quot; style=&quot;width: 33%;&quot;&gt;&lt;/div&gt;&lt;div class=&quot;count&quot;&gt;33,54%&lt;/div&gt;&lt;/div&gt;&lt;/li&gt;
&lt;li class=&quot;b-rgstats__list_item&quot;&gt;&lt;div class=&quot;inner&quot;&gt;&lt;div class=&quot;title&quot;&gt;Неизвестная&lt;/div&gt;&lt;div class=&quot;bar&quot;&gt;&lt;/div&gt;&lt;div class=&quot;count&quot;&gt;0,55%&lt;/div&gt;&lt;/div&gt;&lt;/li&gt;
&lt;/ul&gt;&lt;div class='b-rgstats__info'&gt;Популярность формируется на основе <b><u>текущих</u></b> предпочтений.&lt;/div&gt;">Не можешь выбрать озвучку?</span></div>`;

  const translations = [
    { id: '111', title: 'HDrezka Studio' },
    { id: '56', title: 'Дубляж' },
    { id: '99', title: 'Украинский' },
  ];

  it('разбирает проценты, сортирует и сопоставляет с переводами', () => {
    expect(parseTranslatorStats(HTML, translations)).toEqual([
      { title: 'HDrezka Studio', percent: 39.73, translationId: '111' },
      { title: 'Дубляж', percent: 33.54, translationId: '56' },
      { title: 'Украинский', percent: 3.51, translationId: '99' },
      { title: 'Неизвестная', percent: 0.55, translationId: undefined },
    ]);
  });

  it('возвращает undefined, если блока нет', () => {
    expect(parseTranslatorStats('<div>нет статистики</div>')).toBeUndefined();
  });
});
